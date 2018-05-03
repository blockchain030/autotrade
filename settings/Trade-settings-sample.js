const settings = {
    mongo: 'mongodb://localhost:27017/',
    databasename: 'autotrader', // change to 'tradebot' database after importing historical data
    loglevel : 'verbose',          // verbose, info, error etc.
    initializeAll: false,
    disabledExchanges: [],
    buggyOHLCV: [
        'poloniex', // disable ohlcv queries just for the workshop to reduce workload
        'kuna', 'bitfinex2', 'bitfinex', 'okex', 'acx', 'cex', 'btcbox', 'lbank', 'yobit', 'braziliex','livecoin', 'btcbox', 'ice3x'],
    timing: {
      // timing for display
      secondsPerDisplayUpdate: 15,        // index.js - print balance frequency

      // timing for processing
      secondsPerNewOrdersUpdate: 1,       // scan new orders table frequency
      secondsPerOrdersUpdate: 10,         // scan new orders table frequency
      secondsPerLastPricesUpdate: 30,
      secondsPerBalancesUpdate: 60
    },
    autotrade: {
      autoSellOnTrailingStop: false,
      trailingStopFactor: 0.97
    },
    exchanges: {
       

        
        },
    }, // end of exchanges
} // end of settings

module.exports = settings
