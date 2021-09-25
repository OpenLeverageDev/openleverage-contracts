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
        address[] memory _depositTokens,
        address _wETH,
        address _xOLE,
        address payable _admin,
        address implementation_){
        admin = msg.sender;
        // Creator of the contract is admin during initialization
        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address,address,address[],address,address)",
            _controller,
            _dexAggregator,
            _depositTokens,
            _wETH,
            _xOLE
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
        uint16 marginLimit,
        bytes memory dexData
    ) external override returns (uint16){
        bytes memory data = delegateToImplementation(abi.encodeWithSignature("addMarket(address,address,uint16,bytes)", pool0, pool1, marginLimit, dexData));
        return abi.decode(data, (uint16));
    }

    function marginTrade(uint16 marketId, bool longToken, bool depositToken, uint deposit, uint borrow, uint minBuyAmount, bytes memory dexData) external payable override {
        delegateToImplementation(abi.encodeWithSignature("marginTrade(uint16,bool,bool,uint256,uint256,uint256,bytes)",
            marketId, longToken, depositToken, deposit, borrow, minBuyAmount, dexData));
    }

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minOrMaxAmount, bytes memory dexData) external override {
        delegateToImplementation(abi.encodeWithSignature("closeTrade(uint16,bool,uint256,uint256,bytes)",
            marketId, longToken, closeAmount, minOrMaxAmount, dexData));
    }

    function liquidate(address owner, uint16 marketId, bool longToken, uint minOrMaxAmount, bytes memory dexData) external override {
        delegateToImplementation(abi.encodeWithSignature("liquidate(address,uint16,bool,uint256,bytes)",
            owner, marketId, longToken, minOrMaxAmount, dexData));
    }

    function marginRatio(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override view returns (uint current, uint cAvg, uint hAvg, uint32 limit){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("marginRatio(address,uint16,bool,bytes)", owner, marketId, longToken, dexData));
        return abi.decode(data, (uint, uint, uint, uint32));
    }

    function updatePrice(uint16 marketId,bytes memory dexData) external override {
        delegateToImplementation(abi.encodeWithSignature("updatePrice(uint16,bytes)",
            marketId, dexData));
    }


    function shouldUpdatePrice(uint16 marketId, bytes memory dexData) external override view returns (bool){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("shouldUpdatePrice(uint16,bytes)", marketId, dexData));
        return abi.decode(data, (bool));
    }

    function getMarketSupportDexs(uint16 marketId) external override view returns (uint32[] memory){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("getMarketSupportDexs(uint16)", marketId));
        return abi.decode(data, (uint32[]));
    }

    function getCalculateConfig() external override view returns (OpenLevStorage.CalculateConfig memory){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("getCalculateConfig()"));
        return abi.decode(data, (OpenLevStorage.CalculateConfig));
    }
    /*** Admin Functions ***/

    function setCalculateConfig(uint16 defaultFeesRate,
        uint8 insuranceRatio,
        uint16 defaultMarginLimit,
        uint16 priceDiffientRatio,
        uint16 updatePriceDiscount,
        uint16 feesDiscount,
        uint128 feesDiscountThreshold,
        uint16 penaltyRatio,
        uint8 maxLiquidationPriceDiffientRatio,
        uint16 twapDuration) external override {
        delegateToImplementation(abi.encodeWithSignature("setCalculateConfig(uint16,uint8,uint16,uint16,uint16,uint16,uint128,uint16,uint8,uint16)",
            defaultFeesRate, insuranceRatio, defaultMarginLimit, priceDiffientRatio, updatePriceDiscount, feesDiscount, feesDiscountThreshold, penaltyRatio, maxLiquidationPriceDiffientRatio, twapDuration));
    }

    function setAddressConfig(address controller,
        DexAggregatorInterface dexAggregator) external override {
        delegateToImplementation(abi.encodeWithSignature("setAddressConfig(address,address)", controller, address(dexAggregator)));
    }

    function setMarketConfig(uint16 marketId, uint16 feesRate, uint16 marginLimit, uint16 priceDiffientRatio, uint32[] memory dexs) external override {
        delegateToImplementation(abi.encodeWithSignature("setMarketConfig(uint16,uint16,uint16,uint16,uint32[])", marketId, feesRate, marginLimit, priceDiffientRatio, dexs));
    }

    function moveInsurance(uint16 marketId, uint8 poolIndex, address to, uint amount) external override {
        delegateToImplementation(abi.encodeWithSignature("moveInsurance(uint16,uint8,address,uint256)", marketId, poolIndex, to, amount));
    }

    function setAllowedDepositTokens(address[] memory tokens, bool allowed) external override {
        delegateToImplementation(abi.encodeWithSignature("setAllowedDepositTokens(address[],bool)", tokens, allowed));
    }


}
