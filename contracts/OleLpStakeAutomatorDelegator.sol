// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

import "./Adminable.sol";
import "./DelegatorInterface.sol";


contract OleLpStakeAutomatorDelegator is DelegatorInterface, Adminable {

    constructor(address _xole,
        address _ole,
        address _otherToken,
        address _lpToken,
        address _nativeToken,
        address _router,
        address payable admin_,
        address implementation_) {
        admin = msg.sender;
        // Creator of the contract is admin during initialization
        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address,address,address,address,address,address)",
            _xole,
            _ole,
            _otherToken,
            _lpToken,
            _nativeToken,
            _router));
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
}