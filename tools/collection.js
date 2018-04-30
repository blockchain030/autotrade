///
const TICKER_META   = ['_id', 's', 't']

  
//
getAll = async (db, source, collection) => {
    return (await db.collection(collection).find({s: source}).sort({t: -1}).toArray())
}


//
getFirst = async (db, source, collection) => {
    return (await db.collection(collection).find({s: source}).sort({t: 1}).limit(1).toArray())[0]
}


//
getLatest = async (db, source, collection) => {
    return (await db.collection(collection).find({s: source}).sort({t: -1}).limit(1).toArray())[0]
}


// sorted by timestamp in ascending order
getSince = async (db, source, collection, since) => {
    return await db.collection(collection).find({s: source, t: {$gte: since}}).sort({t: 1}).toArray()
}


//
// All kind of tools to work with the tickers
//


//
getHeaders = (doc) => {
    let header = {}
    for (const h of TICKER_META) header[h] = doc[h]
    return header
}


//
getSymbols = (doc) => {
    // console.log('getSymbols', stableCoin)
    let symbols = {}

    if (!doc) {
        // console.warn('getSymbols received no doc')
        return symbols
    }

    for (const symbol of Object.keys(doc)) {
        if (TICKER_META.includes(symbol)) continue
        const [fsym, tsym] = symbol.split('/')
        // console.log('SPLIT', fsym, 'AND', tsym)
        if (stableCoin && fsym !== stableCoin && tsym !== stableCoin && tsym !== undefined) {
            continue // XXX if fsym === stableCoin the mooning algorithm might not work as expected!!!
        }
        symbols[symbol] = doc[symbol]
        // console.log(symbol, '...', doc[symbol])
    }

    return symbols
} // end of getSymbols()


//
array2dict = (array, key) => {
    let dict = {}
    for (const elem of array) {
        // console.log(elem)
        dict[elem[key]] = elem
    }
    return dict
} // end of array2dict


//
dict2arraySortedByKey = (dict, key) => {
    return Object.values(dict).sort((a,b) => a[key] - b[key])
}


//
dict2arraySortedByWeight = (dict, key1, key2, key2Weight=1) => {
    return Object.values(dict).sort((a,b) => a.weight - b.weight)
}


//
module.exports = {
    getAll, getAll,
    getLatest: getLatest,
    getSince: getSince,
    getHeaders: getHeaders,
    getSymbols: getSymbols,
    array2dict : array2dict,
    dict2arraySortedByKey: dict2arraySortedByKey,
    dict2arraySortedByWeight: dict2arraySortedByWeight,
}
