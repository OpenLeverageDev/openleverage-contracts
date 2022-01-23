// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "./PancakeDex.sol";
import "../DexAggregatorInterface.sol";
import "../../lib/DexData.sol";
import "../../lib/Utils.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../DelegateInterface.sol";
import "../../Adminable.sol";

contract BscDexAggregatorV1 is DelegateInterface, Adminable, DexAggregatorInterface, PancakeDex {
    using DexData for bytes;
    using SafeMath for uint;
    
    mapping(IUniswapV2Pair => V2PriceOracle) public pancakePriceOracle;
    IUniswapV2Factory public pancakeFactory;
    address public openLev;

    uint8 private constant priceDecimals = 18;

    //pancakeFactory: 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73
    function initialize(
        IUniswapV2Factory _pancakeFactory,
        address _unsedFactory
    ) public {
        require(msg.sender == admin, "Not admin");
        // Shh - currently unused
        _unsedFactory;
        pancakeFactory = _pancakeFactory;
    }

    function setOpenLev(address _openLev) external onlyAdmin {
        require(address(0) != _openLev, '0x');
        openLev = _openLev;
    }

    function sell(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        buyTax;
        sellTax;
        address payer = msg.sender;
        if (data.toDex() == DexData.DEX_PANCAKE) {
            buyAmount = pancakeSell(pancakeFactory, buyToken, sellToken, sellAmount, minBuyAmount, payer, payer);
        }else {
            revert('Unsupported dex');
        }
    }

    function sellMul(uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        if (data.toDex() == DexData.DEX_PANCAKE) {
            buyAmount = pancakeSellMul(pancakeFactory, sellAmount, minBuyAmount, data.toUniV2Path());
        }else {
            revert('Unsupported dex');
        }
    }

    function buy(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint buyAmount, uint maxSellAmount, bytes memory data) external override returns (uint sellAmount){
        if (data.toDex() == DexData.DEX_PANCAKE) {
            sellAmount = pancakeBuy(pancakeFactory, buyToken, sellToken, buyAmount, maxSellAmount, buyTax, sellTax);
        }else {
            revert('Unsupported dex');
        }
    }


    function calBuyAmount(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint sellAmount, bytes memory data) external view override returns (uint buyAmount) {
        if (data.toDex() == DexData.DEX_PANCAKE) {
            sellAmount = Utils.toAmountAfterTax(sellAmount, sellTax);
            buyAmount = pancakeCalBuyAmount(pancakeFactory, buyToken, sellToken, sellAmount);
            buyAmount = Utils.toAmountAfterTax(buyAmount, buyTax);
        }
        else {
            revert('Unsupported dex');
        }
    }

    function calSellAmount(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint buyAmount, bytes memory data) external view override returns (uint sellAmount){
        if (data.toDex() == DexData.DEX_PANCAKE) {
            sellAmount = pancakeCalSellAmount(pancakeFactory, buyToken, sellToken, buyAmount, buyTax, sellTax);
        }
        else {
            revert('Unsupported dex');
        }
    }

    function getPrice(address desToken, address quoteToken, bytes memory data) external view override returns (uint256 price, uint8 decimals){
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_PANCAKE) {
            price = pancakeGetPrice(pancakeFactory, desToken, quoteToken, decimals);
        }else {
            revert('Unsupported dex');
        }
    }

    function getAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view override returns (uint256 price, uint8 decimals, uint256 timestamp){
        // Shh - currently unused
        secondsAgo;
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_PANCAKE) {
            address pair = getPancakeClassPair(desToken, quoteToken, pancakeFactory);
            V2PriceOracle memory priceOracle = pancakePriceOracle[IUniswapV2Pair(pair)];
            (price, timestamp) = pancakeGetAvgPrice(desToken, quoteToken, priceOracle);
        } else {
            revert('Unsupported dex');
        }
    }

    /*
    @notice get current and history price
    @param desToken
    @param quoteToken
    @param secondsAgo TWAP length for UniV3
    @param dexData dex parameters
    Returns
    @param price real-time price
    @param cAvgPrice current TWAP price
    @param hAvgPrice historical TWAP price
    @param decimals token price decimal
    @param timestamp last TWAP price update timestamp */
    function getPriceCAvgPriceHAvgPrice(
        address desToken,
        address quoteToken,
        uint32 secondsAgo,
        bytes memory dexData
    ) external view override returns (uint price, uint cAvgPrice, uint256 hAvgPrice, uint8 decimals, uint256 timestamp){
        secondsAgo;
        decimals = priceDecimals;
        if (dexData.toDex() == DexData.DEX_PANCAKE) {
            address pair = getPancakeClassPair(desToken, quoteToken, pancakeFactory);
            V2PriceOracle memory priceOracle = pancakePriceOracle[IUniswapV2Pair(pair)];
            (price, cAvgPrice, hAvgPrice, timestamp) = pancakeGetPriceCAvgPriceHAvgPrice(pair, priceOracle, desToken, quoteToken, decimals);
        } else {
            revert('Unsupported dex');
        }
    }

    function updatePriceOracle(address desToken, address quoteToken, uint32 timeWindow, bytes memory data) external override returns (bool){
        require(msg.sender == openLev, "Only openLev can update price");
        if (data.toDex() == DexData.DEX_PANCAKE) {
            address pair = getPancakeClassPair(desToken, quoteToken, pancakeFactory);
            V2PriceOracle memory priceOracle = pancakePriceOracle[IUniswapV2Pair(pair)];
            (V2PriceOracle memory updatedPriceOracle, bool updated) = pancakeUpdatePriceOracle(pair, priceOracle, timeWindow, priceDecimals);
            if (updated) {
                pancakePriceOracle[IUniswapV2Pair(pair)] = updatedPriceOracle;
            }
            return updated;
        }
        return false;
    }

    function updateV3Observation(address desToken, address quoteToken, bytes memory data) external pure override {
        // Shh - currently unused
        (desToken,quoteToken, data);
        revert("Not implemented");
    }
}
