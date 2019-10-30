// eslint-disable-next-line @typescript-eslint/no-var-requires
const h = require('chainlink').helpers
const l = require('./helpers/linkToken')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { expectRevert, time } = require('openzeppelin-test-helpers')

contract('SteamTrader', accounts => {
  const Oracle = artifacts.require('Oracle.sol')
  const SteamTrader = artifacts.require('SteamTrader.sol')

  const defaultAccount = accounts[0]
  const oracleNode = accounts[1]
  const stranger = accounts[2]
  const consumer = accounts[3]

  // These parameters are used to validate the data was received
  // on the deployed oracle contract. The Job ID only represents
  // the type of data, but will not work on a public testnet.
  // For the latest JobIDs, visit our docs here:
  // https://docs.chain.link/docs/testnet-oracles
  const jobId = web3.utils.toHex('4c7b7ffb66b344fbaa64995af81e355a')

  const sellerSteamId = '76561197993433424'
  const buyerSteamId = '76561197993433424'
  const appId = 470
  const inventoryContext = 2
  const assetid = 6908576449
  const classid = 948149724
  const instanceid = 996698943

  var testItem = {
    assetid: assetid,
    classid: classid,
    instanceid: instanceid,
  }
  var testBuyer = {
    addr: stranger,
    steamId: buyerSteamId,
  }
  var testSeller = {
    addr: defaultAccount,
    steamId: sellerSteamId,
  }
  var testTrade = {
    tradeId: '098098-123123-1asdasf-123asf',
    buyer: testBuyer,
    seller: testSeller,
    appId: appId,
    inventoryContext: inventoryContext,
    item: testItem,
    askingPrice: web3.utils.toWei('1'),
  }

  // Represents 1 LINK for testnet requests
  const payment = web3.utils.toWei('1')

  let link, oc, cc

  beforeEach(async () => {
    link = await l.linkContract(defaultAccount)
    oc = await Oracle.new(link.address, { from: defaultAccount })
    cc = await SteamTrader.new(link.address, { from: consumer })
    await oc.setFulfillmentPermission(oracleNode, true, {
      from: defaultAccount,
    })
  })
  /*
  address _oracle,
  bytes32 _jobId,
  uint256 _payment,
  Trade memory _trade,
  bool _buyer
  */
  describe('#createRequest', () => {
    context('without LINK', () => {
      it('reverts', async () => {
        await expectRevert.unspecified(
          cc.checkSteamInventory(oc.address, jobId, payment, testTrade, false, {
            from: consumer,
          }),
        )
      })
    })

    context('with LINK', () => {
      let request

      beforeEach(async () => {
        await link.transfer(cc.address, web3.utils.toWei('1', 'ether'))
      })

      context('sending a request to a specific oracle contract address', () => {
        it('triggers a log event in the new Oracle contract', async () => {
          const tx = await cc.createRequestTo(
            oc.address,
            jobId,
            payment,
            testTrade,
            false,
            { from: consumer },
          )
          request = h.decodeRunRequest(tx.receipt.rawLogs[3])
          assert.equal(oc.address, tx.receipt.rawLogs[3].address)
          assert.equal(
            request.topic,
            web3.utils.keccak256(
              'OracleRequest(bytes32,address,bytes32,uint256,address,bytes4,uint256,uint256,bytes)',
            ),
          )
        })
      })
    })
  })

  describe('#fulfill', () => {
    const expected = 50000
    const response = web3.utils.toHex(expected)
    let request

    beforeEach(async () => {
      await link.transfer(cc.address, web3.utils.toWei('1', 'ether'))
      const tx = await cc.createRequestTo(
        oc.address,
        jobId,
        payment,
        testTrade,
        false,
        { from: consumer },
      )
      request = h.decodeRunRequest(tx.receipt.rawLogs[3])
      await h.fulfillOracleRequest(oc, request, response, { from: oracleNode })
    })

    it('records the data given to it by the oracle', async () => {
      const currentPrice = await cc.data.call()
      assert.equal(
        web3.utils.toHex(currentPrice),
        web3.utils.padRight(expected, 64),
      )
    })

    context('when my contract does not recognize the request ID', () => {
      const otherId = web3.utils.toHex('otherId')

      beforeEach(async () => {
        request.id = otherId
      })

      it('does not accept the data provided', async () => {
        await expectRevert.unspecified(
          h.fulfillOracleRequest(oc, request, response, {
            from: oracleNode,
          }),
        )
      })
    })

    context('when called by anyone other than the oracle contract', () => {
      it('does not accept the data provided', async () => {
        await expectRevert.unspecified(
          cc.fulfill(request.id, response, { from: stranger }),
        )
      })
    })
  })

  describe('#cancelRequest', () => {
    let request

    beforeEach(async () => {
      await link.transfer(cc.address, web3.utils.toWei('1', 'ether'))
      const tx = await cc.createRequestTo(
        oc.address,
        jobId,
        payment,
        testTrade,
        false,
        { from: consumer },
      )
      request = h.decodeRunRequest(tx.receipt.rawLogs[3])
    })

    context('before the expiration time', () => {
      it('cannot cancel a request', async () => {
        await expectRevert(
          cc.cancelRequest(
            request.id,
            request.payment,
            request.callbackFunc,
            request.expiration,
            { from: consumer },
          ),
          'Request is not expired',
        )
      })
    })

    context('after the expiration time', () => {
      beforeEach(async () => {
        await time.increase(300)
      })

      context('when called by a non-owner', () => {
        it('cannot cancel a request', async () => {
          await expectRevert.unspecified(
            cc.cancelRequest(
              request.id,
              request.payment,
              request.callbackFunc,
              request.expiration,
              { from: stranger },
            ),
          )
        })
      })

      context('when called by an owner', () => {
        it('can cancel a request', async () => {
          await cc.cancelRequest(
            request.id,
            request.payment,
            request.callbackFunc,
            request.expiration,
            { from: consumer },
          )
        })
      })
    })
  })

  describe('#withdrawLink', () => {
    beforeEach(async () => {
      await link.transfer(cc.address, web3.utils.toWei('1', 'ether'))
    })

    context('when called by a non-owner', () => {
      it('cannot withdraw', async () => {
        await expectRevert.unspecified(cc.withdrawLink({ from: stranger }))
      })
    })

    context('when called by the owner', () => {
      it('transfers LINK to the owner', async () => {
        const beforeBalance = await link.balanceOf(consumer)
        assert.equal(beforeBalance, '0')
        await cc.withdrawLink({ from: consumer })
        const afterBalance = await link.balanceOf(consumer)
        assert.equal(afterBalance, web3.utils.toWei('1', 'ether'))
      })
    })
  })
})
