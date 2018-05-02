#!/usr/bin/env node

const settings  = require('./settings/Trade-settings.js')
const traderbotDB = require('./framework/db.js')

Sell = async (exchangeName, coin) => {
  try {
    const botDB = await traderbotDB.getTradebotDB()
    await botDB.connect()
    const db = botDB.db

    const exchange = settings.exchanges[exchangeName]

    const now = new Date()
    const order = {
      symbol: coin + '/' + exchange.stableCoin,
      s: exchangeName,
      t: now.getTime(),
      type: 'sell',
      status: 'new',
    }

    console.log(order)
    db.collection('orders').insertOne(order) // no need to await here

    traderbotDB.destroyTradebot()
  } catch(ex) {
    console.error(ex);
  }
} // end of Buy()


const opts = { // https://github.com/substack/minimist
  default: {
    'exchangeName': 'poloniex',
    'coin': undefined,
  },
  alias: {
    'exchangeName': 'x',
    'coin': 'c'
  }
}
const argv = require('minimist')(process.argv.slice(2), opts)
// console.dir(argv)

if (!argv.coin) {
  console.error('No -c <coin> supplied')
} else {
  // TODO: find exchangeName if none given
  Sell(argv.exchangeName, argv.coin)
}


// --- the end ---
