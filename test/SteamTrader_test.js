// eslint-disable-next-line @typescript-eslint/no-var-requires
const h = require('chainlink').helpers
const l = require('./helpers/linkToken')
const truffleAssert = require('truffle-assertions')
const uuidv4 = require('uuid/v4')
const evmTrue =
  '0x0000000000000000000000000000000000000000000000000000000000000001'
const evmFalse =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { expectRevert, time, expectEvent } = require('openzeppelin-test-helpers')

contract('SteamTrader', accounts => {
  const Oracle = artifacts.require('Oracle.sol')
  const ChainlinkClient = artifacts.require('ChainlinkClient.sol')
  const SteamTrader = artifacts.require('SteamTrader.sol')

  const defaultAccount = accounts[0]
  const oracleContractOwner = accounts[1]
  const stranger = accounts[2]
  const consumer = accounts[3]
  const strangerNotInTrade = accounts[4]

  // give stranger & the stranger deposits 1 LINK into contract.
  //depositEncoding = 0x1c343d46
  let depositEncoding = web3.utils.keccak256(
    'depositLinkFunds(address,uint256)',
  )
  const depositSelector = depositEncoding.slice(0, 4)
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

  let link, oc, st, cc, tradeId, nonExistantTradeId

  // setup contracts and create new trade for testing
  beforeEach(async () => {
    link = await l.linkContract(defaultAccount)
    oc = await Oracle.new(link.address, { from: oracleContractOwner })
    cc = await ChainlinkClient.new({ from: defaultAccount })
    st = await SteamTrader.new(link.address, { from: consumer })

    await oc.setFulfillmentPermission(consumer, true, {
      from: oracleContractOwner,
    })
    tradeId = web3.utils.toHex(uuidv4().replace(/-/g, ''))
    nonExistantTradeId = web3.utils.toHex(uuidv4().replace(/-/g, ''))
    var tx = await st.createTrade(
      tradeId,
      testSeller.steamId,
      testTrade.askingPrice,
      testItem.assetid,
      testItem.classid,
      testItem.instanceid,
      testTrade.appId,
      testTrade.inventoryContext,
      { from: consumer },
    )
    var trade = await st.trade.call(tradeId)
    truffleAssert.eventEmitted(tx, 'TradeCreated', ev => {
      return ev.tradeId == tradeId
    })
    assert.equal(trade.seller.steamId, testSeller.steamId)
    assert.equal(trade.seller.addr, testSeller.addr)
  })

  describe('#depositItemPayment', () => {
    context('without ETH', () => {
      it('reverts', async () => {
        await expectRevert.unspecified(
          st.buyItem(tradeId, testBuyer.steamId, {
            from: stranger,
          }),
        )
      })
    })

    context('with ETH', () => {
      it('triggers a buy event in the steam trader contract', async () => {
        const tx = await st.buyItem(tradeId, testBuyer.steamId, {
          from: testBuyer.addr,
          value: testTrade.askingPrice,
        })

        var trade = await st.trade.call(tradeId)
        // test trade updated
        assert.equal(trade.buyer.steamId, testBuyer.steamId)
        assert.equal(trade.buyer.addr, testBuyer.addr)

        // test event emitted
        truffleAssert.eventEmitted(tx, 'FundingSecured', ev => {
          return ev.tradeId == tradeId
        })
      })
      it('reverts for trade not in progress', async () => {
        await expectRevert.unspecified(
          st.buyItem(nonExistantTradeId, testBuyer.steamId, {
            from: testBuyer.addr,
            value: testTrade.askingPrice,
          }),
        )
      })
    })
  })

  describe('#linkDeposits', () => {
    var strangerDeposit
    var startStrangerLinkWallet
    beforeEach(async () => {
      assert(
        await link.transfer(stranger, oneEth),
        'LINK transfer to Stranger failed.',
      )
      assert(
        await link.transferAndCall(st.address, oneEth, depositSelector, {
          from: stranger,
        }),
        'TransferAndCall(st, 1ETh, depositLinkFunds) failed.',
      )
      strangerDeposit = await st.balanceOfLink(stranger)
      startStrangerLinkWallet = await link.balanceOf(stranger)
    })

    context('when LINK is deposited', () => {
      it('updates the LINK balance on the contract', async () => {
        assert.equal(oneEth, strangerDeposit)
      })
    })
    context('when LINK is withdrawn', () => {
      it('updates the LINK balance on the contract and shows in user wallet', async () => {
        assert.equal(oneEth, strangerDeposit)
        // withdraw all link to stranger
        const tx = await st.withdrawLink(stranger, strangerDeposit, {
          from: stranger,
        })
        // test transfer happened
        const endingStrangerLinkWallet = await link.balanceOf(stranger)
        const endingDeposit = await st.balanceOfLink(stranger)
        assert.equal(0, endingDeposit)
        assert.equal(oneEth, endingStrangerLinkWallet)
        assert.equal(
          strangerDeposit,
          endingStrangerLinkWallet - startStrangerLinkWallet,
        )
      })
      it('reverts when more is requested than the sender has available', async () => {
        await expectRevert.unspecified(
          st.withdrawLink(stranger, strangerDeposit + oneEth, {
            from: stranger,
          }),
        )
      })
    })
  })

  context('after the item payment is made and link deposited by buyer', () => {
    beforeEach(async () => {
      await st.setOracleAddress(oc.address, jobId, { from: consumer })
      const tx = await st.buyItem(tradeId, testBuyer.steamId, {
        from: testBuyer.addr,
        value: oneEth,
      })
      // give user & the user deposits 1 LINK into contract. assert balance is correct
      assert(
        await link.transfer(testBuyer.addr, oneEth),
        'LINK transfer to Stranger failed.',
      )
      assert(
        await link.transferAndCall(st.address, oneEth, depositSelector, {
          from: testBuyer.addr,
        }),
        'TransferAndCall(st, 1ETh, depositLinkFunds) failed.',
      )
    })

    describe('#startTrade', () => {
      context('withoutRefundLock', () => {
        it('succeeds and locks the sale.', async () => {
          const tx = await st.startTrade(tradeId, { from: testSeller.addr })
          truffleAssert.eventEmitted(tx, 'SaleLocked', ev => {
            return ev.tradeId == tradeId
          })
        })
        it('reverts for trade not in progress', async () => {
          await expectRevert.unspecified(
            st.startTrade(nonExistantTradeId, { from: testSeller.addr }),
          )
        })
      })
      context('withRefundLock', () => {
        it('reverts', async () => {
          const tx = await st.requestEthRefund(tradeId, {
            from: testBuyer.addr,
          })
          truffleAssert.eventEmitted(tx, 'RefundRequested', ev => {
            return ev.tradeId == tradeId
          })
          await expectRevert.unspecified(
            st.startTrade(tradeId, { from: testSeller.addr }),
          )
        })
      })
      context('started by non-seller', () => {
        it('reverts', async () => {
          await expectRevert.unspecified(
            st.startTrade(tradeId, { from: testBuyer.addr }),
          )
        })
      })
    })
    describe('#requestRefund', () => {
      context('withoutSaleLocked', () => {
        it('succeeds and locks the refund.', async () => {
          const tx = await st.requestEthRefund(tradeId, {
            from: testBuyer.addr,
          })
          truffleAssert.eventEmitted(tx, 'RefundRequested', ev => {
            return ev.tradeId == tradeId
          })
        })
        it('reverts for trade not in progress', async () => {
          await expectRevert.unspecified(
            st.requestEthRefund(nonExistantTradeId, { from: testBuyer.addr }),
          )
        })
        it('reverts when not from buyer', async () => {
          await expectRevert.unspecified(
            st.requestEthRefund(tradeId, { from: testSeller.addr }),
          )
        })
      })
      context('withSaleLockedIn', () => {
        beforeEach(async () => {
          const tx = await st.startTrade(tradeId, { from: testSeller.addr })
          truffleAssert.eventEmitted(tx, 'SaleLocked', ev => {
            return ev.tradeId == tradeId
          })
        })
        it('reverts', async () => {
          await expectRevert.unspecified(
            st.requestEthRefund(tradeId, { from: testBuyer.addr }),
          )
        })
      })
    })
    describe('#checkSteamInventory', () => {
      context('When it creates a chainlink request', () => {
        it('Updates requestTracker correctly on success', async () => {
          const tx = await st.requestTradeItemValidation(tradeId, {
            from: stranger,
          })
          let reqId, matchingTradeId
          truffleAssert.eventEmitted(tx, 'ChainlinkRequested', ev => {
            reqId = ev.id
            return true
          })
          matchingTradeId = await st.requestTracker.call(reqId)
          assert.equal(tradeId, matchingTradeId)
        })
      })
    })

    describe('#requestTradeItemValidation', () => {
      context('when validation is requested', () => {
        it('reverts for trade not in progress', async () => {
          await expectRevert.unspecified(
            st.requestTradeItemValidation(nonExistantTradeId, {
              from: testSeller.addr,
            }),
          )
        })
        it('reverts if sender has not enough link (1) deposited', async () => {
          // our beforeEach sends link to stranger. confirm consumer has zero then run
          var consumerLinkBalance = await link.balanceOf(consumer)
          assert.equal(0, consumerLinkBalance)
          await expectRevert.unspecified(
            st.requestTradeItemValidation(tradeId, { from: consumer }),
          )
        })
        it('Creates chainlink request on successful call', async () => {
          const tx = await st.requestTradeItemValidation(tradeId, {
            from: stranger,
          })
          truffleAssert.eventEmitted(tx, 'ChainlinkRequested')
        })
      })
    })
    describe('#fulfillTradeItemValidation', () => {
      let tx, reqId, txFulfill, request, rawLogs
      beforeEach(async () => {
        // make oracle request
        tx = await st.requestTradeItemValidation(tradeId, {
          from: testBuyer.addr,
        })
        truffleAssert.eventEmitted(tx, 'ChainlinkRequested', ev => {
          reqId = ev.id
          return true
        })
        request = h.decodeRunRequest(tx.receipt.rawLogs[3])
      })
      context('When oracle returns item is found', () => {
        const response = evmTrue
        beforeEach(async () => {
          txFulfill = await h.fulfillOracleRequest(oc, request, response, {
            from: oracleContractOwner,
          })
          rawLogs = txFulfill.receipt.rawLogs
        })
        it('Emits ChainlinkFulfilled(bytes32) when oracle fulfills', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('ChainlinkFulfilled(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(txFulfill.receipt.rawLogs[i].topics[1], reqId)
        })
        it('Emits SellerHasItem(tradeId) when oracle returns true', async () => {
          var tradeStatus = await st.tradeStatus.call(tradeId)
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('SellerHasItem(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(txFulfill.receipt.rawLogs[i].topics[1], tradeId)
          assert(tradeStatus.sellerHoldsItem)
        })
      })
      context('When oracle returns item is _not_ found', () => {
        const response = evmFalse
        beforeEach(async () => {
          txFulfill = await h.fulfillOracleRequest(oc, request, response, {
            from: oracleContractOwner,
          })
          rawLogs = txFulfill.receipt.rawLogs
        })
        it('Emits ChainlinkFulfilled(bytes32) when oracle fulfills false', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('ChainlinkFulfilled(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(txFulfill.receipt.rawLogs[i].topics[1], reqId)
        })
        it('Does not emit SellerHasItem(tradeId) when oracle returns false', async () => {
          var tradeStatus = await st.tradeStatus.call(tradeId)
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('SellerHasItem(bytes32)');
            i++
          ) {}
          assert.equal(i, rawLogs.length, 'Event found in RawLogs.')
          assert(!tradeStatus.sellerHoldsItem)
        })
      })
    })

    describe('#requestTradeConfirmation', () => {
      before(async () => {
        assert(
          await link.transfer(testSeller.addr, oneEth),
          'LINK transfer to Stranger failed.',
        )
        assert(
          await link.transferAndCall(st.address, oneEth, depositSelector, {
            from: testSeller.addr,
          }),
          'TransferAndCall(st, 1ETh, depositLinkFunds) failed.',
        )
      })
      context('when trade confirmation is requested', () => {
        it('reverts for trade not in progress', async () => {
          await expectRevert.unspecified(
            st.requestTradeConfirmation(nonExistantTradeId, {
              from: testSeller.addr,
            }),
          )
        })
        it('reverts if sender has not enough link (1) deposited', async () => {
          // our beforeEach sends link to stranger. confirm consumer has zero then run
          var consumerLinkBalance = await link.balanceOf(strangerNotInTrade)
          assert.equal(0, consumerLinkBalance)
          await expectRevert.unspecified(
            st.requestTradeConfirmation(tradeId, { from: strangerNotInTrade }),
          )
        })
        it('reverts if trade wasnt locked in/confirmed via startTrade', async () => {
          await expectRevert.unspecified(
            st.requestTradeConfirmation(tradeId, { from: testSeller.addr }),
          )
        })
        it('Creates a chainlink request on successful call', async () => {
          await st.startTrade(tradeId, { from: testSeller.addr })
          const tx = await st.requestTradeConfirmation(tradeId, {
            from: testSeller.addr,
          })
          truffleAssert.eventEmitted(tx, 'ChainlinkRequested')
        })
      })
    })
    describe('#fulfillBuyerCheck', () => {
      let tx, reqId, i, rawLogs, request, trade
      let endSellerBalance,
        begSellerBalance,
        withdrawableEthFees,
        newWithdrawableEthFees
      beforeEach(async () => {
        // lock in trade
        tx = await st.startTrade(tradeId, { from: testSeller.addr })
        truffleAssert.eventEmitted(tx, 'SaleLocked', ev => {
          return ev.tradeId == tradeId
        })
        // make oracle request
        tx = await st.requestTradeConfirmation(tradeId, {
          from: testSeller.addr,
        })
        truffleAssert.eventEmitted(tx, 'ChainlinkRequested', ev => {
          reqId = ev.id
          return true
        })
        request = h.decodeRunRequest(tx.receipt.rawLogs[3])

        withdrawableEthFees = await st.viewWithdrawableEtherFees({
          from: consumer,
        })
        begSellerBalance = await web3.eth.getBalance(testSeller.addr)
      })
      context('when the item is found', () => {
        const response = evmTrue
        beforeEach(async () => {
          txFulfill = await h.fulfillOracleRequest(oc, request, response, {
            from: oracleContractOwner,
          })
          rawLogs = txFulfill.receipt.rawLogs
        })
        it('Emits ChainlinkFulfilled(bytes32) when oracle fulfills', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('ChainlinkFulfilled(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(txFulfill.receipt.rawLogs[i].topics[1], reqId)
        })
        it('Emits BuyerHasItem(tradeId) when oracle returns true', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('BuyerHasItem(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(
            txFulfill.receipt.rawLogs[i].topics[1],
            tradeId,
            'Mismatched TradeIds',
          )
        })
        it('Emits SaleCompleted(tradeId) when oracle returns true', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('SaleCompleted(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(
            txFulfill.receipt.rawLogs[i].topics[1],
            tradeId,
            'Mismatched TradeIds',
          )
        })
        it('transfers the ether deposit to the buyer and saves the profit.', async () => {
          endSellerBalance = await web3.eth.getBalance(testSeller.addr)
          newWithdrawableEthFees = await st.viewWithdrawableEtherFees({
            from: consumer,
          })
          var fee = await st.contractFeePerc.call()
          var ownerEarnings = (testTrade.askingPrice * fee) / 100
          var sellerEarnings = testTrade.askingPrice - ownerEarnings
          assert.equal(
            ownerEarnings,
            newWithdrawableEthFees - withdrawableEthFees,
            'unexpected fee mismatch',
          )
          assert(endSellerBalance > begSellerBalance, "ether didn't transfer")
          assert.equal(
            sellerEarnings,
            endSellerBalance - begSellerBalance,
            "Fee calculation isn't correct",
          )
        })
      })
      context('when the item is not found', () => {
        const response = evmFalse
        beforeEach(async () => {
          txFulfill = await h.fulfillOracleRequest(oc, request, response, {
            from: oracleContractOwner,
          })
          rawLogs = txFulfill.receipt.rawLogs
        })
        it('Emits ChainlinkFulfilled(bytes32) when oracle returns false', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('ChainlinkFulfilled(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(txFulfill.receipt.rawLogs[i].topics[1], reqId)
        })
        it('Does not emit BuyerHasItem(tradeId) when oracle returns false', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('BuyerHasItem(bytes32)');
            i++
          ) {}
          assert.equal(i, rawLogs.length, 'Event found in RawLogs.')
        })
        it('Does not SaleCompleted(tradeId) when oracle returns false', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('SaleCompleted(bytes32)');
            i++
          ) {}
          assert.equal(i, rawLogs.length, 'Event found in RawLogs.')
        })
      })
    })

    describe('#requestEthRefund', () => {
      context('when refund fulfillment is requested', () => {
        it('reverts for trade not in progress', async () => {
          await expectRevert.unspecified(
            st.requestEthRefund(nonExistantTradeId, { from: testSeller.addr }),
          )
        })
        it('reverts if sender has not enough link (1) deposited', async () => {
          // our beforeEach sends link to stranger. confirm consumer has zero then run
          var consumerLinkBalance = await link.balanceOf(consumer)
          assert.equal(0, consumerLinkBalance)
          await expectRevert.unspecified(
            st.requestEthRefund(tradeId, { from: consumer }),
          )
        })
        it('Creates chainlink request on successful call', async () => {
          const tx = await st.requestEthRefund(tradeId, { from: stranger })
          truffleAssert.eventEmitted(tx, 'ChainlinkRequested')
        })
        it('Allows buyer to request refund', async () => {
          assert(
            await link.transfer(testBuyer.addr, oneEth),
            'LINK transfer to Buyer failed.',
          )
          assert(
            await link.transferAndCall(st.address, oneEth, depositSelector, {
              from: testBuyer.addr,
            }),
            'TransferAndCall(st, 1ETh, depositLinkFunds) failed.',
          )

          const tx = await st.requestEthRefund(tradeId, { from: stranger })
          truffleAssert.eventEmitted(tx, 'RefundRequested')
        })
        it('Allows seller to request refund', async () => {
          assert(
            await link.transfer(testSeller.addr, oneEth),
            'LINK transfer to Seller failed.',
          )
          assert(
            await link.transferAndCall(st.address, oneEth, depositSelector, {
              from: testSeller.addr,
            }),
            'TransferAndCall(st, 1ETh, depositLinkFunds) failed.',
          )

          const tx = await st.requestEthRefund(tradeId, { from: stranger })
          truffleAssert.eventEmitted(tx, 'RefundRequested')
        })
        it('Doesnt allow non-participants to request refund', async () => {
          assert(
            await link.transfer(strangerNotInTrade, oneEth),
            'LINK transfer to Stranger failed.',
          )
          assert(
            await link.transferAndCall(st.address, oneEth, depositSelector, {
              from: strangerNotInTrade,
            }),
            'TransferAndCall(st, 1ETh, depositLinkFunds) failed.',
          )

          await expectRevert.unspecified(
            st.requestEthRefund(tradeId, { from: strangerNotInTrade }),
          )
        })
      })
    })
    describe('#fulfillSellerCheck', () => {
      let tx, reqId, i, rawLogs, txFulfill
      let begBuyerBalance, endBuyerBalance
      let withdrawableEthFees, newWithdrawableEthFees
      beforeEach(async () => {
        // lock in trade
        tx = await st.requestEthRefund(tradeId, { from: testBuyer.addr })
        truffleAssert.eventEmitted(tx, 'RefundRequested', ev => {
          return ev.tradeId == tradeId
        })
        truffleAssert.eventEmitted(tx, 'ChainlinkRequested', ev => {
          reqId = ev.id
          return true
        })
        request = h.decodeRunRequest(tx.receipt.rawLogs[4])
        withdrawableEthFees = await st.viewWithdrawableEtherFees({
          from: consumer,
        })
        begBuyerBalance = await web3.eth.getBalance(testBuyer.addr)
      })
      context('When Item is Found', () => {
        const response = evmTrue
        beforeEach(async () => {
          txFulfill = await h.fulfillOracleRequest(oc, request, response, {
            from: oracleContractOwner,
          })
          rawLogs = txFulfill.receipt.rawLogs
        })
        it('Emits ChainlinkFulfilled(bytes32) when oracle fulfills', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('ChainlinkFulfilled(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(txFulfill.receipt.rawLogs[i].topics[1], reqId)
        })
        it('Emits nested SellerHasItem(tradeId) when oracle returns true', async () => {
          var tradeStatus = await st.tradeStatus.call(tradeId)
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('SellerHasItem(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(rawLogs[i].topics[1], tradeId, 'Mismatched tradeId')
          assert(tradeStatus.sellerHoldsItem)
        })
        it('Emits nested RefundGranted(tradeId) when oracle returns true', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('RefundGranted(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(rawLogs[i].topics[1], tradeId, 'Mismatched tradeId')
        })
        it('transfers the ether deposit to the buyer and saves the profit.', async () => {
          endBuyerBalance = await web3.eth.getBalance(testBuyer.addr)
          newWithdrawableEthFees = await st.viewWithdrawableEtherFees({
            from: consumer,
          })
          var fee = await st.contractFeePerc.call()
          var ownerEarnings = (testTrade.askingPrice * fee) / 100
          var refund = testTrade.askingPrice - ownerEarnings
          assert.equal(
            ownerEarnings,
            newWithdrawableEthFees - withdrawableEthFees,
            'unexpected fee mismatch',
          )
          assert(endBuyerBalance > begBuyerBalance, "ether didn't transfer")
          assert.equal(
            refund,
            endBuyerBalance - begBuyerBalance,
            "Fee calculation isn't correct",
          )
        })
      })
      context('When Item is Not Found', () => {
        const response = evmFalse
        beforeEach(async () => {
          txFulfill = await h.fulfillOracleRequest(oc, request, response, {
            from: oracleContractOwner,
          })
          rawLogs = txFulfill.receipt.rawLogs
        })
        it('Emits ChainlinkFulfilled(bytes32) when oracle fulfills', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('ChainlinkFulfilled(bytes32)');
            i++
          ) {}
          assert.isBelow(i, rawLogs.length, 'Event not found in RawLogs.')
          assert.equal(txFulfill.receipt.rawLogs[i].topics[1], reqId)
        })
        it('Does not emit nested SellerHasItem(tradeId) when oracle returns true', async () => {
          var tradeStatus = await st.tradeStatus.call(tradeId)
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('SellerHasItem(bytes32)');
            i++
          ) {}
          assert.equal(i, rawLogs.length, 'Event found in RawLogs.')
          assert(!tradeStatus.sellerHoldsItem)
        })
        it('Does not emit nested RefundGranted(tradeId) when oracle returns true', async () => {
          for (
            i = 0;
            i < rawLogs.length &&
            rawLogs[i].topics[0] !=
              web3.utils.soliditySha3('RefundGranted(bytes32)');
            i++
          ) {}
          assert.equal(i, rawLogs.length, 'Event found in RawLogs.')
        })
      })
    })
  })
})
