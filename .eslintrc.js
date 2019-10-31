module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es6: true,
    mocha: true
  },
  extends: [
    'standard'
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
    artifacts: true,
    contract: true,
    assert: true,
    web3: true
  },
  parserOptions: {
    ecmaVersion: 2018
  },
  rules: {
  }
}
