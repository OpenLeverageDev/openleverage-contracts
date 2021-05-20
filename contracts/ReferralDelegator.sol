// SPDX-License-Identifier: MIT
pragma solidity 0.7.3;

import "./DelegatorInterface.sol";
import "./ControllerInterface.sol";
import "./TreasuryInterface.sol";
import "./Adminable.sol";
import "./dex/IUniswapV2Callee.sol";
import "./ReferralInterface.sol";


contract ReferralDelegator is DelegatorInterface, ReferralInterface, ReferralStorage, Adminable {

    constructor(
        address _openLev,
        address payable admin_,
        address implementation_) {
        admin = msg.sender;
        // Creator of the contract is admin during initialization
        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address)", _openLev));
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

    function registerReferrer() external override {
        delegateToImplementation(abi.encodeWithSignature("registerReferrer()"));
    }

    function calReferralReward(address referee, address referrer, uint baseAmount, address token) external override returns (uint) {
        bytes memory data = delegateToImplementation(abi.encodeWithSignature("calReferralReward(address,address,uint256,address)",
            referee, referrer, baseAmount, token));
        return abi.decode(data, (uint));
    }

    function getReward(address referrer, address token) external view override returns (uint){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("getReward(address,address)",
            referrer, token));
        return abi.decode(data, (uint));
    }

    function withdrawReward(address token) external override {
        delegateToImplementation(abi.encodeWithSignature("withdrawReward(address)", token));
    }

    function setRate(uint _firstLevelRate, uint _secondLevelRate) external override {
        delegateToImplementation(abi.encodeWithSignature("setRate(uint256,uint256)", _firstLevelRate, _secondLevelRate));
    }

    function setOpenLev(address _openLev) external override {
        delegateToImplementation(abi.encodeWithSignature("setOpenLev(address)", _openLev));
    }
    /**
    * Internal method to delegate execution to another contract
    * @dev It returns to the external caller whatever the implementation returns or forwards reverts
    * @param callee The contract to delegatecall
    * @param data The raw data to delegatecall
    * @return The returned bytes from the delegatecall
    */
    function delegateTo(address callee, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory returnData) = callee.delegatecall(data);
        assembly {
            if eq(success, 0) {revert(add(returnData, 0x20), returndatasize())}
        }
        return returnData;
    }

    /**
     * Delegates execution to the implementation contract
     * @dev It returns to the external caller whatever the implementation returns or forwards reverts
     * @param data The raw data to delegatecall
     * @return The returned bytes from the delegatecall
     */
    function delegateToImplementation(bytes memory data) public returns (bytes memory) {
        return delegateTo(implementation, data);
    }

    /**
     * Delegates execution to an implementation contract
     * @dev It returns to the external caller whatever the implementation returns or forwards reverts
     *  There are an additional 2 prefix uints from the wrapper returndata, which we ignore since we make an extra hop.
     * @param data The raw data to delegatecall
     * @return The returned bytes from the delegatecall
     */
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
