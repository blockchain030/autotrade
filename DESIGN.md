# tradebot basic design


tradebot uses the following data structures
* instructionslist -> list with all buy/sell sequences and their current status
* instruction -> holds the settings and status for a single buy/sell sequence
  * overall status:
    * NEW - new instruction, not yet processed
    * ACTIVE - buy/sell sequence is active on exchange
    * DONE - instruction done -> see final state for result
    * ERROR - in unknown state
  * source currency
  * target currency
  * amount of source currency to sell
  * buy target rate [source->target]
  * sell target rate [source->target]
  * cancel target rate [source->target]
  * buy limit timestamp
  * sell limit timestamp (always > sell limit timestamp)

* tradetasks -> list with all active trading tasks (ie. tasks that are buying and/or selling target currency)
* tradetask
  - buy order id on exchange
  - sell order id on exchange
  - amount of source currency held
  - amount of target currency held
  - current total amount bought, avg. price
  - current total amount sold, avg. price,
  - current total transaction cost
  - list of buy/sell transactions: timestamp, price, transaction cost

* traderesultlist -> list with the final status for all instructions
  - traderesult
    - TBD (final state, buy/sell prices & timestamps, profit / loss, copy of full instruction info?)

tradebot operates in a continuous loop with the following steps

for all tradetasks

  // monitor buying order
  * if buy order id set -> update tradetask info with buy order info
  * if (current timestamp <= buy limit timestamp)
    - if no buy order id set -> issue limit buy order to exchange
  * if (current timestamp > buy limit timestamp)
    - if buy order id set -> cancel buy order
    - if no target currency bought -> tradetask is done

  // monitor selling order
  * if sell order id set -> update tradetask info with sell order info
    - sell order executed completely? -> tradetask is done
  * if (current timestamp <= sell limit timestamp)
    - if [holding target currency that is not used for a sell order]
      -> issue or update limit/stop loss sell order on exchange
  * if (current timestamp > sell limit timestamp)
    -> issue or update market sell order on exchange







Still to incorporate in design
- partially filled buy orders
- partially filled sell orders
- how to handle orders that are filled in parts with different prices
- parallel buy/sell orders: as soon as possible, start issuing sell orders at the target price (for partially filled buy orders)
