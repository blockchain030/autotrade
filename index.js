#!/usr/bin/env node
const log = require("npmlog");
const Papa= require('babyparse')
const ccxt = require('ccxt')

const settings = require('./settings/Trade-settings.js')

const exchange = require('./framework/exchange.js');
const db = require('./framework/db.js');

liverun = async () => {
  async function totalsDisplay() {
    var totalInBTC = 0
    var totalInUSD = 0

    for (const liveExchange of liveExchanges) {
      const owning = await liveExchange.getOwning()
      if(owning.inBTC=='??'||owning.inUSD=='??') {
        totalInBTC="??"
        totalInUSD="??"
        break;
      }

      totalInBTC += owning.inBTC
      totalInUSD += owning.inUSD
    }

    if (totalInBTC || totalInUSD) {
      log.info('index.totalsDisplay','Portfolio value is %s %s / %s %s', totalInUSD, 'USD', totalInBTC, 'BTC')
    }

    setTimeout(totalsDisplay, settings.timing.secondsPerDisplayUpdate * 1000)
  } // end of totalsDisplay()

  async function ordersDisplay() {
    for (const liveExchange of liveExchanges) {
      try {
        var showhistory = true;
        var orders = await liveExchange.getOrderList(showhistory);
        for(const order of orders) {
          log.info('index.ordersDisplay','%s %s [%s] - %s [%s]', order.exchange, order.id, order.status, order.description, (new Date(order.timestamp)).toLocaleString());
        }
      } catch(ex) {
        console.log(ex);
      }
    }
    setTimeout(ordersDisplay, settings.timing.secondsPerDisplayUpdate * 1000)
  } // end of ordersDisplay()

  let liveExchanges = []

  try {
    const botDB = await db.getTradebotDB()
    await botDB.connect()

    totalsDisplay();
    ordersDisplay();

    const exchanges = settings.initializeAll ? ccxt.exchanges : Object.keys(settings.exchanges)
    const disabledExchanges = (settings.disabledExchanges || []).concat(['southxchange', 'yunbi', 'bter', 'tidex', 'jubi', 'bxinth', 'btcexchange', 'xbtce', 'bleutrade'])
    let nInitializedExchanges = 0

    for (const exchangeName of exchanges) {

      if (disabledExchanges.indexOf(exchangeName) >= 0) {
        log.info('index.liveExchanges','skipping disabled exchange ', exchangeName)
        continue
      } else {
        log.info('index.liveExchanges','initializing', exchangeName)
      }

      const liveExchange = new exchange.liveExchange(botDB, exchangeName)
      if (!liveExchange.initialized) {
        log.info('index.liveExchanges','unable to initialize', exchangeName, '(skipped)' );
        continue
      }
      liveExchanges.push(liveExchange)
      nInitializedExchanges++
    }

    log.info('index.liveExchanges', '%s exchange(s) initialized', nInitializedExchanges)

  } catch(ex) {
    console.error(ex);
  }
} // end of liverun()

log.level = settings.loglevel;

const requiredMongo = 'mongodb://localhost:'
if (settings.mongo.startsWith(requiredMongo)) {
  log.info('index.main','Welcome to autotrader')
  liverun()
} else {
  log.error('index.main', 'error: this script can only be run when settings.mongo starts with %s', requiredMongo)
}
// --- the end ---
