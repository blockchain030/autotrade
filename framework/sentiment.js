const settings = require('../settings/Trade-settings.js')
const fetch = require('node-fetch')

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR   = 60 * MINUTE
const DAY    = 24 * HOUR
const WEEK   =  7 * DAY

solumeUpdateSentiment = async (db, url) => {
  // console.log('solumeUpdateSentiment')

  const result = await fetch(url)
  const json   = await result.json()
  // console.log(json)

  json.s = 'solume'               // (s)ource
  json.t =  new Date().getTime()  // (t)imestamp
  
  /*await*/ db.collection('sentiment').insertOne(json)
} // end of solumeOnce()

function solume(db) {
  const sentiment = settings.sentiment
  if (!sentiment || !sentiment.solume) return console.warn('no settings.sentiment.solume')
  
  solumeUpdateSentiment(db, sentiment.solume.url)
  setInterval(solumeUpdateSentiment.bind(this, db, sentiment.solume.url), 1*HOUR)
} // end of solume()

module.exports = {
  solume: solume,
}
