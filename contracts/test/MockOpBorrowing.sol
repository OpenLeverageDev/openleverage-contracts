// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;


contract MockOpBorrowing {


    uint16 public  marketId;
    address public pool0;
    address public pool1;
    mapping(address => mapping(uint16 => mapping(bool => uint))) public activeCollaterals;

    function addMarket(uint16 _marketId, address _pool0, address _pool1, bytes memory dexData) external {
        marketId = _marketId;
        pool0 = _pool0;
        pool1 = _pool1;
    }

    function setActiveBorrows(address borrower, uint16 marketId, bool collateralIndex, uint collateral) external {
        activeCollaterals[borrower][marketId][collateralIndex] = collateral;
    }


}
