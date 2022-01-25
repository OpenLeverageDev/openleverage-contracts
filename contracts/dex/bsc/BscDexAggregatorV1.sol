// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "./UniV2ClassDex.sol";
import "../DexAggregatorInterface.sol";
import "../../lib/DexData.sol";
import "../../lib/Utils.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../DelegateInterface.sol";
import "../../Adminable.sol";

contract BscDexAggregatorV1 is DelegateInterface, Adminable, DexAggregatorInterface, UniV2ClassDex {
    using DexData for bytes;
    using SafeMath for uint;

    mapping(IUniswapV2Pair => V2PriceOracle) public uniV2PriceOracle;
    IUniswapV2Factory public pancakeFactory;
    address public openLev;
    uint8 private constant priceDecimals = 18;

    mapping(uint8 => DexInfo) public dexInfo;

    //pancakeFactory: 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73
    function initialize(
        IUniswapV2Factory _pancakeFactory,
        address _unsedFactory
    ) public {
        require(msg.sender == admin, "Not admin");
        // Shh - currently unused
        _unsedFactory;
        pancakeFactory = _pancakeFactory;
        dexInfo[DexData.DEX_PANCAKE] = DexInfo(_pancakeFactory, 25);
    }

    function setDexInfo(uint8[] memory dexName, IUniswapV2Factory[] memory factoryAddr, uint16[] memory fees) external override onlyAdmin {
        require(dexName.length == factoryAddr.length && dexName.length == fees.length, 'EOR');
        for (uint i = 0; i < dexName.length; i++) {
            DexInfo memory info = DexInfo(factoryAddr[i], fees[i]);
            dexInfo[dexName[i]] = info;
        }
    }

    function setOpenLev(address _openLev) external onlyAdmin {
        require(address(0) != _openLev, '0x');
        openLev = _openLev;
    }

    function sell(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        buyTax;
        sellTax;
        address payer = msg.sender;
        buyAmount = uniClassSell(dexInfo[data.toDex()], buyToken, sellToken, sellAmount, minBuyAmount, payer, payer);
    }

    function sellMul(uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        buyAmount = uniClassSellMul(dexInfo[data.toDex()], sellAmount, minBuyAmount, data.toUniV2Path());
    }

    function buy(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint buyAmount, uint maxSellAmount, bytes memory data) external override returns (uint sellAmount){
        sellAmount = uniClassBuy(dexInfo[data.toDex()], buyToken, sellToken, buyAmount, maxSellAmount, buyTax, sellTax);
    }


    function calBuyAmount(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint sellAmount, bytes memory data) external view override returns (uint buyAmount) {
        sellAmount = Utils.toAmountAfterTax(sellAmount, sellTax);
        buyAmount = uniClassCalBuyAmount(dexInfo[data.toDex()], buyToken, sellToken, sellAmount);
        buyAmount = Utils.toAmountAfterTax(buyAmount, buyTax);
    }

    function calSellAmount(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint buyAmount, bytes memory data) external view override returns (uint sellAmount){
        sellAmount = uniClassCalSellAmount(dexInfo[data.toDex()], buyToken, sellToken, buyAmount, buyTax, sellTax);
    }

    function getPrice(address desToken, address quoteToken, bytes memory data) external view override returns (uint256 price, uint8 decimals){
        decimals = priceDecimals;
        price = uniClassGetPrice(dexInfo[data.toDex()].factory, desToken, quoteToken, decimals);
    }

    function getAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view override returns (uint256 price, uint8 decimals, uint256 timestamp){
        // Shh - currently unused
        secondsAgo;
        decimals = priceDecimals;
        address pair = getUniClassPair(desToken, quoteToken, dexInfo[data.toDex()].factory);
        V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
        (price, timestamp) = uniClassGetAvgPrice(desToken, quoteToken, priceOracle);
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
        address pair = getUniClassPair(desToken, quoteToken, dexInfo[dexData.toDex()].factory);
        V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
        (price, cAvgPrice, hAvgPrice, timestamp) = uniClassGetPriceCAvgPriceHAvgPrice(pair, priceOracle, desToken, quoteToken, decimals);
    }

    function updatePriceOracle(address desToken, address quoteToken, uint32 timeWindow, bytes memory data) external override returns (bool){
        require(msg.sender == openLev, "Only openLev can update price");
        address pair = getUniClassPair(desToken, quoteToken, dexInfo[data.toDex()].factory);
        V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
        (V2PriceOracle memory updatedPriceOracle, bool updated) = uniClassUpdatePriceOracle(pair, priceOracle, timeWindow, priceDecimals);
        if (updated) {
            uniV2PriceOracle[IUniswapV2Pair(pair)] = updatedPriceOracle;
        }
        return updated;
    }

    function updateV3Observation(address desToken, address quoteToken, bytes memory data) external pure override {
        // Shh - currently unused
        (desToken,quoteToken, data);
        revert("Not implemented");
    }
}
