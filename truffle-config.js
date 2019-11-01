const path = require("path")
const HDWalletProvider = require('truffle-hdwallet-provider')
const fs = require('fs')
let secrets

if (fs.existsSync('.s/.secret')) {
  secrets = JSON.parse(fs.readFileSync('.s/.secret', 'utf8'))
}

module.exports = {
  contracts_build_directory: path.join(__dirname, "client/src/contracts"),
  networks: {
    develop: {
      host: '127.0.0.1',
      port: 9545,
      network_id: '*'
    },
    ropsten: {
      provider: () => {
        return new HDWalletProvider(
          secrets.mnemonic,
          'https://ropsten.infura.io/v3/' + secrets.infuraKey,
        )
      },
      network_id: '3',
    },
    mainnet: {
      provider: () => {
        return new HDWalletProvider(
          secrets.mnemonic,
          'https://mainnet.infura.io/v3/' + secrets.infuraKey,
        )
      },
      network_id: '1',
    },
  },
  compilers: {
    solc: {
      version: '0.5.0',
    },
  },
}
