const settings = {
    mongo: 'mongodb://localhost:27017/',
    initializeAll: false,
    disabledExchanges: ['cryptopia'],
    buggyOHLCV: ['bitfinex2', 'bitfinex', 'okex', 'acx', 'cex'],
    sentiment: {
        solume: {
            comments: 'https://solume.io/SolumeAPI.pdf',
            url: 'https://api.solume.io/api/coins?auth=<token>',
        },
    },
    exchanges: {
        bitfinex: {
            stableCoin: 'BTC',
            credentials: {
                apiKey: '<apiKey>',
                secret: '<secret>',
            },
        },
        bittrex: {
            stableCoin: 'ETH',
            credentials: {
                apiKey: '<apiKey>',
                secret: '<secret>',
            },
        },
        cryptopia: {
            stableCoin: 'USDT',
            credentials: {
                apiKey: '<apiKey>',
                secret: '<secret>',
            },
        },
        poloniex: {
            stableCoin: 'BTC',
            credentials: {
                apiKey: '<apiKey>',
                secret: '<secret>',
            },
        },
    }, // end of exchanges
} // end of settings

module.exports = settings
