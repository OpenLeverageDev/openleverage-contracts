// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.3;

interface PriceOracleInterface {
    //price,decimals
    function getPrice(address desToken, address quoteToken) external view returns (uint256, uint8);

}
