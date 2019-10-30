const SteamTrader = artifacts.require('SteamTrader')
const LinkToken = artifacts.require('LinkToken')

/*
  This script is meant to assist with funding the requesting
  contract with LINK. It will send 5 LINK to the requesting
  contract for ease-of-use. Any extra LINK present on the contract
  can be retrieved by calling the withdrawLink() function.
*/

const payment = process.env.TRUFFLE_CL_BOX_PAYMENT || '5000000000000000000'

module.exports = async callback => {
  const st = await SteamTrader.deployed()
  const tokenAddress = await st.getChainlinkToken()
  const token = await LinkToken.at(tokenAddress)
  console.log('Funding contract:', st.address)
  const tx = await token.transfer(st.address, payment)
  callback(tx.tx)
}
