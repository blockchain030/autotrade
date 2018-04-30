#!/usr/bin/env node
const Papa= require('babyparse')
const ccxt = require('ccxt')

const settings = require('./settings/Trade-settings.js')
// console.log(settings)

const instructionListFilename = './data/instructionList.json'

const sentiment = require('./framework/sentiment.js');
const exchange = require('./framework/exchange.js');
const db = require('./framework/db.js');
const fs = require('fs')


const readFile = (path, opts = 'utf8') =>
    new Promise((res, rej) => {
        fs.readFile(path, opts, (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })

const writeFile = (path, data, opts = 'utf8') =>
    new Promise((res, rej) => {
        fs.writeFile(path, data, opts, (err) => {
            if (err) rej(err)
            else res()
        })
    })

const saveInstructionList = async (instructionList) => {
  try {
    return await writeFile(instructionListFilename, JSON.stringify(instructionList,0,2));
  } catch(e) {
    console.log('error while saving instructionList');
    return false;
  }
}

const loadInstructionList = async () => {
  try {
    var content = await readFile(instructionListFilename);
    return JSON.parse(content);
  } catch(ex) {
    console.log('error while loading instruction list: ' + ex);
    return false;
  }
}

const loadTickerData = (filename) => {
    var parsed = Papa.parseFiles(filename);

    info = parsed.data[0];
    header = parsed.data[1];

    var tickerData = [];
    var symbol = info[4].replace(/symbol=/g, '');
    var message = info[5];
    var minLast = null;
    var maxLast = null;
    for(rowindex=2;rowindex<parsed.data.length-1;rowindex++) {
      var row = parsed.data[rowindex];
      var ts = Date.parse(row[3]);
      var last = row[4];

      tickerData.push({'ts':ts, 'last':last});

      if(minLast==null||minLast>last) minLast=last;
      if(maxLast==null||maxLast<last) maxLast=last;
    }

    console.log("symbol: " + symbol);
    console.log("message: " + message);
    console.log("min: " + minLast);
    console.log("max: " + maxLast);

    return tickerData;
}

const processSingleInstruction = async (exchange, instruction, timestamp) => {
  if(timestamp==null) {
    console.log('using live date!');
    timestamp=Date.new();
  }

  var exchangerate = await exchange.getLastPrice(instruction.exchange, instruction.fsym, instruction.tsym, timestamp);
  // console.log(timestamp + '/' + exchangerate + ' | ' + (exchangerate - instruction.minSellPrice));

  var timespan = (timestamp - instruction.tsissued);
  switch(instruction.state) {
    case 'NEW':
      if (timespan>instruction.maxBuyTime*1000) {
        instruction.state = 'ABORTED';
        instruction.info = {};
        console.log('exchangerate',exchangerate )
        instruction.info.tsbought = timestamp;
        instruction.info.lastrate = exchangerate;
        console.log("ABORTED (timeout on buy after " + timespan/1000 + " seconds) " + JSON.stringify(instruction,0,2));
        console.log(JSON.stringify(instruction,0,2));
      } else if(exchangerate <= instruction.maxBuyPrice) {
          instruction.state = 'BOUGHT';
          instruction.info = {};
          instruction.info.tsbought = timestamp;
          instruction.info.boughtAt=exchangerate;
          instruction.info.boughtAmount=instruction.fAmount/exchangerate;
          console.log("BOUGHT " + instruction.info.boughtAmount + " " + instruction.tsym + "@" + instruction.info.boughtAt);
          console.log(JSON.stringify(instruction,0,2));
      }

      break;
    case 'BOUGHT':
      if (timespan>instruction.maxSellTime*1000) {
        instruction.state = 'DONE_EXPIRED';
        instruction.info.tssold = timestamp;
        instruction.info.soldAt=exchangerate;
        instruction.info.finalAmount=instruction.info.boughtAmount*exchangerate;

        console.log("SOLD (EXPIRED) " + instruction.tsym + "@" + instruction.info.soldAt + " TO " + instruction.info.finalAmount + " " + instruction.tsym);
        console.log(JSON.stringify(instruction,0,2));
      } else if(exchangerate <= instruction.stopLossPrice) {
        instruction.state = 'DONE_STOPLOSS';
        instruction.info.tssold = timestamp;
        instruction.info.soldAt=exchangerate;
        instruction.info.finalAmount=instruction.info.boughtAmount*exchangerate;

        console.log("SOLD (STOPLOSS) " + instruction.tsym + "@" + instruction.info.soldAt + " TO " + instruction.info.finalAmount + " " + instruction.tsym);
        console.log(JSON.stringify(instruction,0,2));
      } else if(exchangerate >= instruction.minSellPrice) {
        instruction.state = 'DONE_OK';
        instruction.info.tssold = timestamp;
        instruction.info.soldAt=exchangerate;
        instruction.info.finalAmount=instruction.info.boughtAmount*exchangerate;

        console.log("SOLD (OK) " + instruction.tsym + "@" + instruction.info.soldAt + " TO " + instruction.info.finalAmount + " " + instruction.tsym);
        console.log(JSON.stringify(instruction,0,2));
      }

      break;
    case 'DONE_OK':
    case 'DONE_STOPLOSS':
    case 'DONE_EXPIRED':
    case 'ABORTED':
      break;

    default:
      console.log('unknown state for instruction ' + instruction.state)
  }
}

const doProcessing = async (exchange, timestamp = null) => {
  var instructionList = await loadInstructionList();
  if(false==instructionList) {
    console.log('Unable to load instructionList.')
  } else {
    for(var i=0; i<instructionList.length;i++) {
      var instruction = instructionList[i];
      await processSingleInstruction(exchange, instruction, timestamp);
      // console.log(timestamp + '\n' + JSON.stringify(instruction));
    };

    // console.log(instructionList);
    await saveInstructionList(instructionList);
  }
}

const go_tickerdata = async (exchange, tickerdata) => {
  for(var i=0;i<tickerData.length;i++) {
    // console.log('waited ' + (tickerData[i].ts-tickerData[0].ts)/1000 + ' seconds' );
    await doProcessing(exchange, tickerData[i].ts);

    // if ((tickerData[i].ts-tickerData[0].ts) > 60*1000) {
    //   break;
    // }
  };

  instructionList2 = await loadInstructionList();
  console.log(JSON.stringify(instructionList2,0,2));
} // end of go_tickerdata()


//const tickerData = loadTickerData('../data/dario/csv_logs/BitcoinInsiders_NXC_1209073550_ready_enhanced.csv');
// const instructionList = [
//   { 'tsissued': tickerData[0].ts,
//     'exchange': 'poloniex',
//     'fsym': 'BTC',
//     'tsym': 'ETH',
//     'fAmount':1,      // spend this amount of fsym
//     'maxBuyPrice':0.000015,  // highest tsym price to pay, otherwise do not execute buy order
//     'maxBuyTime':120,   // [seconds] buy before tsissued + this time interval, otherwise do not execute buy order
//     'minSellPrice':0.000024, // sell for at least this tsym price, otherwise do not execute sell order
//     'stopLossPrice':0.000014, // sell immediately at this price when tsym price drops below this price
//     'maxSellTime':1800,    // [seconds] sell immediately at any price when after tsissued + this time interval
//     'state': 'NEW',
//     // 'info': {
//     //   'boughtAt':0,
//     //   'boughtAmount':0,
//     //   'soldAt':0,
//     //   'finalAmount': 0,
//     //   'lastrate':0
//     // }
//   },
//   // { 'tsissued': tsNow,
//   //   'exchange': 'poloniex',
//   //   'fsym': 'BTC',
//   //   'tsym': 'NXT'
//   // },
// ]

simulationrun = async () => {
  const tickerData = loadTickerData('./data/dario/csv_logs/fastsignals_EXP_1209092323_ready_enhanced.csv');
  const instructionList = [
    { 'tsissued': tickerData[0].ts,
      'exchange': 'poloniex',
      'fsym': 'BTC',
      'tsym': 'EXP',
      'fAmount':1,      // spend this amount of fsym
      'maxBuyPrice':0.00013260,  // highest tsym price to pay, otherwise do not execute buy order
      'maxBuyTime':3600,   // [seconds] buy before tsissued + this time interval, otherwise do not execute buy order
      'minSellPrice':0.000146, // sell for at least this tsym price, otherwise do not execute sell order
      'stopLossPrice':0.00013000, // sell immediately at this price when tsym price drops below this price
      'maxSellTime':7200,    // [seconds] sell immediately at any price when after tsissued + this time interval
      'state': 'NEW',
      // 'info': {
      //   'boughtAt':0,
      //   'boughtAmount':0,
      //   'soldAt':0,
      //   'finalAmount': 0,
      //   'lastrate':0
      // }
    },
    // { 'tsissued': tsNow,
    //   'exchange': 'poloniex',
    //   'fsym': 'BTC',
    //   'tsym': 'NXT'
    // },
  ]

  var theexchange = new exchange.simulatedExchange(tickerData);

  if(!saveInstructionList(instructionList)) {
    console.log('Unable to save initial instructionList.')
  }

  go_tickerdata(exchange, tickerdata);
}


const go_live = async (exchange) => {
  console.log('go_live')
}


liverun = async (secondsPerTotalsDisplay=5 * 60) => {
  function totalsDisplay() {
    // console.log('totalsDisplay', liveExchanges.length)
    totalInBTC = 0
    totalInUSD = 0

    for (const liveExchange of liveExchanges) {
      const owning = liveExchange.getOwning()
      totalInBTC += owning.inBTC
      totalInUSD += owning.inUSD
    }

    if (totalInBTC || totalInUSD) {
      console.log('Owning total equivalent of', totalInBTC, 'BTC,', totalInUSD, 'USD')
    }
  } // end of totalsDisplay()

  let liveExchanges = []

  try {
    const botDB = await db.getTradebot()
    await botDB.connect()

    sentiment.solume(botDB.db)

    const exchanges = settings.initializeAll ? ccxt.exchanges : Object.keys(settings.exchanges)
    const disabledExchanges = (settings.disabledExchanges || []).concat(['southxchange', 'yunbi', 'bter', 'tidex', 'jubi', 'bxinth', 'btcexchange', 'xbtce', 'bleutrade'])
    let nInitializedExchanges = 0

    for (const exchangeName of exchanges) {
      if (disabledExchanges.indexOf(exchangeName) >= 0) continue
      const liveExchange = new exchange.liveExchange(botDB, exchangeName)
      if (!liveExchange.initialized) continue
      liveExchanges.push(liveExchange)
      nInitializedExchanges++
    }

    setInterval(totalsDisplay, secondsPerTotalsDisplay * 1000)
    console.log(nInitializedExchanges + ' exchanges initialized')
  } catch(ex) {
    console.error(ex);
  }
} // end of liverun()

test_mongo = async () => {
  try {
    let botDB = await db.getTradebot();
    await botDB.connect();

    // if(!botDB) return false;
    // console.log(botDB.db.collection("status"));
    await botDB.testdb();
    // botDB.close();

    db.destroyTradebot();
    return true;
  } catch(ex) {
    console.error(ex);
  }
}


// test_mongo()

const requiredMongo = 'mongodb://localhost:'
if (settings.mongo.startsWith(requiredMongo)) {
  liverun()
} else {
  console.error('error: this scripts can only be run when settings.mongo starts with', requiredMongo)
}


// --- the end ---
