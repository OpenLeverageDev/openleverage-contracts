// SPDX-License-Identifier: MIT


pragma solidity 0.7.3;

abstract contract Adminable {
    address payable public admin;
    address payable public pendingAdmin;

    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    event NewAdmin(address oldAdmin, address newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "caller must be admin");
        _;
    }

    function setPendingAdmin(address payable newPendingAdmin) external virtual onlyAdmin {
        // Save current value, if any, for inclusion in log
        address oldPendingAdmin = pendingAdmin;
        // Store pendingAdmin with value newPendingAdmin
        pendingAdmin = newPendingAdmin;
        // Emit NewPendingAdmin(oldPendingAdmin, newPendingAdmin)
        emit NewPendingAdmin(oldPendingAdmin, newPendingAdmin);
    }

    function acceptAdmin() external virtual {
        require(msg.sender == pendingAdmin, "only pendingAdmin can accept admin");
        // Save current values for inclusion in log
        address oldAdmin = admin;
        address oldPendingAdmin = pendingAdmin;
        // Store admin with value pendingAdmin
        admin = pendingAdmin;
        // Clear the pending value
        pendingAdmin = address(0);
        emit NewAdmin(oldAdmin, admin);
        emit NewPendingAdmin(oldPendingAdmin, pendingAdmin);
    }

}
