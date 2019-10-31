pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "chainlink/v0.5/contracts/ChainlinkClient.sol";
import "chainlink/v0.5/contracts/vendor/Ownable.sol";

/**
 * @title SteamTrader is an example contract which requests data from
 * the Chainlink network about steam inventories and enables trading of items
 * @dev This contract is designed to work on multiple networks, including
 * local test networks
 */
//using SafeMath for uint; --- imported via the ChainlinkClient but leaving comment as reference
contract SteamTrader is ChainlinkClient, Ownable {

  uint256 constant internal LINK = 10**18;
  uint256 constant private SELECTOR_LENGTH = 4;
  uint256 constant private EXPECTED_REQUEST_WORDS = 2;
  uint256 constant private MINIMUM_REQUEST_LENGTH = SELECTOR_LENGTH + (32 * EXPECTED_REQUEST_WORDS);

  // contract terms
  bytes32 public jobId;
  uint256 public oraclePayment;
  uint8 public contractFeePerc;
  uint256 public lockTime;
  uint256 private withdrawableEth;

  // trackers for users and trades
  mapping(address => uint256) public withdrawableLinkTokens;
  mapping (address => uint) reputation; // TODO: Track reputation via completed trades
  mapping (bytes32 => Trade) public trade;
  mapping (bytes32 => TradeStatus) public tradeStatus;

  // request Id -> tradeId. So we know which trade a given oracle request is for
  mapping (bytes32 => bytes32) requestTracker;
  struct Item {
    uint64 assetid;
    uint64 classid;
    uint64 instanceid;
  }
  struct Customer {
    address payable addr;
    string steamId;
  }
  struct TradeStatus {
    bool init;
    bool sellTransferInitiated;
    bool refundInitiated;
    uint256 lockBlockTimestamp;
    bool complete;
    uint256 depositBalance;
    bool sellerHoldsItem;
    bool buyerHoldsItem;
  }
  struct Trade {
    bytes32 tradeId;
    Customer buyer;
    Customer seller;
    uint16 appId;
    uint8 inventoryContext;
    Item item;
    uint256 askingPrice;
  }

  event TradeCreated(bytes32 indexed tradeId);
  event FundingSecured(bytes32 indexed tradeId);
  event SaleLocked(bytes32 indexed tradeId);
  event SaleCompleted(bytes32 indexed tradeId);
  event SellerHasItem(bytes32 indexed tradeId);
  event BuyerHasItem(bytes32 indexed tradeId);
  event RefundRequested(bytes32 indexed tradeId);
  event RefundGranted(bytes32 indexed tradeId);

  function createTrade(
    bytes32 _uuid,
    string calldata _steamId,
    uint256 _askingPrice,
    // item
    uint64 _assetid,
    uint64 _classid,
    uint64 _instanceid,
    // app
    uint16 _appId,
    uint8 _inventoryContext
  ) external {
    // check if trade already exists. if so, halt.
    require (!tradeStatus[_uuid].init, "Trade already exists with this ID.");

    tradeStatus[_uuid].init = true;
    // trade info
    trade[_uuid].tradeId = _uuid;
    trade[_uuid].askingPrice = _askingPrice;
    trade[_uuid].appId = _appId;
    trade[_uuid].inventoryContext = _inventoryContext;
    // seller info
    trade[_uuid].seller.addr = msg.sender;
    trade[_uuid].seller.steamId = _steamId;
    // item info
    trade[_uuid].item.assetid = _assetid;
    trade[_uuid].item.classid = _classid;
    trade[_uuid].item.instanceid = _instanceid;
    emit TradeCreated(_uuid);
  }

  // seller runs so the contract displays he/she has the item
  function requestTradeItemValidation(
    bytes32 _tradeId
  ) external inProgressTradeOnly(_tradeId) hasAvailableLINKFunds(oraclePayment)
  {
    checkSteamInventory(_tradeId, false, this.fulfillTradeItemValidation.selector);
  }

  // chainlink fulfills to this that the item is found
  function fulfillTradeItemValidation(bytes32 _requestId, bool _itemFound)
    external
    recordChainlinkFulfillment(_requestId)
  {
    bytes32 _tradeId = requestTracker[_requestId];
    tradeStatus[_tradeId].sellerHoldsItem = _itemFound;
    if (_itemFound) {
      emit SellerHasItem(_tradeId);
    }
  }

  // function for buyer to deposit funds
  function buyItem(bytes32 _tradeId, string calldata _steamId)
    external
    payable
    inProgressTradeOnly(_tradeId)
  {
    Trade memory _t = trade[_tradeId];
    // require not bought yet and full amount paid (no more, no less)
    require(_t.buyer.addr == address(0) && _t.askingPrice == msg.value);
    // update trade with buyer
    trade[_tradeId].buyer.addr = msg.sender;
    trade[_tradeId].buyer.steamId = _steamId;
    tradeStatus[_tradeId].depositBalance = msg.value;
    emit FundingSecured(_tradeId);
    //TODO: emit event that funds have arrived. UI can read this and SNS notify the seller
  }

  // allow seller to declare he's sending item so a refund can't be issued.
  function startTrade(bytes32 _tradeId) external onlySeller(_tradeId) returns (uint) {
    require(!tradeStatus[_tradeId].refundInitiated
      || now - tradeStatus[_tradeId].lockBlockTimestamp >= lockTime);
    tradeStatus[_tradeId].sellTransferInitiated = true;
    tradeStatus[_tradeId].refundInitiated = false;
    tradeStatus[_tradeId].lockBlockTimestamp = now;
    emit SaleLocked(_tradeId);
  }

  // seller tells contract he has sent item. If item is in buyer inventory, resolve trade.
  function confirmTrade(bytes32 _tradeId) external sellTransferIsInitiated(_tradeId) {
    require(!tradeStatus[_tradeId].refundInitiated
      || now - tradeStatus[_tradeId].lockBlockTimestamp >= lockTime);
    tradeStatus[_tradeId].sellTransferInitiated = true;
    tradeStatus[_tradeId].refundInitiated = false;

    checkSteamInventory(_tradeId, true, this.fulfillBuyerCheck.selector);
  }

  // TODO: allow buyer to call this via link contract. must send required link payment for oracles
  // For now, deposit first then call
  function requestEthRefund(
    bytes32 _tradeId
  )
    external hasAvailableLINKFunds(oraclePayment)
  {
    require(
      !tradeStatus[_tradeId].sellTransferInitiated
      || now - tradeStatus[_tradeId].lockBlockTimestamp >= 1 days
    );
    tradeStatus[_tradeId].refundInitiated = true;
    tradeStatus[_tradeId].sellTransferInitiated = false;
    emit RefundRequested(_tradeId);
    checkSteamInventory(_tradeId, false, this.fulfillSellerCheck.selector);
  }

  /**
   * @notice Returns the address of the LINK token
   * @dev This is the public implementation for chainlinkTokenAddress, which is
   * an internal method of the ChainlinkClient contract
   */
  function getChainlinkToken() public view returns (address) {
    return chainlinkTokenAddress();
  }

  /**
   * @notice Creates a request to an oracle in the oracleMap
   * @param _tradeId The tradeId that contains item & customer data
   * @param _buyer T/F if check is for buyer & pull steam Id / set fulfill function
   * @param _selector callback function for CL node to fulfill to
   */
  function checkSteamInventory(
    bytes32 _tradeId,
    bool _buyer,
    bytes4 _selector
  )
    private
    returns (bytes32 requestId)
  {
    require(
      _selector == this.fulfillBuyerCheck.selector
      || _selector == this.fulfillSellerCheck.selector
      || _selector == this.fulfillTradeItemValidation.selector
    );
    Trade memory _trade = trade[_tradeId];
    Item memory _item = _trade.item;
    Chainlink.Request memory req = buildChainlinkRequest(jobId, address(this), _selector);

    if (_buyer) {
      req.add("user_id", _trade.buyer.steamId);
    }
    else {
      req.add("user_id", _trade.seller.steamId);
    }
    req.addInt("appid", _trade.appId);
    req.addInt("context", _trade.inventoryContext);
    req.addInt("item.assetid", _item.assetid);
    req.addInt("item.classid", _item.classid);
    req.addInt("item.instanceid", _item.instanceid);

    requestId = sendChainlinkRequest(req, oraclePayment);
    requestTracker[requestId] = _trade.tradeId;
  }

  /**
   * @notice The fulfill method from requests created by this contract
   * @dev The recordChainlinkFulfillment protects this function from being called
   * by anyone other than the oracle address that the request was sent to
   * @param _requestId The ID that was generated for the request
   * @param _itemFound The answer provided by the oracle re: item in inventory
   */
  function fulfillBuyerCheck(bytes32 _requestId, bool _itemFound)
    external
    recordChainlinkFulfillment(_requestId)
  {
    resolveTrade(_requestId, true, _itemFound);
  }

  function fulfillSellerCheck(bytes32 _requestId, bool _itemFound)
    external
    recordChainlinkFulfillment(_requestId)
  {
    resolveTrade(_requestId, false, _itemFound);
  }

  function resolveTrade(bytes32 _requestId, bool _buyer, bool _itemFound)
    internal
  {
    // only run resolverlogic when item found
    bytes32 _tradeId = requestTracker[_requestId];
    if (_itemFound) {
      tradeStatus[_tradeId].sellerHoldsItem = _itemFound && !_buyer;
      tradeStatus[_tradeId].buyerHoldsItem = _itemFound && _buyer;
      // if item is found in buyer inventory, send all deposited funds to seller and complete trade
      if (_buyer) {
        emit BuyerHasItem(_tradeId);
        if (tradeStatus[_tradeId].depositBalance >= trade[_tradeId].askingPrice) {
          resolvePayout(_tradeId);
        }
      }
      else if (!_buyer) {
        emit SellerHasItem(_tradeId);
        if (tradeStatus[_tradeId].depositBalance >= 0 && tradeStatus[_tradeId].refundInitiated) {
          refundBeforeTrade(_tradeId);
        }
      }
    }
    else { // update status as best as possible since item not found
      if (_buyer) {
        tradeStatus[_tradeId].buyerHoldsItem = false;
      }
      else {
        tradeStatus[_tradeId].sellerHoldsItem = false;
      }
    }
  }

  // called via oracle fulfillment. ends trade.
  // PRE: Item was found, in buyer inventory, and payment was requested. sale transfer lock
  function resolvePayout(bytes32 _tradeId)
    internal
  {
    Trade memory _tradeToResolve = trade[_tradeId];
    uint256 _fee = calculateFee(_tradeToResolve.askingPrice);
    uint256 _payout = _tradeToResolve.askingPrice - _fee;

    // pay the seller
    _tradeToResolve.seller.addr.transfer(_payout);

    // finalize trade as completed.
    tradeStatus[_tradeId].complete = true;
    tradeStatus[_tradeId].depositBalance = 0;
    withdrawableEth += _fee;
    // update reputation ticker with successful trade.
    reputation[trade[_tradeId].buyer.addr] += 1;
    reputation[trade[_tradeId].seller.addr] += 1;

    emit SaleCompleted(_tradeId);
  }

  // called by oracle fulfillment via logic in @fulfillSellerCheck && @resolveTrade. ends trade
  // PRE: item was found, it was in seller inventory, and refund was requested. sale transfer lock
  // POST: transfer ETH to buyer. LINK is in another function and can be done separately.
  // POST: Trade still stays open and validated thanks to buyer payment to oracles
  function refundBeforeTrade(bytes32 _tradeId)
    internal
    inProgressTradeOnly(_tradeId)
  {
    require(
      tradeStatus[_tradeId].sellerHoldsItem
        && (tradeStatus[_tradeId].refundInitiated
        && !tradeStatus[_tradeId].sellTransferInitiated)
      || now - tradeStatus[_tradeId].lockBlockTimestamp >= 1 days);

    TradeStatus memory _tStatus = tradeStatus[_tradeId];
    Trade memory _t = trade[_tradeId];

    uint256 _refundFee = calculateFee(_tStatus.depositBalance);
    (_t.buyer.addr).transfer(_tStatus.depositBalance - _refundFee);
    withdrawableEth += _refundFee;
    tradeStatus[_tradeId].depositBalance = 0;
    emit RefundGranted(_tradeId);
  }

  // return: (final payout, fee)
  function calculateFee(uint256 askingPrice) internal view returns (uint) {
    return askingPrice.mul(contractFeePerc).div(100);
  }

  function viewWithdrawableEtherFees() external view onlyOwner returns (uint) {
    return withdrawableEth;
  }

  function withdrawEtherFees(uint256 _amount) external onlyOwner {
    require(_amount <= withdrawableEth); // don't want to withdraw people's payments!
    msg.sender.transfer(_amount);
    withdrawableEth -= _amount;
  }

  // so we can have sales!
  function setFeePerc(uint8 _perc) external onlyOwner {
    require(0 < _perc && _perc < 100);
    contractFeePerc = _perc;
  }

  function setOraclePayment(uint256 _amount) external onlyOwner {
    oraclePayment = _amount;
  }

  /**
   * @notice Call this method if no response is received within 5 minutes
   * @param _requestId The ID that was generated for the request to cancel
   * @param _payment The payment specified for the request to cancel
   * @param _callbackFunctionId The bytes4 callback function ID specified for
   * the request to cancel
   * @param _expiration The expiration generated for the request to cancel
   */
  function cancelRequest(
    bytes32 _requestId,
    uint256 _payment,
    bytes4 _callbackFunctionId,
    uint256 _expiration
  )
    public
    onlyOwner
  {
    cancelChainlinkRequest(_requestId, _payment, _callbackFunctionId, _expiration);
  }

  function setLockTime(uint256 _time) public onlyOwner {
    lockTime = _time;
  }
  /**
   * @notice Deploy the contract with a specified address for the LINK
   * @dev Sets the storage for the specified addresses
   * @param _link The address of the LINK token contract
   */
  constructor(address _link) public {
    oraclePayment = 1 * LINK;
    contractFeePerc = 5;
    lockTime = 1 hours;
    if (_link == address(0)) {
      setPublicChainlinkToken();
    } else {
      setChainlinkToken(_link);
    }
  }

  function setOracleAddress(address _oracle, bytes32 _jobId) external onlyOwner {
    setChainlinkOracle(_oracle);
    jobId = _jobId;
  }

  /**
   * @notice Called when LINK is sent to the contract via `transferAndCall`
   * @dev The data payload's first 2 words will be overwritten by the `_sender` and `_amount`
   * values to ensure correctness. Calls oracleRequest.
   * @param _sender Address of the sender
   * @param _amount Amount of LINK sent (specified in wei)
   * @param _data Payload of the transaction
   */
  function onTokenTransfer(
    address _sender,
    uint256 _amount,
    bytes memory _data
  )
    public
    onlyLINK
    permittedFunctionsForLINKRequests
  {
    assembly { // solhint-disable-line no-inline-assembly
      mstore(add(_data, 36), _sender) // ensure correct sender is passed
      mstore(add(_data, 68), _amount) // ensure correct amount is passed
    }
    // solhint-disable-next-line avoid-low-level-calls
    (bool success,) = address(this).delegatecall(_data); // calls oracleRequest or depositFunds
    require(success, "Unable to create request");
  }

  /**
   * @notice Called when LINK is sent to the contract via `transferAndCall`
   * @param _sender Address of the sender
   * @param _amount Amount of LINK sent (specified in wei)
   */
  function depositLinkFunds(address _sender, uint256 _amount) external onlyLINK
  {
    withdrawableLinkTokens[_sender] = withdrawableLinkTokens[_sender].add(_amount);
  }

  /**
   * @param _account Address to check balance of
   * @return Balance of account (specified in wei)
   */
  function balanceOfLink(address _account) public view returns (uint256)
  {
    return withdrawableLinkTokens[_account];
  }

  /**
   * @dev Allows the oracle operator to withdraw their LINK
   * @param _recipient is the address the funds will be sent to
   * @param _amount is the amount of LINK transfered from the Coordinator contract
   */
  function withdrawLink(address _recipient, uint256 _amount)
    external
    hasAvailableLINKFunds(_amount)
  {
    LinkTokenInterface link = LinkTokenInterface(chainlinkTokenAddress());
    require(link.transfer(_recipient, link.balanceOf(address(this))), "Unable to transfer");
    withdrawableLinkTokens[msg.sender] -= _amount;
  }

  /**
   * @dev Reverts if the callback address is the LINK token
   * @param _to The callback address
   */
  modifier checkCallbackAddress(address _to) {
    require(_to != address(LINK), "Cannot callback to LINK");
    _;
  }

  /**
   * @dev Reverts if the given data does not begin with the `oracleRequest` function selector
   */
  modifier permittedFunctionsForLINKRequests() {
    bytes4 funcSelector;
    assembly { // solhint-disable-line no-inline-assembly
      calldatacopy(funcSelector, 132, 4) // grab function selector from calldata
    }
    // only requestEthRefund and requestEthPayment allowed
    require(
      funcSelector[0] == this.requestEthRefund.selector
        || funcSelector[0] == this.confirmTrade.selector
        || funcSelector[0] == this.depositLinkFunds.selector,
      "Must use whitelisted functions");
    _;
  }

  modifier onlyLINK() {
    require(msg.sender == getChainlinkToken(), "Must use LINK token");
    _;
  }

  /**
   * @dev Reverts if amount requested is greater than withdrawable balance
   * @param _amount The given amount to compare to `withdrawableTokens`
   */
  modifier hasAvailableLINKFunds(uint256 _amount) {
    require(withdrawableLinkTokens[msg.sender] >= _amount, "Amount required for oracle payment is greater than withdrawable balance");
    _;
  }

  modifier onlyBuyer(bytes32 _tradeId) {
    require(trade[_tradeId].buyer.addr == msg.sender);
    _;
  }

  modifier onlySeller(bytes32 _tradeId) {
    require(trade[_tradeId].seller.addr == msg.sender);
    _;
  }

  modifier sellTransferIsInitiated(bytes32 _tradeId) {
    require(tradeStatus[_tradeId].sellTransferInitiated);
    _;
  }

  modifier inProgressTradeOnly(bytes32 _tradeId) {
    require(tradeStatus[_tradeId].init && !tradeStatus[_tradeId].complete);
    _;
  }
  /**
   * @dev Reverts if the given payload is less than needed to create a request
   * @param _data The request payload
   */
  modifier validRequestLength(bytes memory _data) {
    require(_data.length >= MINIMUM_REQUEST_LENGTH, "Invalid request length");
    _;
  }
}
