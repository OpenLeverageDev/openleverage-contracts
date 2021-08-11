// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

interface DexAggregatorInterface {

    function sell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, bytes memory data) external returns (uint buyAmount);

    function buy(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount, bytes memory data) external returns (uint sellAmount);

    function calBuyAmount(address buyToken, address sellToken, uint sellAmount, bytes memory data) external view returns (uint);

    function getPrice(address desToken, address quoteToken, bytes memory data) external view returns (uint256 price, uint8 decimals);

    function getAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view returns (uint256 price, uint8 decimals, uint256 timestamp);

    function getCurrentPriceAndAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view returns (uint currentPrice, uint256 avgPrice, uint8 decimals, uint256 timestamp);

    //cal current avg price and get history avg price
    function getPriceCAvgPriceHAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view returns (uint price, uint cAvgPrice, uint256 hAvgPrice, uint8 decimals, uint256 timestamp);

    function updatePriceOracle(address desToken, address quoteToken, bytes memory data) external;
}
