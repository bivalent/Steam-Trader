const getTrades = (req, res, db) => {
  db.select('*').from('steamtrader.trades')
    .then(items => {
      if(items.length){
        res.json(items)
      } else {
        res.json({dataExists: 'false'})
      }
    })
    .catch(err => res.status(400).json({dbError: 'db error'}))
}

const createTrade = (req, res, db) => {
  const { trade_id, steam_id, app_id, assetid, classid, instanceid, inventoryContext, askingPrice } = req.body
  const created_timestamp = new Date()
  db('steamtrader.trades').insert({trade_id, steam_id, app_id, created_timestamp})
    .returning('*')
    .then(item => {
      res.json(item)
    })
    .catch(err => res.status(400).json({dbError: 'db error: ' + err}))
}

const buyTrade = (req, res, db) => {
  const { trade_id, buyer_steam_id } = req.body
  db('steamtrader.trades').where({trade_id}).update({ trade_id, buyer_steam_id })
    .returning('*')
    .then(item => {
      res.json(item)
    })
    .catch(err => res.status(400).json({dbError: 'db error'}))
}

const removeTrade = (req, res, db) => {
  const { trade_id } = req.body
  db('steamtrader.trades').where({trade_id}).del()
    .then(() => {
      res.json({delete: 'true'})
    })
    .catch(err => res.status(400).json({dbError: 'db error'}))
}

module.exports = {
  getTrades,
  createTrade,
  buyTrade,
  removeTrade
}
