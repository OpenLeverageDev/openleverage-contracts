// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "./UniV2Dex.sol";
import "./UniV3Dex.sol";
import "./DexAggregatorInterface.sol";
import "../lib/DexData.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


contract DexAggregatorV1 is DexAggregatorInterface, UniV2Dex, UniV3Dex {
    using DexData for bytes;
    using SafeMath for uint;

    uint8 private constant priceDecimals = 12;
    //v2 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f
    //v3 0x1f98431c8ad98523631ae4a59f267346ea31f984
    constructor (
        IUniswapV2Factory _uniV2Factory,
        IUniswapV3Factory _uniV3Factory) UniV2Dex(_uniV2Factory) UniV3Dex(_uniV3Factory){
    }
    function sell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        if (data.toDex() == DexData.DEX_UNIV2) {
            buyAmount = uniV2Sell(buyToken, sellToken, sellAmount, minBuyAmount);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            buyAmount = uniV3Sell(buyToken, sellToken, sellAmount, minBuyAmount, data.toFee());
        }
        else {
            require(false, 'Unsupported dex');
        }
    }

    function buy(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount, bytes memory data) external override returns (uint sellAmount){
        if (data.toDex() == DexData.DEX_UNIV2) {
            sellAmount = uniV2Buy(buyToken, sellToken, buyAmount, maxSellAmount);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            sellAmount = uniV3Buy(buyToken, sellToken, buyAmount, maxSellAmount, data.toFee());
        }
        else {
            require(false, 'Unsupported dex');
        }
    }


    function calBuyAmount(address buyToken, address sellToken, uint sellAmount, bytes memory data) external view override returns (uint buyAmount) {
        if (data.toDex() == DexData.DEX_UNIV2) {
            buyAmount = uniV2CalBuyAmount(buyToken, sellToken, sellAmount);
        }
        else {
            require(false, 'Unsupported dex');
        }
    }


    function getPrice(address desToken, address quoteToken, bytes memory data) external view override returns (uint256 price, uint8 decimals){
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_UNIV2) {
            price = uniV2GetPrice(desToken, quoteToken, decimals);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            price = uniV3GetPrice(desToken, quoteToken, decimals, data.toFee());
        }
        else {
            require(false, 'Unsupported dex');
        }
    }

    function getAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view override returns (uint256 price, uint8 decimals){
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_UNIV3) {
            price = uniV3GetAvgPrice(desToken, quoteToken, secondsAgo, decimals, data.toFee());
        }
        else {
            require(false, 'Unsupported dex');
        }
    }
}
