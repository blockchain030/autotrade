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

    traderbotDB.destroyTradebotDB()
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
  console.log('');

  console.log('sell.js - sells all <coin> at current market price')
  console.log('options:')
  console.log('--exchangeName -x xxxx (default poloniex)')
  console.log('--coin/-c xxxxx')
  console.log('');
  console.log('example:')
  console.log('  node sell.js --coin GNT')
} else {
  // TODO: find exchangeName if none given
  Sell(argv.exchangeName, argv.coin)
}

// --- the end ---
