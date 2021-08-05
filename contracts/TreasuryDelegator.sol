// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.3;

import "./DelegatorInterface.sol";
import "./ControllerInterface.sol";
import "./TreasuryInterface.sol";
import "./Adminable.sol";
import "./dex/IUniswapV2Callee.sol";


contract TreasuryDelegator is DelegatorInterface, TreasuryInterface, TreasuryStorage, Adminable, IUniswapV2Callee {

    constructor(IUniswapV2Factory _uniswapFactory,
        address _openlevToken,
        address _sharingToken,
        uint _devFundRatio,
        address _dev,
        address payable admin_,
        address implementation_) {
        admin = msg.sender;
        // Creator of the contract is admin during initialization
        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address,address,address,uint256,address)",
            _uniswapFactory,
            _openlevToken,
            _sharingToken,
            _devFundRatio,
            _dev
            ));
        implementation = implementation_;

        // Set the proper admin now that initialization is done
        admin = admin_;
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

    /*** Policy Hooks ***/

    function convertToSharingToken(address fromToken, uint amount, uint minBuyAmount) external override {
        delegateToImplementation(abi.encodeWithSignature("convertToSharingToken(address,uint256,uint256)", fromToken, amount, minBuyAmount));
    }

    function devWithdraw(uint amount) external override {
        delegateToImplementation(abi.encodeWithSignature("devWithdraw(uint256)", amount));
    }

    function earned(address account) external override view returns (uint){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("earned(address)", account));
        return abi.decode(data, (uint));
    }

    function stake(uint amount) external override {
        delegateToImplementation(abi.encodeWithSignature("stake(uint256)", amount));
    }

    function withdraw(uint amount) external override {
        delegateToImplementation(abi.encodeWithSignature("withdraw(uint256)", amount));
    }

    function getReward() external override {
        delegateToImplementation(abi.encodeWithSignature("getReward()"));
    }

    function exit() external override {
        delegateToImplementation(abi.encodeWithSignature("exit()"));
    }

    /*** uniswap Functions ***/

    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external override {
        delegateToImplementation(abi.encodeWithSignature("uniswapV2Call(address,uint256,uint256,bytes)",
            sender, amount0, amount1, data));
    }

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

    function setDevFundRatio(uint newRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("setDevFundRatio(uint256)", newRatio));
    }


    function setDev(address newDev) external override {
        delegateToImplementation(abi.encodeWithSignature("setDev(address)", newDev));
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
