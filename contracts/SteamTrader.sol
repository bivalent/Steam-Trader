pragma solidity >=0.5.0;

import "chainlink/v0.5/contracts/ChainlinkClient.sol";
import "chainlink/v0.5/contracts/vendor/Ownable.sol";

/**
 * @title MyContract is an example contract which requests data from
 * the Chainlink network
 * @dev This contract is designed to work on multiple networks, including
 * local test networks
 */
contract SteamTrader is ChainlinkClient, Ownable {
  //using SafeMath for uint; --- imported via the ChainlinkClient but leaving comment as reference

  uint public withdrawableEth;
  uint8 public contractFeePerc;
  mapping (string => Trade) trade;
  mapping (string => TradeStatus) public tradeStatus;
  mapping (address => uint) reputation;
  // request Id -> tradeId. So we know which trade a given oracle request is for
  mapping (bytes32 => string) requestTracker;
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
    bool locked;
    bool complete;
    uint depositBalance;
    bool sellerHoldsItem;
    bool buyerHoldsItem;
  }
  struct Trade {
    string tradeId;
    Customer buyer;
    Customer seller;
    uint16 appId;
    uint8 inventoryContext;
    Item item;
    uint askingPrice;
  }

  function createTrade(
    string memory _uuid,
    string memory _steamId,
    uint _askingPrice,
    // item
    uint64 _assetid,
    uint64 _classid,
    uint64 _instanceid,
    // app
    uint16 _appId,
    uint8 _inventoryContext
  ) public returns (string memory) {
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

    return _uuid;
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
   * @notice Creates a request to the specified Oracle contract address
   * @dev This function ignores the stored Oracle contract address and
   * will instead send the request to the address specified
   * @param _oracle The Oracle contract address to send the request to
   * @param _jobId The bytes32 JobID to be executed
   * @param _payment the payment to be made to the oracle for the job executed
   * @param _trade The trade that contains item & customer data
   * @param _buyer T/F if check is for buyer & pull steam Id / set fufill function
   */
  function checkSteamInventory(
    address _oracle,
    bytes32 _jobId,
    uint256 _payment,
    Trade memory _trade,
    bool _buyer
  )
    internal
    onlyOwner
    returns (bytes32 requestId)
  {
    string memory _steamId;
    Item memory _item = _trade.item;
    Chainlink.Request memory req;
    if (_buyer) {
       req = buildChainlinkRequest(_jobId, address(this), this.fulfillBuyerCheck.selector);
      _steamId = _trade.buyer.steamId;
    }
    else {
      req = buildChainlinkRequest(_jobId, address(this), this.fulfillSellerCheck.selector);
      _steamId = _trade.seller.steamId;
    }
    req.add("user_id", _steamId);
    req.addInt("appid", _trade.appId);
    req.addInt("context", _trade.inventoryContext);
    req.addInt("item.assetid", _item.assetid);
    req.addInt("item.classid", _item.classid);
    req.addInt("item.instanceid", _item.instanceid);
    requestId = sendChainlinkRequestTo(_oracle, req, _payment);
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
    public
    recordChainlinkFulfillment(_requestId)
  {
    resolveTrade(_requestId, true, _itemFound);
  }

  function fulfillSellerCheck(bytes32 _requestId, bool _itemFound)
    public
    recordChainlinkFulfillment(_requestId)
  {
    resolveTrade(_requestId, false, _itemFound);
  }

  function resolveTrade(bytes32 _requestId, bool _buyer, bool _itemFound)
    internal
  {
    // only run resolverlogic when item found
    string memory _tradeId = requestTracker[_requestId];
    if (_itemFound) {
      tradeStatus[_tradeId].sellerHoldsItem = _itemFound && !_buyer;
      tradeStatus[_tradeId].buyerHoldsItem = _itemFound && _buyer;
      // if item is found in buyer inventory, send all deposited funds to seller and complete trade
      if (_buyer && tradeStatus[_tradeId].depositBalance >= trade[_tradeId].askingPrice) {
        resolvePayout(_tradeId);
      }
      else {
        // TODO: if item is found in seller inventory and trade is unlocked, refund money & lock trade
      }
    }
    else { // update status as best as possible since item not found
      if (_buyer) {
        tradeStatus[_tradeId].buyerHoldsItem = _itemFound && _buyer;
      }
      else {
        tradeStatus[_tradeId].sellerHoldsItem = _itemFound && !_buyer;
      }
    }
  }

  function resolvePayout(string memory _tradeId)
    internal
  {
    Trade memory _tradeToResolve = trade[_tradeId];
    uint _fee = calculateFee(_tradeToResolve.askingPrice);
    uint _payout = _tradeToResolve.askingPrice - _fee;
    // pay the seller
    _tradeToResolve.seller.addr.transfer(_payout);

    // return any additional funds to buyer in case of overpayment (yay customer service)
    uint _remainingAmount = tradeStatus[_tradeId].depositBalance - _tradeToResolve.askingPrice;
    if (_remainingAmount > 0) {
      _tradeToResolve.buyer.addr.transfer(_remainingAmount);
    }
    // finalize trade as completed.
    tradeStatus[_tradeId].complete = true;
    tradeStatus[_tradeId].depositBalance = 0;
  }

  // return: (final payout, fee)
  function calculateFee(uint askingPrice) internal view returns (uint) {
    uint fee = askingPrice.mul(contractFeePerc).div(100);

    return fee;
  }

  function buyerPayment(string memory _tradeId) public payable {
    tradeStatus[_tradeId].depositBalance += msg.value;
  }

  /**
   * @notice Allows the owner to withdraw any LINK balance on the contract
   */
  function withdrawLink() public onlyOwner {
    LinkTokenInterface link = LinkTokenInterface(chainlinkTokenAddress());
    require(link.transfer(msg.sender, link.balanceOf(address(this))), "Unable to transfer");
  }

  function withdrawEther(uint _amount) public onlyOwner {
    require(_amount <= withdrawableEth); // don't want to withdraw people's payments!
    msg.sender.transfer(_amount);
  }

  // so we can have sales!
  function setFeePerc(uint8 _perc) public onlyOwner {
    require(0 < _perc && _perc < 100);
    contractFeePerc = _perc;
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

  /**
   * @notice Deploy the contract with a specified address for the LINK
   * and Oracle contract addresses
   * @dev Sets the storage for the specified addresses
   * @param _link The address of the LINK token contract
   */
  constructor(address _link) public {
    contractFeePerc = 5;
    if (_link == address(0)) {
      setPublicChainlinkToken();
    } else {
      setChainlinkToken(_link);
    }
  }
}
