const getTableData = (req, res, db) => {
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

const postTableData = (req, res, db) => {
  const { trade_id, steam_id, app_id } = req.body
  const created_timestamp = new Date()
  db('steamtrader.trades').insert({trade_id, steam_id, app_id, created_timestamp})
    .returning('*')
    .then(item => {
      res.json(item)
    })
    .catch(err => res.status(400).json({dbError: 'db error: ' + err}))
}

const putTableData = (req, res, db) => {
  const { trade_id, buyer_steam_id } = req.body
  db('steamtrader.trades').where({trade_id}).update({ trade_id, buyer_steam_id })
    .returning('*')
    .then(item => {
      res.json(item)
    })
    .catch(err => res.status(400).json({dbError: 'db error'}))
}

const deleteTableData = (req, res, db) => {
  const { trade_id } = req.body
  db('steamtrader.trades').where({trade_id}).del()
    .then(() => {
      res.json({delete: 'true'})
    })
    .catch(err => res.status(400).json({dbError: 'db error'}))
}

module.exports = {
  getTableData,
  postTableData,
  putTableData,
  deleteTableData
}
