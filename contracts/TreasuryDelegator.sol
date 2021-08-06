// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;


import "./DelegatorInterface.sol";
import "./ControllerInterface.sol";
import "./TreasuryInterface.sol";
import "./Adminable.sol";


contract TreasuryDelegator is DelegatorInterface, TreasuryInterface, TreasuryStorage, Adminable {

    constructor(DexAggregatorInterface _dexAggregator,
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
            _dexAggregator,
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

    function convertToSharingToken(address fromToken, uint amount, uint minBuyAmount, bytes memory dexData) external override {
        delegateToImplementation(abi.encodeWithSignature("convertToSharingToken(address,uint256,uint256,bytes)", fromToken, amount, minBuyAmount, dexData));
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


    /*** Admin Functions ***/

    function setDevFundRatio(uint newRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("setDevFundRatio(uint256)", newRatio));
    }

    function setDexAggregator(DexAggregatorInterface newDexAggregator) external override {
        delegateToImplementation(abi.encodeWithSignature("setDexAggregator(address)", newDexAggregator));
    }

    function setDev(address newDev) external override {
        delegateToImplementation(abi.encodeWithSignature("setDev(address)", newDev));
    }

}
