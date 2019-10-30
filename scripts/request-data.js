const SteamTrader = artifacts.require('SteamTrader')
const uuidv4 = require('uuid/v4')

/*
  This script allows for a Chainlink request to be created from
  the requesting contract. Defaults to my ropsten oracle address
*/

const oracleAddress =
  process.env.TRUFFLE_CL_BOX_ORACLE_ADDRESS ||
  '0x815286136dce0009082c0c1397647583cdc03d95'
const jobId =
  process.env.TRUFFLE_CL_BOX_JOB_ID || '93c4b78e3aa64c2a895473d2e834edb7'
const payment = process.env.TRUFFLE_CL_BOX_PAYMENT || '1000000000000000000'

const user_id = '76561197993433424'
const appid = 570
const context = 2
const assetid = 6908576449
const classid = 948149724
const instanceid = 996698943

/*
bytes32 _uuid,
string calldata _steamId,
uint256 _askingPrice,
// item
uint64 _assetid,
uint64 _classid,
uint64 _instanceid,
// app
uint16 _appId,
uint8 _inventoryContext
*/

module.exports = async callback => {
  const st = await SteamTrader.deployed()
  console.log('Creating request on contract:', mc.address)
  const tradeId = await st.createTrade(
    uuidv4().replace(/-/g, ''),
    user_id,
    payment,
    assetid,
    classid,
    instanceid,
    appid,
    context
  )
  callback(tx.tx)
}
