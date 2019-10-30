const SteamTrader = artifacts.require('SteamTrader')

/*
  This script makes it easy to read the data variable
  of the requesting contract.
*/

module.exports = async callback => {
  const st = await SteamTrader.deployed()
  const data = await st.data.call()
  callback(data)
}
