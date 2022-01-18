// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "./UniV2Dex.sol";
import "./UniV3Dex.sol";
import "../DexAggregatorInterface.sol";
import "../../lib/DexData.sol";
import "../../lib/Utils.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../DelegateInterface.sol";
import "../../Adminable.sol";


contract EthDexAggregatorV1 is DelegateInterface, Adminable, DexAggregatorInterface, UniV2Dex, UniV3Dex {
    using DexData for bytes;
    using SafeMath for uint;
    
    mapping(IUniswapV2Pair => V2PriceOracle)  public uniV2PriceOracle;
    IUniswapV2Factory public uniV2Factory;
    address public openLev;

    uint8 private constant priceDecimals = 18;

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

    function setOpenLev(address _openLev) external onlyAdmin {
        require(address(0) != _openLev, '0x');
        openLev = _openLev;
    }

    function sell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        address payer = msg.sender;
        if (data.toDex() == DexData.DEX_UNIV2) {
            buyAmount = uniV2Sell(uniV2Factory, buyToken, sellToken, sellAmount, minBuyAmount, payer, payer);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            buyAmount = uniV3Sell(buyToken, sellToken, sellAmount, minBuyAmount, data.toFee(), true, payer, payer);
        }
        else {
            revert('Unsupported dex');
        }
    }

    function sellMul(uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        if (data.toDex() == DexData.DEX_UNIV2) {
            buyAmount = uniV2SellMul(uniV2Factory, sellAmount, minBuyAmount, data.toUniV2Path());
        } else if (data.toDex() == DexData.DEX_UNIV3) {
            buyAmount = uniV3SellMul(sellAmount, minBuyAmount, data.toUniV3Path());
        }
        else {
            revert('Unsupported dex');
        }
    }

    function buy(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint buyAmount, uint maxSellAmount, bytes memory data) external override returns (uint sellAmount){
        if (data.toDex() == DexData.DEX_UNIV2) {
            sellAmount = uniV2Buy(uniV2Factory, buyToken, sellToken, buyAmount, maxSellAmount, buyTax, sellTax);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            sellAmount = uniV3Buy(buyToken, sellToken, buyAmount, maxSellAmount, data.toFee(), true, buyTax, sellTax);
        }
        else {
            revert('Unsupported dex');
        }
    }


    function calBuyAmount(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint sellAmount, bytes memory data) external view override returns (uint buyAmount) {
        if (data.toDex() == DexData.DEX_PANCAKE) {
            sellAmount = Utils.toAmountBeforeTax(sellAmount, sellTax);
            buyAmount = uniV2CalBuyAmount(uniV2Factory, buyToken, sellToken, sellAmount);
            buyAmount = Utils.toAmountAfterTax(buyAmount, buyTax);
        }
        else {
            revert('Unsupported dex');
        }
    }

    function calSellAmount(address buyToken, address sellToken, uint buyAmount, bytes memory data) external view override returns (uint sellAmount){
        if (data.toDex() == DexData.DEX_UNIV2) {
            uint24[] memory transferFeeRate = data.toTransferFeeRates(true);
            sellAmount = uniV2CalSellAmount(uniV2Factory, buyToken, sellToken, buyAmount, transferFeeRate[0], transferFeeRate[transferFeeRate.length - 1]);
        }
        else {
            revert('Unsupported dex');
        }
    }


    function getPrice(address desToken, address quoteToken, bytes memory data) external view override returns (uint256 price, uint8 decimals){
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_UNIV2) {
            price = uniV2GetPrice(uniV2Factory, desToken, quoteToken, decimals);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            (price,) = uniV3GetPrice(desToken, quoteToken, decimals, data.toFee());
        }
        else {
            revert('Unsupported dex');
        }
    }

    function getAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view override returns (uint256 price, uint8 decimals, uint256 timestamp){
        decimals = priceDecimals;
        if (data.toDex() == DexData.DEX_UNIV2) {
            address pair = getUniV2ClassPair(desToken, quoteToken, uniV2Factory);
            V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
            (price, timestamp) = uniV2GetAvgPrice(desToken, quoteToken, priceOracle);
        }
        else if (data.toDex() == DexData.DEX_UNIV3) {
            (price, timestamp,) = uniV3GetAvgPrice(desToken, quoteToken, secondsAgo, decimals, data.toFee());
        }
        else {
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
        decimals = priceDecimals;
        if (dexData.toDex() == DexData.DEX_UNIV2) {
            address pair = getUniV2ClassPair(desToken, quoteToken, uniV2Factory);
            V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
            (price, cAvgPrice, hAvgPrice, timestamp) = uniV2GetPriceCAvgPriceHAvgPrice(pair, priceOracle, desToken, quoteToken, decimals);
        } else if (dexData.toDex() == DexData.DEX_UNIV3) {
            (price, cAvgPrice, hAvgPrice, timestamp) = uniV3GetPriceCAvgPriceHAvgPrice(desToken, quoteToken, secondsAgo, decimals, dexData.toFee());
        }
        else {
            revert('Unsupported dex');
        }
    }

    function updatePriceOracle(address desToken, address quoteToken, uint32 timeWindow, bytes memory data) external override returns (bool){
        require(msg.sender == openLev, "Only openLev can update price");
        if (data.toDex() == DexData.DEX_UNIV2) {
            address pair = getUniV2ClassPair(desToken, quoteToken, uniV2Factory);
            V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
            (V2PriceOracle memory updatedPriceOracle, bool updated) = uniV2UpdatePriceOracle(pair, priceOracle, timeWindow, priceDecimals);
            if (updated) {
                uniV2PriceOracle[IUniswapV2Pair(pair)] = updatedPriceOracle;
            }
            return updated;
        }
        return false;
    }

    function updateV3Observation(address desToken, address quoteToken, bytes memory data) external override {
        if (data.toDex() == DexData.DEX_UNIV3) {
            increaseV3Observation(desToken, quoteToken, data.toFee());
        }
    }
}
