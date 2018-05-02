#!/usr/bin/env node

const settings  = require('./settings/Trade-settings.js')
const traderbotDB = require('./framework/db.js')

require('./tools/collection.js')

Buy = async (argv) => {
  try {
    const botDB = await traderbotDB.getTradebotDB()
    await botDB.connect()
    const db = botDB.db

    const exchange = settings.exchanges[argv.exchangeName]
    const symbol   = argv.coin + '/' + exchange.stableCoin

    // if (argv.amount && !argv.price) { // compute the price
    //   const lastPrice = (await getLatest(db, argv.exchangeName, 'lastPrices'))[symbol]
    //   // console.log('lastPrice', lastPrice)
    //   argv.price = lastPrice * 1.01 // buy a fair bit above last price
    //   console.log('no price given: buying at ' + argv.price);
    // }

    const order = {
      symbol: symbol,
      amount: argv.amount,
      price: argv.price,
      orderPrice: argv.orderPrice,
      s: argv.exchangeName,
      t: new Date().getTime(),
      type: 'buy',
      status: 'new',
    }

    console.log(order)
    db.collection('orders').insertOne(order) // no need to await here

    traderbotDB.destroyTradebotDB()
  } catch(ex) {
    console.error(ex);
  }
} // end of Buy()

const opts = { // https://github.com/substack/minimist
  default: {
    'exchangeName': 'poloniex',
    'coin': undefined,
    'amount': undefined,     // in coin
    'price': undefined,      // per coin
    'orderPrice': undefined, // in stableCoin
  },
  alias: {
    'exchangeName': 'x',
    'coin': 'c',
    'amount': 'n',
    'price': 'p',
    'orderPrice': 'o',
  }
}
const argv = require('minimist')(process.argv.slice(2), opts)
// console.dir(argv)

if (!argv.coin||!argv.amount||!argv.price) {
  if(!argv.coin) console.error('No --coin <coin> supplied')
  if(!argv.amount) console.error('No --amount <amount> supplied')
  if(!argv.price) console.error('No --price <price> supplied')
  console.log('');

  console.log('buy.js')
  console.log('  place buy order with given characteristics')
  console.log('options:')
  console.log('--exchangeName -x xxxx (default poloniex)')
  console.log('--coin/-c xxxxx ')
  console.log('--amount/-n xxxxx (in target coin)')
  console.log('--price/-p xxxx (in target coin)')
//  console.log('--orderPrice/-o xxxx (in basecoin)')
  console.log('');
  console.log('example:')
  console.log('  node buy.js --coin GNT --amount xxxx --price yyyy')
} else {
  if (argv.exchangeName=='') argv.exchangeName='poloniex';

  Buy(argv)
}

// --- the end ---
