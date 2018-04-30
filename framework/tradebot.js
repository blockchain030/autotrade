class tradeitem {
  constructor() {
    this.id = 999; // get new id from database (incremental)

    this.buyorder_id = null;
    this.sellorder_id = null;
  }

  status() {
    var statusstr = '';

  }
}

class tradebot{
  constructor (exchange) {
    this.exchange = exchange;
    this.tradeitems = [];

    this.db = new tradebotDB();
    this.db.connect();
  }

  async add_tradeitem(instruction) {
    //
    this.tradeitems.push(tradeitem);
  }

  get_status() {
    var status = [];

    this.tradeitems.forEach((item)=>{
      status.push[{'id': item.id, 'status': item.status];
    })

    return status;
  }

  async do_epoch() {

    // get tradetask id list from database

    // for all tradetasks

    // load tradetask
    //
    //   // monitor buying order
    //   * if buy order id set -> update tradetask info with buy order info
    //   * if (current timestamp <= buy limit timestamp)
    //     - if no buy order id set -> issue limit buy order to exchange
    //   * if (current timestamp > buy limit timestamp)
    //     - if buy order id set -> cancel buy order
    //     - if no target currency bought -> tradetask is done
    //
    //   // monitor selling order
    //   * if sell order id set -> update tradetask info with sell order info
    //     - sell order executed completely? -> tradetask is done
    //   * if (current timestamp <= sell limit timestamp)
    //     - if [holding target currency that is not used for a sell order]
    //       -> issue or update limit/stop loss sell order on exchange
    //   * if (current timestamp > sell limit timestamp)
    //     -> issue or update market sell order on exchange
  }
}

module.exports = {
  tradebot : tradebot,
  liveExchange : liveExchange
}
