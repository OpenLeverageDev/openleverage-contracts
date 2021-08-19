// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./OpenLevInterface.sol";
import "./Types.sol";
import "./Adminable.sol";
import "./DelegatorInterface.sol";
import "./dex/UniV2Dex.sol";


/**
  * @title OpenLevDelegator
  * @author OpenLeverage
  */
contract OpenLevDelegator is DelegatorInterface, OpenLevInterface, OpenLevStorage, Adminable {

    constructor(
        ControllerInterface _controller,
        DexAggregatorInterface _dexAggregator,
        address _treasury,
        address[] memory _depositTokens,
        address _wETH,
        address payable _admin,
        address implementation_){
        admin = msg.sender;
        // Creator of the contract is admin during initialization
        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address,address,address,address[],address)",
            _controller,
            _treasury,
            _dexAggregator,
            _depositTokens,
            _wETH
            ));
        implementation = implementation_;

        // Set the proper admin now that initialization is done
        admin = _admin;
    }

    /**
     * Called by the admin to update the implementation of the delegator
     * @param implementation_ The address of the new implementation for delegation
     */
    function setImplementation(address implementation_) public override onlyAdmin {
        address oldImplementation = implementation;
        implementation = implementation_;
        emit NewImplementation(oldImplementation, implementation);
    }

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint32 marginLimit,
        uint8 dex
    ) external override returns (uint16){
        bytes memory data = delegateToImplementation(abi.encodeWithSignature("addMarket(address,address,uint32,uint8)", pool0, pool1, marginLimit, dex));
        return abi.decode(data, (uint16));
    }

    function marginTrade(uint16 marketId, bool longToken, bool depositToken, uint deposit, uint borrow, uint minBuyAmount, bytes memory dexData) external payable override {
        delegateToImplementation(abi.encodeWithSignature("marginTrade(uint16,bool,bool,uint256,uint256,uint256,bytes)",
            marketId, longToken, depositToken, deposit, borrow, minBuyAmount, dexData));
    }

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minBuyAmount, bytes memory dexData) external override {
        delegateToImplementation(abi.encodeWithSignature("closeTrade(uint16,bool,uint256,uint256,bytes)",
            marketId, longToken, closeAmount, minBuyAmount, dexData));
    }

    function liquidate(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override {
        delegateToImplementation(abi.encodeWithSignature("liquidate(address,uint16,bool,bytes)",
            owner, marketId, longToken, dexData));
    }

    function marginRatio(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override view returns (uint current, uint avg, uint32 limit){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("marginRatio(address,uint16,bool,bytes)", owner, marketId, longToken, dexData));
        return abi.decode(data, (uint, uint, uint32));
    }


    function shouldUpdatePrice(uint16 marketId, bool isOpen, bytes memory dexData) external override view returns (bool){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("shouldUpdatePrice(uint16,bool,bytes)", marketId, isOpen, dexData));
        return abi.decode(data, (bool));
    }
    function getMarketSupportDexs(uint16 marketId) external override view returns (uint8[] memory){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("getMarketSupportDexs(uint16)",marketId));
        return abi.decode(data, (uint8[]));
    }
    /*** Admin Functions ***/

    function setDefaultMarginLimit(uint32 newRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("setDefaultMarginLimit(uint32)", newRatio));
    }

    function setMarketMarginLimit(uint16 marketId, uint32 newRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("setMarketMarginLimit(uint16,uint32)", marketId, newRatio));
    }

    function setDefaultFeesRate(uint newRate) external override {
        delegateToImplementation(abi.encodeWithSignature("setDefaultFeesRate(uint256)", newRate));
    }

    function setMarketFeesRate(uint16 marketId, uint newRate) external override {
        delegateToImplementation(abi.encodeWithSignature("setMarketFeesRate(uint16,uint256)", marketId, newRate));
    }

    function setInsuranceRatio(uint8 newRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("setInsuranceRatio(uint8)", newRatio));
    }

    function setController(address newController) external override {
        delegateToImplementation(abi.encodeWithSignature("setController(address)", newController));
    }

    function setDexAggregator(DexAggregatorInterface _dexAggregator) external override {
        delegateToImplementation(abi.encodeWithSignature("setDexAggregator(address)", _dexAggregator));
    }

    function moveInsurance(uint16 marketId, uint8 poolIndex, address to, uint amount) external override {
        delegateToImplementation(abi.encodeWithSignature("moveInsurance(uint16,uint8,address,uint256)", marketId, poolIndex, to, amount));
    }

    function setAllowedDepositTokens(address[] memory tokens, bool allowed) external override {
        delegateToImplementation(abi.encodeWithSignature("setAllowedDepositTokens(address[],bool)", tokens, allowed));
    }

    function setPriceDiffientRatio(uint16 newPriceDiffientRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("setPriceDiffientRatio(uint16)", newPriceDiffientRatio));
    }

    function setMarketDexs(uint16 marketId, uint8[] memory dexs) external override {
        delegateToImplementation(abi.encodeWithSignature("setMarketDexs(uint16,uint8[])", marketId, dexs));
    }


}
