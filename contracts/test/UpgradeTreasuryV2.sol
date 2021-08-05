// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.3;

import "../Treasury.sol";

pragma experimental ABIEncoderV2;

contract UpgradeTreasuryV2 is Treasury {
    int public version;

    function getName() external pure returns (string memory)  {
        return "TreasuryUpgradeV2";
    }

    function setVersion() external {
        version = version + 1;
    }
}
