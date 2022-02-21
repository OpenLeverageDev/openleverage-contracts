// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

import "../Adminable.sol";
import "../DelegatorInterface.sol";

contract LPoolDepositorDelegator is DelegatorInterface, Adminable {

    constructor(address implementation_, address payable admin_) {
        admin = admin_;
        implementation = implementation_;
    }

    function setImplementation(address implementation_) public override onlyAdmin {
        address oldImplementation = implementation;
        implementation = implementation_;
        emit NewImplementation(oldImplementation, implementation);
    }
}
