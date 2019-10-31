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

  // give stranger & the stranger deposits 1 LINK into contract.
  //depositEncoding = 0x1c343d46
  let depositEncoding = web3.utils.keccak256('depositLinkFunds(address,uint256)')
  const depositSelector = depositEncoding.slice(0,4);
  //st.contract.methods.depositLinkFunds(stranger, oneEth).encodeABI()
  // These parameters are used to validate the data was received
  // on the deployed oracle contract. The Job ID only represents
  // the type of data, but will not work on a public testnet.
  // For the latest JobIDs, visit our docs here:
  // https://docs.chain.link/docs/testnet-oracles
  const jobId = web3.utils.toHex('4c7b7ffb66b344fbaa64995af81e355a')
  const oneEth = web3.utils.toWei('1')
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
    askingPrice: oneEth,
  }

  // Represents 1 LINK for testnet requests


  let link, oc, st, tradeId

  // setup contracts and create new trade for testing
  beforeEach(async () => {
    link = await l.linkContract(defaultAccount)
    oc = await Oracle.new(link.address, { from: defaultAccount })
    st = await SteamTrader.new(link.address, { from: consumer })
    await oc.setFulfillmentPermission(oracleNode, true, {
      from: defaultAccount,
    })
    await st.setOracleAddress(oc.address, jobId, {from: consumer})
    tradeId = web3.utils.toHex(uuidv4().replace(/-/g, ''))
    var tx = await st.createTrade(
      tradeId,
      testSeller.steamId,
      testTrade.askingPrice,
      testItem.assetid,
      testItem.classid,
      testItem.instanceid,
      testTrade.appId,
      testTrade.inventoryContext,
      {from: consumer}
    )
    var trade = await st.trade.call(tradeId)
    truffleAssert.eventEmitted(tx, 'TradeCreated', (ev) => {
      return ev.tradeId == tradeId;
    })
    assert.equal(trade.seller.steamId, testSeller.steamId)
    assert.equal(trade.seller.addr, testSeller.addr)
  })

  describe('#depositItemPayment', () => {
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
          from: testBuyer.addr, value: testTrade.askingPrice
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

  describe('#linkDeposits', () => {
    var strangerDeposit;
    var startStrangerLinkWallet;
    beforeEach(async () => {
      assert(await link.transfer(stranger, oneEth), "LINK transfer to Stranger failed.")
      assert(await link.transferAndCall(st.address, oneEth, depositSelector, {from: stranger}), "TransferAndCall(st, 1ETh, depositLinkFunds) failed.")
      strangerDeposit = await st.balanceOfLink(stranger)
      startStrangerLinkWallet = await link.balanceOf(stranger)
    })

    context('when LINK is deposited', () => {
      it('updates the LINK balance on the contract', async() => {
        assert.equal(oneEth, strangerDeposit)
      })
    })
    context('when LINK is withdrawn', () => {
      it('updates the LINK balance on the contract and shows in user wallet', async() => {
        assert.equal(oneEth, strangerDeposit)
        // withdraw all link to stranger
        const tx = await st.withdrawLink(stranger, strangerDeposit, {from: stranger})
        // test transfer happened
        const endingStrangerLinkWallet = await link.balanceOf(stranger)
        const endingDeposit = await st.balanceOfLink(stranger)
        assert.equal(0, endingDeposit);
        assert.equal(oneEth, endingStrangerLinkWallet)
        assert.equal(strangerDeposit, endingStrangerLinkWallet - startStrangerLinkWallet);
      })
      it('reverts when more is requested than the sender has available', async() => {
        await expectRevert.unspecified(
          st.withdrawLink(stranger, strangerDeposit+oneEth, {
            from: stranger
          })
        )
      })
    })
  })

  context('after the item payment is made and link deposited by buyer', () => {
    beforeEach(async() => {
      const tx = await st.buyItem(tradeId, testBuyer.steamId, {
        from: testBuyer.addr, value: oneEth
      })
      // fail if trade not set up for tests
      truffleAssert.eventEmitted(tx, 'FundingSecured', (ev) => {
        return ev.tradeId == tradeId;
      })
      // give user & the user deposits 1 LINK into contract. assert balance is correct
      assert(await link.transfer(stranger, oneEth), "LINK transfer to Stranger failed.")
      assert(await link.transferAndCall(st.address, oneEth, depositSelector, {from: stranger}), "TransferAndCall(st, 1ETh, depositLinkFunds) failed.")
    })

    describe('#startTrade', () => {
      context('withoutRefundLock', () => {
        it('succeeds and locks the sale.', async() => {
          const tx = await st.startTrade(tradeId, {from: testSeller.addr})
          truffleAssert.eventEmitted(tx, 'SaleLocked', (ev) => {
            return ev.tradeId == tradeId;
          })
        })
      })
      context('withRefundLock', () => {
        it('reverts', async() => {
          const tx = await st.requestEthRefund(tradeId, {from: testBuyer.addr})
          truffleAssert.eventEmitted(tx, 'RefundRequested', (ev) => {
            return ev.tradeId == tradeId;
          })
          await expectRevert.unspecified(
            st.startTrade(tradeId, {from: testSeller.addr})
          )
        })
      })
      context('started by non-seller', () => {
        it('reverts', async() => {
          await expectRevert.unspecified(
            st.startTrade(tradeId, {from: testBuyer.addr})
          )
        })
      })
    })

    describe('#requestRefund', () => {
      context('withoutSaleLocked', () => {
        it('succeeds and locks the refund.', async() => {
          const tx = await st.requestEthRefund(tradeId, {from: testBuyer.addr})
          truffleAssert.eventEmitted(tx, 'RefundRequested', (ev) => {
            return ev.tradeId == tradeId;
          })
        })
      })
      context('withSaleLockedIn', () => {
        beforeEach(async() => {
          const tx = await st.startTrade(tradeId, {from: testSeller.addr})
          truffleAssert.eventEmitted(tx, 'SaleLocked', (ev) => {
            return ev.tradeId == tradeId;
          })
        })
        it('reverts', async() => {
          await expectRevert.unspecified(
            st.requestEthRefund(tradeId, {from: testBuyer.addr})
          )
        })
      })
      context('not from buyer', () => {
        it('reverts', async() => {
          await expectRevert.unspecified(
            st.requestEthRefund(tradeId, {from: testSeller.addr})
          )
        })
      })
    })

    describe ('#fulfillTradeItemValidation', () => {
      context('when validation is requested', () => {
        it('reverts for trade not in progress', async() => {
          
        })
      })
    })
    //describe('#fufillTradeConfirmation')
    //describe('#fufillRefundRequest')
  })
})
