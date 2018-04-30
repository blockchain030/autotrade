#!/usr/bin/env node

const settings  = require('./settings/Trade-settings.js')
const traderbot = require('./framework/db.js')
const ccxt      = require('ccxt')

require('./tools/collection.js')

Buy = async (argv) => {
  try {
    const botDB = await traderbot.getTradebot()
    await botDB.connect()
    const db = botDB.db

    const exchange = settings.exchanges[argv.exchangeName]
    const symbol   = argv.coin + '/' + exchange.stableCoin

    if (argv.amount && !argv.price) { // compute the price
      const lastPrice = (await getLatest(db, argv.exchangeName, 'lastPrices'))[symbol]
      // console.log('lastPrice', lastPrice)
      argv.price = lastPrice * 1.2 // buy a fair bit above last price
    }

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

    traderbot.destroyTradebot()
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

console.log(opts);
return;

if (!argv.coin) {
  console.error('No -c <coin> supplied')
} else {
  // TODO: find exchangeName if none given
  Buy(argv)
}


// --- the end ---
