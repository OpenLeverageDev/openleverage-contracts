// SPDX-License-Identifier: MIT
pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./OpenLevInterface.sol";
import "./Types.sol";
import "./dex/PriceOracleInterface.sol";
import "./Adminable.sol";
import "./DelegatorInterface.sol";
import "./dex/IUniswapV2Callee.sol";


/**
  * @title OpenLevDelegator
  * @author OpenLeverage
  */
contract OpenLevDelegator is DelegatorInterface, OpenLevInterface, OpenLevStorage, Adminable, IUniswapV2Callee {

    constructor(
        ControllerInterface _controller,
        IUniswapV2Factory _uniswapFactory,
        address _treasury,
        PriceOracleInterface _priceOracle,
        ReferralInterface referral,
        address payable _admin,
        address implementation_){
        admin = msg.sender;
        // Creator of the contract is admin during initialization
        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address,address,address,address,address)",
            _controller,
            _treasury,
            _priceOracle,
            _uniswapFactory,
            referral));
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
        uint32 marginRatio
    ) external override returns (uint16){
        bytes memory data = delegateToImplementation(abi.encodeWithSignature("addMarket(address,address,uint32)", pool0, pool1, marginRatio));
        return abi.decode(data, (uint16));
    }

    function marginTrade(
        uint16 marketId,
        bool longToken,
        bool depositToken,
        uint deposit,
        uint borrow,
        uint minBuyAmount,
        address referrer
    ) external override {
        delegateToImplementation(abi.encodeWithSignature("marginTrade(uint16,bool,bool,uint256,uint256,uint256,address)",
            marketId, longToken, depositToken, deposit, borrow, minBuyAmount, referrer));
    }

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minBuyAmount) external override {
        delegateToImplementation(abi.encodeWithSignature("closeTrade(uint16,bool,uint256,uint256)",
            marketId, longToken, closeAmount, minBuyAmount));
    }


    function marginRatio(address owner, uint16 marketId, bool longToken) external override view returns (uint current, uint32 marketLimit){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("marginRatio(address,uint16,bool)", owner, marketId, longToken));
        return abi.decode(data, (uint, uint32));
    }

    function liqMarker(address owner, uint16 marketId, bool longToken) external override {
        delegateToImplementation(abi.encodeWithSignature("liqMarker(address,uint16,bool)",
            owner, marketId, longToken));
    }

    function liqMarkerReset(address owner, uint16 marketId, bool longToken) external override {
        delegateToImplementation(abi.encodeWithSignature("liqMarkerReset(address,uint16,bool)",
            owner, marketId, longToken));
    }

    function liquidate(address owner, uint16 marketId, bool longToken) external override {
        delegateToImplementation(abi.encodeWithSignature("liquidate(address,uint16,bool)",
            owner, marketId, longToken));
    }

    /*** uniswap Functions ***/

    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external override {
        delegateToImplementation(abi.encodeWithSignature("uniswapV2Call(address,uint256,uint256,bytes)",
            sender, amount0, amount1, data));
    }

    //
    //    function hswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external override {
    //        delegateToImplementation(abi.encodeWithSignature("hswapV2Call(address,uint256,uint256,bytes)",
    //            sender, amount0, amount1, data));
    //    }
    //
    //    function pancakeCall(address sender, uint amount0, uint amount1, bytes calldata data) external override {
    //        delegateToImplementation(abi.encodeWithSignature("pancakeCall(address,uint256,uint256,bytes)",
    //            sender, amount0, amount1, data));
    //    }

    function calBuyAmount(address buyToken, address sellToken, uint sellAmount) external override view returns (uint){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("calBuyAmount(address,address,uint256)", buyToken, sellToken, sellAmount));
        return abi.decode(data, (uint));
    }

    /*** Admin Functions ***/

    function setDefaultMarginRatio(uint32 newRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("setDefaultMarginRatio(uint32)", newRatio));
    }

    function setMarketMarginLimit(uint16 marketId, uint32 newRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("setMarketMarginLimit(uint16,uint32)", marketId, newRatio));
    }

    function setFeesRate(uint newRate) external override {
        delegateToImplementation(abi.encodeWithSignature("setFeesRate(uint256)", newRate));
    }

    function setInsuranceRatio(uint8 newRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("setInsuranceRatio(uint8)", newRatio));
    }

    function setController(address newController) external override {
        delegateToImplementation(abi.encodeWithSignature("setController(address)", newController));
    }

    function setPriceOracle(PriceOracleInterface newPriceOracle) external override {
        delegateToImplementation(abi.encodeWithSignature("setPriceOracle(address)", newPriceOracle));
    }

    function setUniswapFactory(IUniswapV2Factory _uniswapFactory) external override {
        delegateToImplementation(abi.encodeWithSignature("setUniswapFactory(address)", _uniswapFactory));
    }
    function setReferral(ReferralInterface  _referral) external override {
        delegateToImplementation(abi.encodeWithSignature("setReferral(address)", _referral));
    }

    function moveInsurance(uint16 marketId, uint8 poolIndex, address to, uint amount) external override {
        delegateToImplementation(abi.encodeWithSignature("moveInsurance(uint16,uint8,address,uint256)", marketId, poolIndex, to, amount));
    }

    function delegateTo(address callee, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory returnData) = callee.delegatecall(data);
        assembly {
            if eq(success, 0) {revert(add(returnData, 0x20), returndatasize())}
        }
        return returnData;
    }

    function delegateToImplementation(bytes memory data) public returns (bytes memory) {
        return delegateTo(implementation, data);
    }

    function delegateToViewImplementation(bytes memory data) public view returns (bytes memory) {
        (bool success, bytes memory returnData) = address(this).staticcall(abi.encodeWithSignature("delegateToImplementation(bytes)", data));
        assembly {
            if eq(success, 0) {revert(add(returnData, 0x20), returndatasize())}
        }
        return abi.decode(returnData, (bytes));
    }

    /**
     * Delegates execution to an implementation contract
     * @dev It returns to the external caller whatever the implementation returns or forwards reverts
     */
    receive() external payable {
        require(msg.value == 0, "cannot send value to fallback");
        // delegate all other functions to current implementation
        (bool success,) = implementation.delegatecall(msg.data);

        assembly {
            let free_mem_ptr := mload(0x40)
            returndatacopy(free_mem_ptr, 0, returndatasize())

            switch success
            case 0 {revert(free_mem_ptr, returndatasize())}
            default {return (free_mem_ptr, returndatasize())}
        }
    }
}
