let SteamTrader = artifacts.require('SteamTrader')
let LinkToken = artifacts.require('chainlink/v0.5/contracts/interfaces/ChainlinkRequestInterface.sol')
let Oracle = artifacts.require('Oracle')

module.exports = (deployer, network) => {
  // Local (development) networks need their own deployment of the LINK
  // token and the Oracle contract
  if (!network.startsWith('ropsten') && !network.startsWith('mainnet')) {
    deployer.deploy(LinkToken).then(() => {
      return deployer.deploy(Oracle, LinkToken.address).then(() => {
        return deployer.deploy(SteamTrader, LinkToken.address)
      })
    })
  } else {
    // For live networks, use the 0 address to allow the ChainlinkRegistry
    // contract automatically retrieve the correct address for you
    deployer.deploy(SteamTrader, '0x0000000000000000000000000000000000000000')
  }
}
