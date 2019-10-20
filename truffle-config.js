const HDWalletProvider = require('truffle-hdwallet-provider')
const fs = require('fs');
let secrets;

if (fs.existsSync('.secret')) {
 secrets = JSON.parse(fs.readFileSync('.secret', 'utf8'));
}
module.exports = {
  networks: {
    dev: {
      host: '127.0.0.1',
      port: 7545,
      network_id: '*',
    },
    ropsten: {
      provider: () => {
        return new HDWalletProvider(secrets.mnemonic, 'https://ropsten.infura.io/v3/' + secrets.infuraApiKey)
      },
      network_id: '3',
      // Necessary due to https://github.com/trufflesuite/truffle/issues/1971
      // Should be fixed in Truffle 5.0.17
      skipDryRun: true,
    },
    mainnet: {
      provider: () => {
        return new HDWalletProvider(secrets.mnemonic, 'https://mainnet.infura.io/v3/' + secrets.infuraApiKey)
      },
      network_id: '1',
      // Necessary due to https://github.com/trufflesuite/truffle/issues/1971
      // Should be fixed in Truffle 5.0.17
      skipDryRun: true,
    }
  },
  compilers: {
    solc: {
      version: '0.5.8',
    },
  },
}
