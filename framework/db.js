const gMongoClient = require('mongodb').MongoClient; // http://mongodb.github.io/node-mongodb-native/3.0/
const settings  = require('../settings/Trade-settings.js')

var gTraderbotDB = null;

class traderbotDB{
  constructor(mongo) {
    this.name = settings.databasename;
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
       return await this.mongo.close();
    }

    return true;
  }
}

function getTradebotDB() {
  if (gTraderbotDB==null) {
    gTraderbotDB = new traderbotDB();
  }

  return gTraderbotDB;
}

function destroyTradebotDB() {
  if (gTraderbotDB!=null) {
    // console.log('destroy traderbot');
    gTraderbotDB.close();
    gTraderbotDB = null;
  }
}

module.exports = {
  getTradebotDB:getTradebotDB,
  destroyTradebotDB:destroyTradebotDB,
  traderbotDB:traderbotDB
}
