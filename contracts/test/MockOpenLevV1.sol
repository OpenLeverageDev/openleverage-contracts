// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;


contract MockOpenLevV1 {

    struct Trade {
        uint deposited;
        uint held;
        bool depositToken;
        uint128 lastBlockNum;
    }


    mapping(address => mapping(uint16 => mapping(bool => Trade))) public activeTrades;

    function setActiveTrades(address trader, uint16 marketId, bool longToken, uint collateral) external {
        activeTrades[trader][marketId][longToken] = Trade(0, 1, false, 0);
    }


}
