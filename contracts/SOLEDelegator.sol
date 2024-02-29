// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

import "./XOLEDelegator.sol";

contract SOLEDelegator is XOLEDelegator {

    constructor(
        address _oleToken,
        DexAggregatorInterface _dexAgg,
        uint _devFundRatio,
        address _dev,
        address payable _admin,
        address implementation_)XOLEDelegator(_oleToken, _dexAgg, _devFundRatio, _dev, _admin, implementation_) {
    }

}
