// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "./UniV2Dex.sol";
import "./UniV3Dex.sol";
import "./DexAggregatorInterface.sol";
import "../lib/DexData.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../DelegateInterface.sol";
import "../Adminable.sol";


contract DexAggregatorV1 is DelegateInterface, Adminable, DexAggregatorInterface, UniV2Dex, UniV3Dex {
    using DexData for bytes;
    using SafeMath for uint;
    mapping(IUniswapV2Pair => V2PriceOracle)  public uniV2PriceOracle;
    IUniswapV2Factory public uniV2Factory;
    uint8 private constant priceDecimals = 12;

    constructor ()
    {
    }
    //v2 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f
    //v3 0x1f98431c8ad98523631ae4a59f267346ea31f984
    function initialize(
        IUniswapV2Factory _uniV2Factory,
        IUniswapV3Factory _uniV3Factory
    ) public {
        require(msg.sender == admin, "Not admin");
        uniV2Factory = _uniV2Factory;
        initializeUniV3(_uniV3Factory);
    }

    function sell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        if (data.toDex() == DexData.DEX_UNIV2) {
            buyAmount = uniV2Sell(uniV2Factory.getPair(buyToken, sellToken), buyToken, sellToken, sellAmount, minBuyAmount);
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
            sellAmount = uniV2Buy(uniV2Factory.getPair(buyToken, sellToken), buyToken, sellToken, buyAmount, maxSellAmount);
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
            buyAmount = uniV2CalBuyAmount(uniV2Factory.getPair(buyToken, sellToken), buyToken, sellAmount);
        }
        else {
            require(false, 'Unsupported dex');
        }
    }


    function getPrice(address desToken, address quoteToken, bytes memory data) external view override returns (uint256 price, uint8 decimals){
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_UNIV2) {
            price = uniV2GetPrice(uniV2Factory.getPair(desToken, quoteToken), desToken, decimals);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            price = uniV3GetPrice(desToken, quoteToken, decimals, data.toFee());
        }
        else {
            require(false, 'Unsupported dex');
        }
    }

    function getAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view override returns (uint256 price, uint8 decimals, uint256 timestamp){
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_UNIV2) {
            address pair = uniV2Factory.getPair(desToken, quoteToken);
            V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
            (price, timestamp) = uniV2GetAvgPrice(pair, priceOracle, desToken);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            (price, timestamp) = uniV3GetAvgPrice(desToken, quoteToken, secondsAgo, decimals, data.toFee());
        }
        else {
            require(false, 'Unsupported dex');
        }
    }

    function getCurrentPriceAndAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view override returns (uint currentPrice, uint256 avgPrice, uint8 decimals, uint256 timestamp){
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_UNIV2) {
            address pair = uniV2Factory.getPair(desToken, quoteToken);
            V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
            (currentPrice, avgPrice, timestamp) = uniV2GetCurrentPriceAndAvgPrice(pair, priceOracle, desToken, decimals);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            (currentPrice, avgPrice, timestamp) = uniV3GetCurrentPriceAndAvgPrice(desToken, quoteToken, secondsAgo, decimals, data.toFee());
        }
        else {
            require(false, 'Unsupported dex');
        }
    }

    function getPriceCAvgPriceHAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view override returns (uint price, uint cAvgPrice, uint256 hAvgPrice, uint8 decimals, uint256 timestamp){
        // Shh - currently unused
        secondsAgo;
        data;
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_UNIV2) {
            address pair = uniV2Factory.getPair(desToken, quoteToken);
            V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
            (price, cAvgPrice, hAvgPrice, timestamp) = uniV2GetPriceCAvgPriceHAvgPrice(pair, priceOracle, desToken, decimals);
        }
        else {
            require(false, 'Unsupported dex');
        }
    }

    function updatePriceOracle(address desToken, address quoteToken, bytes memory data) external override {
        if (data.toDex() == DexData.DEX_UNIV2) {
            address pair = uniV2Factory.getPair(desToken, quoteToken);
            V2PriceOracle storage priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
            uniV2UpdatePriceOracle(pair, priceOracle, priceDecimals);
        }
    }

}
