let MyContract = artifacts.require('SteamTrader')

module.exports = (deployer, network) => {
  // Local (development) networks need their own deployment of the LINK
  // token and the Oracle contract
  if (!network == 'ropsten' && !network == 'mainnet') {
    // Being lazy, do nothing...
  } else {
    // For live networks, use the 0 address to allow the ChainlinkRegistry
    // contract automatically retrieve the correct address for you
    deployer.deploy(SteamTrader, '0x0000000000000000000000000000000000000000')
  }
}
