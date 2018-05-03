#!/usr/bin/env node
const Papa= require('babyparse')
const ccxt = require('ccxt')

const settings = require('./settings/Trade-settings.js')

const exchange = require('./framework/exchange.js');
const db = require('./framework/db.js');

liverun = async () => {
  async function totalsDisplay() {
    // console.log('totalsDisplay', liveExchanges.length)
    var totalInBTC = 0
    var totalInUSD = 0

    for (const liveExchange of liveExchanges) {
      const owning = await liveExchange.getOwning()
      totalInBTC += owning.inBTC
      totalInUSD += owning.inUSD
    }

    if (totalInBTC || totalInUSD) {
      console.log('Owning total equivalent of', totalInBTC, 'BTC,', totalInUSD, 'USD')
    }

    setTimeout(totalsDisplay, settings.timing.secondsPerDisplayUpdate * 1000)
  } // end of totalsDisplay()

  let liveExchanges = []

  try {
    const botDB = await db.getTradebotDB()
    await botDB.connect()

    const exchanges = settings.initializeAll ? ccxt.exchanges : Object.keys(settings.exchanges)
    const disabledExchanges = (settings.disabledExchanges || []).concat(['southxchange', 'yunbi', 'bter', 'tidex', 'jubi', 'bxinth', 'btcexchange', 'xbtce', 'bleutrade'])
    let nInitializedExchanges = 0

    for (const exchangeName of exchanges) {

      if (disabledExchanges.indexOf(exchangeName) >= 0) {
        console.log('skipping disabled exchange ', exchangeName)
        continue
      } else {
        console.log('initializing', exchangeName)
      }

      const liveExchange = new exchange.liveExchange(botDB, exchangeName)
      if (!liveExchange.initialized) {
        console.log('unable to initialize', exchangeName, '(skipped)' );
        continue
      }
      liveExchanges.push(liveExchange)
      nInitializedExchanges++
    }

    console.log(nInitializedExchanges + ' exchange(s) initialized')

    totalsDisplay();
  } catch(ex) {
    console.error(ex);
  }
} // end of liverun()

test_mongo = async () => {
  try {
    let botDB = await db.getTradebotDB();
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
  console.log('Welcome to autotrader')
  liverun()
} else {
  console.error('error: this scripts can only be run when settings.mongo starts with', requiredMongo)
}

// --- the end ---
