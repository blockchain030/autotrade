// https://github.com/ccxt/ccxt/wiki/Manual
// https://github.com/ccxt/ccxt#usage

const settings = require('../settings/Trade-settings.js')
const time     = require('../constants/time.js')
const log = require("npmlog");
require('../tools/collection.js')

const ccxt  = require('ccxt')
const chalk = require('chalk')  // https://github.com/chalk/chalk
const sleep = require('wait-promise').sleep
const freegeoip = require('node-freegeoip')

//
const MINIMAL_IN_BTC_VALUE = 0.0000001
const MINIMAL_IN_USD_VALUE = 0.01
const DEFAULT_TAKER_FEE = 0.9975

const SECONDS_PER_BUY_ITERATION  = 20
const SECONDS_PER_SELL_ITERATION = 20

const MIN_PRICE_FACTOR    = 0.001
const MAX_PRICE_FACTOR    = 0.025
const PRICE_FACTOR_FACTOR = 1.8
const SLEEP_FACTOR        = 1.4

const MIN_INTERVAL = 1 * time.MINUTE
const MAX_INTERVAL = 1 * time.DAY

const HUE_STEP = 17
let hue = 0

function setIntervalAfterRandomTimeout(func, interval) {
  function _setInterval(func, interval) {
    // console.log('_setInterval', func, interval)
    func() // start early
    setInterval(func, interval)
  }
  const timeout = Math.random() * interval
  // console.log('setIntervalAfterRandomTimeout', func, interval, timeout)
  setTimeout(_setInterval.bind(this, func, interval), timeout)
}

class liveExchange {
  constructor (botDB, exchangeName) {
    this.chalkColor = chalk.hsl(hue, 100, 50)
    hue = (hue + HUE_STEP) % 360

    this.botDB = botDB
    this.exchangeName = exchangeName

    const x = settings.exchanges[exchangeName]
    const credentials = (x && x.credentials) || {}
    credentials.enableRateLimit = true
    credentials.timeout = 30000
    // credentials.verbose = true
    this.exchange = new ccxt[exchangeName](credentials)
    this.owning = {
      inBTC: 0,
      inUSD: 0,
    }

    if (this.exchange.hasFetchTickers) {
      setIntervalAfterRandomTimeout(this.lastPricesUpdater.bind(this), settings.timing.secondsPerLastPricesUpdate * time.SECOND)

      if (this.exchange.hasFetchOHLCV && this.exchange.timeframes && !settings.buggyOHLCV.includes(this.exchangeName)) {
        // this.log(Object.keys(this.exchange.timeframes))
        for (const timeframe of Object.keys(this.exchange.timeframes)) {
          const timeframeInSeconds = this.timeframeToSeconds(timeframe)
          let interval = Math.max(MIN_INTERVAL, timeframeInSeconds * time.SECOND)
          interval = Math.min(MAX_INTERVAL, interval)
          setIntervalAfterRandomTimeout(this.ohlcvUpdater.bind(this, timeframe, timeframeInSeconds), interval)
        }
      }

      this.initialized = true
      // this.log('initialized')
    } else {
      // this.log('added to disablthis.exchange.markets =ed exchanges (has no fetchTickers)')
      return
    }

    if (x && x.credentials) {
      setIntervalAfterRandomTimeout(this.newOrdersUpdater.bind(this), settings.timing.secondsPerNewOrdersUpdate * time.SECOND)
      setIntervalAfterRandomTimeout(this.balancesUpdater.bind(this), settings.timing.secondsPerBalancesUpdate  * time.SECOND)
      setIntervalAfterRandomTimeout(this.openOrdersUpdater.bind(this), settings.timing.secondsPerOrdersUpdate * time.SECOND)
    }
  } // end of liveExchange.constructor()

  //
  log(...args) {
    // this.constructor.name,
    console.log(this.chalkColor(new Date().toString().substr(0,24), this.exchangeName, ...args))
  }

  //
  async _upsertStatus(what, attr) {
    const apiUrl    = this.exchange.urls.api.current || this.exchange.urls.api.public || this.exchange.urls.api.web || this.exchange.urls.api
    const apiDomain = apiUrl.split('//')[1].split('/')[0]

    if (!apiUrl) console.log(this.exchange)

    if (!this.exchangeNameToLocation)  this.exchangeNameToLocation = {}

    if (!this.exchangeNameToLocation[this.exchangeName]) {
      freegeoip.getLocation(apiDomain, (err, location) => {
        if(err) {
          console.log(err);
          return;
        }
        location.apiUrl    = apiUrl
        location.apiDomain = apiDomain
        this.exchangeNameToLocation[this.exchangeName] = location
        // this.log(JSON.stringify(location, null, 4))
      })
    } // else we already (kind of) know the location of this exchange

    const now = new Date().getTime()
    let status = {
      s: this.exchangeName,
      t: now,
      location: this.exchangeNameToLocation[this.exchangeName],
    }
    status[what] = {
      t: now,
      attr: attr,
    }

    // this.log(JSON.stringify(status, null, 4))
    await this.botDB.db.collection('status').updateOne({s: this.exchangeName}, {$set: status}, {upsert: true})
  }

  //
  async _upsertCoininfo(symbol, highestPrice, now) {
    highestPrice = highestPrice || await this.getLastPrice(symbol)
    if (!now) now = new Date().getTime()
    const coininfo = { // store current high water mark
      s: this.exchangeName,
      symbol: symbol,
      highestPrice: highestPrice,
      highestPriceTimestamp: now,
    }
    // console.log(coininfo)
    /*await*/ this.botDB.db.collection('coininfo').updateOne({s: this.exchangeName, symbol: symbol}, {$set: coininfo}, {upsert: true})
  }

  async singleNewOrderUpdate(orderid) {
    log.verbose('exchange.singleNewOrderUpdate','checking order ' + orderid);
    const result = await this.botDB.db.collection('orders').findAndModify({_id: orderid, status: 'new'},[],{$set: {status: 'order-creation-in-progess'}}, {new:false})
                        // .catch((ex) => {
                        //   this.log('unable to update order status:', ex.message);
                        //   return false;
                        // });
//    this.log('* result:' + JSON.stringify(result, null, 4));
    if(!result||result.ok!=true||!result.value) {
      return false; // unexpected
    }

    const neworder=result.value;

    const now = new Date()

    switch (neworder.type) {
      case 'buy':
        if (!neworder.orderPrice) { // how much BTC/ETC/USDT are we willing to spend (i.e. in stableCoins)
          neworder.orderPrice = await this.getMinOrderPrice(neworder.symbol)
          if (!neworder.orderPrice) {
            this.log('Unknown minimum order price for', neworder.symbol)
            break
          }
        }
        if (neworder.amount && neworder.price) {
          // this.log('Limit buy', neworder.amount, neworder.symbol, 'at max', neworder.price)
          log.info('exchange.singleNewOrderUpdate', 'Limit buy %s %s at max %s', neworder.amount, neworder.symbol, neworder.price);
          var orderinfo = await this.exchange.createLimitBuyOrder(neworder.symbol, neworder.amount, neworder.price)
          // log.verbose('exchange.singleNewOrderUpdate', "%j", orderinfo);
          if(neworder.s=='poloniex'&&orderinfo) {
              var newstatus = orderinfo.info.status=='open'?'open':'error'
              await this.botDB.db.collection('orders').updateOne({_id: neworder._id}, {$set: {status: newstatus, orderId: orderinfo.info.orderNumber}})
          }

          // {"info":{"timestamp":1525356725606,"status":"open","type":"limit","side":"buy","price":0.00004,"amount":4,"orderNumber":"46050891197","resultingTrades":[]},"id":"46050891197","timestamp":1525356725606,"datetime":"2018-05-03T14:12:05.606Z","status":"open","symbol":"GNT/BTC","type":"limit","side":"buy","price":0.00004,"cost":0,"amount":4,"filled":0,"remaining":4,"trades":[]}

        } else {
          // disabled for this demo
          log.error('exchange.singleNewOrderUpdate', 'market buy orders are disabled for this demo')
          // await this.createMarketBuyOrder(neworder.symbol, neworder.orderPrice)
        }
        break

      case 'sell':
        const fsym = neworder.symbol.split('/')[0]
        const balances = await this.getBalances()
        const amount = balances.free[fsym]
        if (amount <= 0) {
          if (balances.total[fsym] > 0) this.log(fsym, 'on exchange but not free to sell')
          else                          this.log('No', fsym, 'on exchange available to sell')
          break
        }
        if (neworder.amount && neworder.price) {
          // this.log('Limit sell', neworder.amount, neworder.symbol, 'at max', neworder.price)
          log.info('exchange.singleNewOrderUpdate', 'Limit sell %s %s at max %s', neworder.amount, neworder.symbol, neworder.price);
          var orderinfo = await this.exchange.createLimitSellOrder(neworder.symbol, neworder.amount, neworder.price);
          if(neworder.s=='poloniex'&&orderinfo) {
              var newstatus = orderinfo.info.status=='open'?'open':'error'
              await this.botDB.db.collection('orders').updateOne({_id: neworder._id}, {$set: {status: newstatus, orderId: orderinfo.info.orderNumber}})
          }
        } else {
          // disabled for this demo
          log.error('exchange.singleNewOrderUpdate', 'market sell orders are disabled for this demo')
          // await this.createMarketSellOrder(neworder.symbol, amount)
        }
        break

      default:
        this.log('Unknown neworder.type', neworder.type)
        this.log(JSON.stringify(neworder, null, 4))
        await this.botDB.db.collection('orders').updateOne({_id: neworder._id}, {$set: {status: 'unknowntype'}})
        break
    } // end of switch (neworder.type)

    return true;
  }

  // process first available order
  async newOrdersUpdater() {
    // this.log('start polling cycle');
    const neworders = await this.botDB.db.collection('orders').find({s: this.exchangeName, status: 'new'}).toArray();
    for (const neworder of neworders) {
       this.singleNewOrderUpdate(neworder._id);
    } // next neworder
  } // end of newOrdersUpdater()

  // Keep trying to buy for more and more money (simulate marketBuy)
  async createMarketBuyOrder(symbol, orderPrice, secondsPerIteration=SECONDS_PER_BUY_ITERATION) {
    let lastPrice = await this.getLastPrice(symbol)
    this._upsertCoininfo(symbol, lastPrice) // make sure what we buy does not gets sold (trailing stop) before we know we have it here

    for (let priceFactor = MIN_PRICE_FACTOR;priceFactor <= MAX_PRICE_FACTOR;priceFactor *= PRICE_FACTOR_FACTOR, lastPrice = await this.getLastPrice(symbol)) {
      const price = lastPrice * (1 + priceFactor)
      const amount = orderPrice / price

      log.info('exchange.createMarketBuyOrder', 'Market buy %s %s at %s [last: %s factor %s]', amount, symbol, price, lastPrice, (1 + priceFactor));
      const result = await this.exchange.createLimitBuyOrder(symbol, amount, price)
      const orderId = result.id
      if (!orderId) { // cryptopia?
        this.setStatus(orderId, 'done', 'exchange.createMarketBuyOrder. Market buy order filled immediately')
        return
      }

      // this.log('sleep', secondsPerIteration)
      await sleep(secondsPerIteration * time.SECOND)
      secondsPerIteration *= SLEEP_FACTOR // just some number to make this work on slow exchanges also

      try {
        const order = await this.exchange.fetchOrder(orderId, symbol)
        if (order.remaining <= 0) {
          this.setStatus(orderId, 'done', 'exchange.createMarketBuyOrder. Market buy order filled')
          return
        }
      } catch (ex) {
        this.setStatus(orderId, 'done', 'exchange.createMarketBuyOrder. Assuming market buy order filled')
        return
      }

      // this.log('order.remaining', order.remaining) // JSON.stringify(order, null, 4))
      await this.cancelOrder(orderId)
    } // next priceFactor

    this.setStatus(orderId, 'failed', 'exchange.createMarketBuyOrder. Market buy order not filled')
  } // end of buy()

  // Keep trying to sell for less and less money (simulate marketSell)
  async createMarketSellOrder(symbol, amount, secondsPerIteration=SECONDS_PER_SELL_ITERATION) {
    for (let priceFactor = MIN_PRICE_FACTOR;priceFactor <= MAX_PRICE_FACTOR;priceFactor *= PRICE_FACTOR_FACTOR) {
      const lastPrice = await this.getLastPrice(symbol)
      const price = lastPrice / (1+priceFactor)

      // this.log('Market sell', amount, symbol, 'at', price, ',', lastPrice, '/', 1+priceFactor)
      log.info('exchange.createMarketSellOrder', 'Market sell %s %s at %s [last: %s factor %s]', amount, symbol, price, lastPrice, (1 + priceFactor));
      const result = await this.exchange.createLimitSellOrder(symbol, amount, price)
      const orderId = result.id
      if (!orderId) { // cryptopia?
        this.setStatus(orderId, 'done', 'exchange.createMarketBuyOrder. Market sell order filled immediately')
        return
      }

      // this.log('sleep', secondsPerIteration)
      await sleep(secondsPerIteration * time.SECOND)
      secondsPerIteration *= SLEEP_FACTOR // just some number to make this work on slow exchanges also

      try {
        const order = await this.exchange.fetchOrder(orderId, symbol)
        if (order.remaining <= 0) {
          this.setStatus(orderId, 'done', 'exchange.createMarketBuyOrder. Market sell order filled')
          return
        }
      } catch (ex) {
        this.setStatus(orderId, 'done', 'exchange.createMarketBuyOrder. Assuming market sell order filled')
        return
      }

      // this.log('order.remaining', order.remaining) // JSON.stringify(order, null, 4))
      await this.cancelOrder(orderId)
    } // next priceFactor

    this.setStatus(orderId, 'failed', 'exchange.createMarketBuyOrder. Market sell order not filled')
  } // end of sell()

  //
  async getMinOrderPrice(symbol) {
    let minOrderPrice = 0.001 // 0.001 BTC = ~18 EURO (late 2017)

    if (['poloniex'].includes(this.exchangeName)) {
      minOrderPrice = 0.0001 // 0.0001 BTC = ~1.8 EURO (late 2017)
    } else if (['cryptopia'].includes(this.exchangeName)) {
      minOrderPrice = 0.0005
    }

    // convert minOrderPrice to tsym/BTC if necessary
    const symbols = symbol.split('/')
    if (symbols[1] !== 'BTC') {
      const toBTCSymbol = symbols[1] + '/BTC'
      const rate = await this.getLastPrice(toBTCSymbol)
      // console.log(toBTCSymbol, 'rate', rate, 'minOrderPrice', minOrderPrice)
      minOrderPrice /= rate
      // console.log(toBTCSymbol, 'new minOrderPrice', minOrderPrice)
    }

    const safetyFactor = 1.1 // 10% extra
    return minOrderPrice * safetyFactor
  } // end of getMinOrderPrice()

  //
  async getCoininfo() {
    const coininfoArray = await this.botDB.db.collection('coininfo').find({s: this.exchangeName}).toArray()
    let coininfo = {}
    for (const ci of coininfoArray) {
      // console.log(ci)
      coininfo[ci.symbol] = ci
    }
    return coininfo
  }

  //
  async lastPricesUpdater() {
    // this.log('lastPricesUpdater')
    this._upsertStatus('lastPricesUpdater', 'start')

    let tickers     = {}
    this.lastPrices = {}

    let timestamp = new Date().getTime()

    try {
      if (!this.lastPricesUpdaterFailedCount) this.lastPricesUpdaterFailedCount = 0 // initialize counter before first run

      tickers = await this.exchange.fetchTickers()
      for (const symbol in tickers) {
        if (symbol.indexOf('$') >= 0) { // note: because we can't store this $$$/BTC in Mongo
          // this.log('delete', symbol)
          delete tickers[symbol]
          continue
        }
        const t          = tickers[symbol].timestamp
        const now        = new Date().getTime()
        const dTimestamp = Math.abs(t - now)
        if (dTimestamp < time.DAY) timestamp = t // use the timestamp from the exchange if it seems to make sense
        this.lastPrices[symbol] = tickers[symbol].last
      }

      this.lastPricesUpdaterFailedCount = 0 // reset counter after succesful run
    } catch (ex) {
      // this.log('lastPricesUpdater', ex.message)
      if (++this.lastPricesUpdaterFailedCount == 3) { // only output error message in structural cases
        this.log('lastPricesUpdater failed >=', this.lastPricesUpdaterFailedCount, 'time(s) in a row')
      }
      this._upsertStatus('lastPricesUpdater', {failedCount: this.lastPricesUpdaterFailedCount})
      return
    }

    const coininfo = await this.getCoininfo()
    for (const symbol in tickers) {
      const lastPrice = await this.getLastPrice(symbol)
      if (!lastPrice) continue

      if (!coininfo[symbol] || lastPrice > coininfo[symbol].highestPrice) {
        // this.log('new highest price for', symbol, lastPrice)
        this._upsertCoininfo(symbol, lastPrice, timestamp)
      }
    } // next ticker symbol

    this.lastPrices.s = this.exchangeName
    this.lastPrices.t = timestamp

    /*await*/ this.botDB.db.collection('lastPrices').insertOne(this.lastPrices)
    // this.log(JSON.stringify(this.lastPrices))

    this._upsertStatus('lastPricesUpdater', 'end')
  } // end of lastPricesUpdater()

  //
  timeframeToSeconds(timeframe) {
    let letter = timeframe.slice(-1)
    let number = parseInt(timeframe.substr(0, timeframe.indexOf(letter)), 10) / time.SECOND

    switch (letter) { // 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M
      case 'm': number *= time.MINUTE; break
      case 'h': number *= time.HOUR;   break
      case 'd': number *= time.DAY;    break
      case 'w': number *= time.WEEK;   break
      case 'M': number *= time.MONTH;  break
      case 'Y': number *= time.YEAR;   break
      default:
        this.log('Unknown letter in timeframe', timeframe)
        break
    }

    return number
  }

  //
  async ohlcvUpdater(timeframe, timeframeInSeconds) {
    if (!this.exchange.markets) return

    if (!this.inOhlcvUpdater) this.inOhlcvUpdater = {}

    if (this.inOhlcvUpdater[timeframeInSeconds]) {
      // this.log('ohlcvUpdater', timeframeInSeconds, 'already running', JSON.stringify(this.inOhlcvUpdater))
      return
    }

    this.inOhlcvUpdater[timeframeInSeconds] = true
    // this.log('ohlcvUpdater', /*timeframe,*/ timeframeInSeconds, JSON.stringify(this.inOhlcvUpdater))

    let nAdded = 0
    const start = new Date().getTime()
    const collectionName = 'ohlcv'+timeframeInSeconds
    this._upsertStatus(collectionName, 'start')

    try {
      if (!this.ohlcvUpdaterFailedCount) this.ohlcvUpdaterFailedCount = 0 // initialize counter before first run

      const rateLimit = this.exchange.rateLimit * (this.exchangeName === 'bitfinex' ? 6 : 1)

      // what is the latest ohlcv information we have
      const latest = await getLatest(this.botDB.db, this.exchangeName, collectionName) // TODO: cache this
      const since = latest ? latest.t : 0
      // this.log(collectionName, Object.keys(this.exchange.markets).length + 'x', rateLimit + 'ms. after', since)

      for (const symbol of Object.keys(this.exchange.markets)) {
        try {
          const candlesticks = await this.exchange.fetchOHLCV(symbol, timeframe, since+1)
          for (const candlestick of candlesticks) { // candlestick=[timestamp,open,high,low,close,volume]
            if (candlestick[0] <= since) {
              this.log(collectionName, symbol, candlestick[0], '<=', since)
              continue
            }

            let ohlcv = {
              s: this.exchangeName, // (s)ource
              t: candlestick[0],    // (t)imestamp
              // f: timeframeInSeconds, // time(f)rame
            }
            ohlcv[symbol] = candlestick.slice(1), // remove timestampe, keep [open,high,low,close,volume]

            await this.botDB.db.collection(collectionName).insertOne(ohlcv) // note: use await here to prefent nodejs to stack overflow
            // this.log(collectionName, JSON.stringify(ohlcv))
            nAdded++
          } // next candlestick

          // this.log(collectionName, symbol, 'added', Object.keys(candlesticks).length)
        } catch (ex) {
          if (ex.message.includes('Unknown asset pair') ||
              ex.message.includes('trading_pair_not_found') ||
              ex.message.includes('Invalid asset pair') ||
              ex.message.includes('candle_not_found') ||
              ex.message.includes('not accessible from this location') ||
              ex.message.includes('Currency pair does not exist') ||
              ex.message.includes('EService:Unavailable')) {
                // ignore this message because it often is a rateLimit issue that corrects itself at the next iteration
          } else {
            this.log(collectionName, 'ohlcvUpdater error for', symbol, ':', ex.message)
          }
        }
      } // next symbol

      this.ohlcvUpdaterFailedCount = 0 // reset counter after succesful run
    } catch (ex) {
      this.log('ohlcvUpdater', ex.message)
      if (++this.ohlcvUpdaterFailedCount == 3) { // only output error message in structural cases
        this.log('ohlcvUpdater failed >=', this.ohlcvUpdaterFailedCount, 'time(s) in a row')
      }
      this.inOhlcvUpdater[timeframeInSeconds] = false
      this._upsertStatus(collectionName, {failedCount: this.ohlcvUpdaterFailedCount})
      return
    }

    if (nAdded) {
      this.log(collectionName, 'took', (new Date().getTime() - start) / time.SECOND, 'seconds with', nAdded, "ohlcv's added")
      // this.log(JSON.stringify(this.ohlcv), 'took', (now - start) / time.SECOND, 'seconds')
    }

    this.inOhlcvUpdater[timeframeInSeconds] = false
    this._upsertStatus(collectionName, 'end')
  } // end of ohlcvUpdater()

  // TODO: we could adjust trailingStopFactor based on the steepness and duration of the prior price increase so we react quicker when expect an agressive price correction
  async getTrailingStopFactor() {
    return settings.autotrade.trailingStopFactor;
  }

  //
  async balancesUpdater() {
    // this.log('balancesUpdater')

    try {
      if (!this.balanceUpdaterFailedCount) this.balanceUpdaterFailedCount = 0 // initialize counter before first run
      this.balances = await this.exchange.fetchBalance()
      this.balanceUpdaterFailedCount = 0 // reset counter after succesful run
    } catch (ex) {
      this.log('balancesUpdater', ex.message)
      if (++this.balanceUpdaterFailedCount == 3) { // only output error message in structural cases
        this.log('balancesUpdater failed >=', this.balanceUpdaterFailedCount, 'time(s) in a row')
      }
      return
    }

    for (const k in this.balances) {
      if (k.indexOf('$') >= 0) { // note: because we can't store this $$$/BTC in Mongo
        // this.log('delete', k)
        delete this.balances[k]
      }
    }

    // console.log(this.balances)

    this.balances.s = this.exchangeName     // (s)ource
    this.balances.t = new Date().getTime()  // (t)imestamp

    /*await*/ this.botDB.db.collection('balances').insertOne(this.balances)

    // print all non-empty balances
    const coininfo = await this.getCoininfo()
    this.owning = {
      inBTC: 0,
      inUSD: 0,
    }

    const btc2usdt = (await this.getLastPrice('BTC/USDT')) || (await this.getLastPrice('BTC/USD'))
    let nOwnings = 0

    for (const fsym in this.balances.total) {
      const total = this.balances.total[fsym]
      if (total <= 0 ||
        (['SNT', 'ANT'].includes(fsym) && total === 1) ||
        (fsym === 'USDT' && total < MINIMAL_IN_USD_VALUE)) {
        continue
      }

      let inBTC = total

      const stableCoin = settings.exchanges[this.exchangeName].stableCoin
      let btcSymbol = fsym + '/BTC'
      const lastPriceInBTC = btcSymbol==='BTC/BTC'?1.0:await this.getLastPrice(btcSymbol)

      if (!lastPriceInBTC) {
          log.verbose('exchange.balancesUpdater', "error - unable to retrieve last market price for %s on %s. Update aborted", fsym, this.exchangeName);
          this.owning.inUSD = "??"
          this.owning.inBTC = "??"
          return false;
      }

      const fees = DEFAULT_TAKER_FEE // because eventually we need to exchange to BTC
      inBTC = total * lastPriceInBTC * fees
      if (inBTC < MINIMAL_IN_BTC_VALUE) continue
      this.owning.inBTC += inBTC
      const btcValueString = inBTC + ' BTC'
      const usdValueString = fsym === 'USDT' ? '' : inBTC*btc2usdt + ' USD'

      const free = this.balances.free[fsym] // while selling we still own a 'total' but have less 'free' available to trade
      const isReserved = free > 0 ? '' : '[reserved]'

      log.verbose('exchange.balancesUpdater', "[%s] %s: currently owning %s / %s %s", this.exchangeName, fsym, usdValueString, btcValueString, isReserved);

      nOwnings++

      if (settings.autotrade.autoSellOnTrailingStop) {
        // did the fsym/stableCoin symbol price drop significantly in price
        const stableCoinSymbol = fsym + '/' + stableCoin
        const highestPrice = coininfo[stableCoinSymbol] ? coininfo[stableCoinSymbol].highestPrice : undefined
        const lastPrice = await this.getLastPrice(stableCoinSymbol)

        if (highestPrice && lastPrice && fsym !== stableCoin && free > 0) {
          const factor = lastPrice / highestPrice
          const trailingStopFactor = await this.getTrailingStopFactor()
          // console.log(stableCoinSymbol, lastPrice, highestPrice, factor)
          if (factor < trailingStopFactor) {
            const order = {
              symbol: stableCoinSymbol,
              s: this.exchangeName,     // (s)ource
              t: new Date().getTime(),  // (t)imestamp
              type: 'sell',
              status: 'new',
            }

            // this.log('Sell all', stableCoinSymbol, 'because it dropped', (100-factor*100)+'% below highest price')
            log.verbose('exchange.balancesUpdater', "[%s] selling all %s because it dropped %s % below highest price", this.exchangeName, stableCoinSymbol, (100-factor*100));

            // console.log(order)
            this.botDB.db.collection('orders').insertOne(order) // no need to await here
          } // else don't sell because still close to highest price
        }
      } // next fsym
    } // next symbol

    this.owning.inUSD = this.owning.inBTC * btc2usdt

    if (nOwnings > 1) {
      // this.log('Owning equivalent of', this.owning.inBTC, 'BTC (' + this.owning.inUSD, 'USD)')
      log.verbose('exchange.balancesUpdater', '[%s] Current total balance is %s %s / %s %s', this.exchangeName, this.owning.inUSD, 'USD', this.owning.inBTC, 'BTC')
    }

    return true;
  } // end of balancesUpdater()

  getOwning() {
    return this.owning
  }

  // process first available order
  async openOrdersUpdater() {
    // this.log('start polling cycle');
    const openorders = await this.botDB.db.collection('orders').find({s: this.exchangeName, status: 'open'}).toArray();
    for (const openorder of openorders) {
        if(openorder.s=='poloniex'&&openorder.orderId) {
          try {
            const order = await this.exchange.fetchOrder(openorder.orderId, openorder.symbol)
            if(order.status=='closed') {
              this.setStatus(openorder.orderId, 'done', 'exchange.openOrdersUpdater. Order reported closed on exchange [' + openorder._id + ']')
            }
          } catch (ex) {
            this.setStatus(openorder.orderId, 'done', 'exchange.openOrdersUpdater. Order not found on exchange: assuming order filled [' + openorder._id + ']')
          }
        }
    } // next neworder
  } // end of newOrdersUpdater()

  async getOrderList(includehistory=false) {
    var filter = "";
    if(!includehistory) {
      filter = { $and: [{s: this.exchangeName}, {$or: [{status: 'new'}, {status: 'order-creation-in-progess'}, {status: 'open'}]} ]} //
    } else {
      filter = {s: this.exchangeName}
    }

    var orders = await this.botDB.db.collection('orders').find(filter ).toArray();
    var output = [];
    for (const order of orders) {
      var tmporder = {};
      switch(order.type) {
      case 'buy':
        tmporder = {
          id: order._id,
          exchange: order.s,
          timestamp: new Date(order.t),
          description: order.type + ' ' + order.amount + ' ' + order.symbol + ' [price:' + order.price + ']',
          status: order.status
        }
        break;
      case 'sell':
        tmporder = {
          id: order._id,
          exchange: order.s,
          timestamp: new Date(order.t),
          description: order.type + ' ' + order.amount + ' ' + order.symbol + ' [price:' + order.price + ']',
          status: order.status
        }
        break;
      default:
        tmporder = {
          id: order._id,
          exchange: order.s,
          timestamp: new Date(order.t),
          description: order.type + ' unknown order type ',
          status: order.status
        }
        break;
      }

      output.push(tmporder)
    }

    return output;
  } // end of getOrderList()

  async setStatus(orderId, status, infoMessage=undefined) {
    await this.botDB.db.collection('orders').updateOne({orderId: orderId}, {$set: {status: status}})
    if (infoMessage) log.info('exchange.setStatus', infoMessage);
  }

  async cancelOrder(orderId) {
    // this.log('Cancel order', orderId)
    const cancelResult = await this.exchange.cancelOrder(orderId)
    if (cancelResult.Success || cancelResult.success || ['bitfinex'].includes(this.exchangeName)) {
      await this.setStatus(orderId, 'canceled', 'Cancelled order ' + orderId)
    } else {
      await this.setStatus(orderId, 'cancel-failed', 'Cancel order ' + orderId + ' failed')
      // console.log(cancelResult)
    }
  }

  //
  async getLastPrices() {
    if (!this.lastPrices)  await this.lastPricesUpdater()
    return this.lastPrices
  }

  async getLastPrice(symbol) {
    // this.log('getLastPrice', symbol)
    const lastPrices = await this.getLastPrices()
    if (!lastPrices) {
      this.log('No last prices')
      return undefined
    }
    // if (!lastPrices[symbol])  this.log('Last price not found for', symbol)
    return lastPrices[symbol]
  }

  //
  async getBalances() {
    if (!this.balances)  await this.balancesUpdater()
    return this.balances
  }
} // end of class liveExchange


//
module.exports = {
  liveExchange : liveExchange
}
