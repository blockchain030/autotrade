const gMongoClient = require('mongodb').MongoClient; // http://mongodb.github.io/node-mongodb-native/3.0/
const settings  = require('../settings/Trade-settings.js')

var gTraderbot = null;

class traderbotDB{
  constructor(mongo) {
    this.name = "autotrader"
    this.url = settings.mongo + this.name;
    this.db = null;
  }

  async connect() {
    // console.log('connect')
    this.mongo = await gMongoClient.connect(this.url);
    this.db = await this.mongo.db(this.name);
    // this.mongo.close();

    // if (this.db.collection) console.log('connected')
    return true;
  }

  async close() {
    if(this.mongo!=null) {
      //  console.log('close mongo!');
       return await this.mongo.close();
    }

    return true;
  }

  async testdb() {
    var myobj = { name: "Company Inc", address: "Highway 37" };
    // console.log(this.db, myobj);
    return await this.db.collection("customers").insertOne(myobj);
  }
}

function getTradebot() {
  if (gTraderbot==null) {
    // console.log('create new traderbotDB')
    gTraderbot = new traderbotDB();
    // gTraderbot.connect(); // note: this should be await...
  }

  return gTraderbot;
}

function destroyTradebot() {
  if (gTraderbot!=null) {
    // console.log('destroy traderbot');
    gTraderbot.close();
    gTraderbot = null;
  }
}

module.exports = {
  getTradebot:getTradebot,
  destroyTradebot:destroyTradebot,
  traderbotDB:traderbotDB
}
