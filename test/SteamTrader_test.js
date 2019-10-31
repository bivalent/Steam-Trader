// eslint-disable-next-line @typescript-eslint/no-var-requires
const h = require('chainlink').helpers
const l = require('./helpers/linkToken')
const truffleAssert = require('truffle-assertions');
const uuidv4 = require('uuid/v4');

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
  const ethFeePerc = 5
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
    addr: consumer,
    steamId: sellerSteamId,
  }

  var testTrade = {
    buyer: testBuyer,
    seller: testSeller,
    appId: appId,
    inventoryContext: inventoryContext,
    item: testItem,
    askingPrice: web3.utils.toWei('1'),
  }

  // Represents 1 LINK for testnet requests
  const payment = web3.utils.toWei('1')

  let link, oc, st, tradeId

  // setup contracts and create new trade for testing
  beforeEach(async () => {
    link = await l.linkContract(defaultAccount)
    oc = await Oracle.new(link.address, { from: defaultAccount })
    st = await SteamTrader.new(link.address, { from: consumer })
    await oc.setFulfillmentPermission(oracleNode, true, {
      from: defaultAccount,
    })
    tradeId = web3.utils.toHex(uuidv4().replace(/-/g, ''))
    var tx = await st.createTrade(
      tradeId,
      testSeller.steamId,
      payment,
      assetid,
      classid,
      instanceid,
      appId,
      inventoryContext,
      {from: consumer}
    )
    var trade = await st.trade.call(tradeId)
    truffleAssert.eventEmitted(tx, 'TradeCreated', (ev) => {
      return ev.tradeId == tradeId;
    })
    assert.equal(trade.seller.steamId, testSeller.steamId)
    assert.equal(trade.seller.addr, testSeller.addr)
  })

  describe('#buyItem', () => {
    context('without ETH', () => {
      it('reverts', async () => {
        await expectRevert.unspecified(
          st.buyItem(tradeId, testBuyer.steamId, {
            from: stranger
          })
        )
      })
    })

    context('with ETH', () => {
      let request
      it('triggers a buy event in the steam trader contract', async () => {
        const tx = await st.buyItem(tradeId, testBuyer.steamId, {
          from: stranger, value: payment
        })

        var trade = await st.trade.call(tradeId)
        // test trade updated
        assert.equal(trade.buyer.steamId, testBuyer.steamId)
        assert.equal(trade.buyer.addr, testBuyer.addr)

        // test event emitted
        truffleAssert.eventEmitted(tx, 'FundingSecured', (ev) => {
          return ev.tradeId == tradeId;
        })
      })
    })
  })

  describe('#startTrade', () => {
    beforeEach(async () => {
      const tx = await st.buyItem(tradeId, testBuyer.steamId, {
        from: stranger, value: payment
      })
      // fail if trade not set up for tests
      truffleAssert.eventEmitted(tx, 'FundingSecured', (ev) => {
        return ev.tradeId == tradeId;
      })
    })

    context('withoutRefundLock', () => {
      it('succeeds and sends buyer money minus the fee.', async() => {

      })
    })

    context('withRefundLock', () => {
      it('reverts', async() => {

      })
    })
  })

  describe('#requestRefund', () => {
    context('withoutSaleLocked', () => {
      it('succeeds and sends buyer money minus the fee.', async() => {

      })
    })
  })

  describe('#fulfill', () => {
    const expected = 50000
    const response = web3.utils.toHex(expected)
    let request

    beforeEach(async () => {
      await link.transfer(st.address, web3.utils.toWei('1', 'ether'))
      const tx = await st.createRequestTo(
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
      const currentPrice = await st.data.call()
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

      it('does not astept the data provided', async () => {
        await expectRevert.unspecified(
          h.fulfillOracleRequest(oc, request, response, {
            from: oracleNode,
          }),
        )
      })
    })

    context('when called by anyone other than the oracle contract', () => {
      it('does not astept the data provided', async () => {
        await expectRevert.unspecified(
          st.fulfill(request.id, response, { from: stranger }),
        )
      })
    })
  })

  describe('#cancelRequest', () => {
    let request

    beforeEach(async () => {
      await link.transfer(st.address, web3.utils.toWei('1', 'ether'))
      const tx = await st.createRequestTo(
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
          st.cancelRequest(
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
            st.cancelRequest(
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
          await st.cancelRequest(
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
      await link.transfer(st.address, web3.utils.toWei('1', 'ether'))
    })

    context('when called by a non-owner', () => {
      it('cannot withdraw', async () => {
        await expectRevert.unspecified(st.withdrawLink({ from: stranger }))
      })
    })

    context('when called by the owner', () => {
      it('transfers LINK to the owner', async () => {
        const beforeBalance = await link.balanceOf(consumer)
        assert.equal(beforeBalance, '0')
        await st.withdrawLink({ from: consumer })
        const afterBalance = await link.balanceOf(consumer)
        assert.equal(afterBalance, web3.utils.toWei('1', 'ether'))
      })
    })
  })
})
