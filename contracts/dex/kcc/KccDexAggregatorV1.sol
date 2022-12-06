// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "./KccUniV2Dex.sol";
import "../DexAggregatorInterface.sol";
import "../../lib/DexData.sol";
import "../../lib/Utils.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../DelegateInterface.sol";
import "../../Adminable.sol";

/// @title Swap logic on KCC
/// @author OpenLeverage
/// @notice Use this contract to swap tokens.
/// @dev Routers for different swap requests.
contract KccDexAggregatorV1 is DelegateInterface, Adminable, DexAggregatorInterface, KccUniV2Dex {
    using DexData for bytes;
    using SafeMath for uint;

    mapping(IUniswapV2Pair => V2PriceOracle)  public uniV2PriceOracle;
    IUniswapV2Factory public mojitoFactory;
    address public openLev;
    uint8 private constant priceDecimals = 24;

    mapping(uint8 => DexInfo) public dexInfo;

    //mojitoSwapFactory: 0x79855A03426e15Ad120df77eFA623aF87bd54eF3 、kuSwapFactory: 0xAE46cBBCDFBa3bE0F02F463Ec5486eBB4e2e65Ae
    function initialize(
        IUniswapV2Factory _mojitoFactory,
        address _unusedFactory
    ) public {
        require(msg.sender == admin, "Not admin");
        _unusedFactory;
        mojitoFactory = _mojitoFactory;
        dexInfo[DexData.DEX_MOJITO] = DexInfo(_mojitoFactory, 30);
    }

    /// @notice Save factories of the dex.
    /// @param dexName Index of Dex. find list of dex in contracts/lib/DexData.sol.
    /// @param factoryAddr Factory address of Different dex forked from uniswap.
    /// @param fees Swap fee collects by.
    function setDexInfo(uint8[] memory dexName, IUniswapV2Factory[] memory factoryAddr, uint16[] memory fees) external override onlyAdmin {
        require(dexName.length == factoryAddr.length && dexName.length == fees.length, 'EOR');
        for (uint i = 0; i < dexName.length; i++) {
            dexInfo[dexName[i]] = DexInfo(factoryAddr[i], fees[i]);
        }
    }

    /// @dev SetOpenlev address to update dex price
    function setOpenLev(address _openLev) external onlyAdmin {
        require(address(0) != _openLev, '0x');
        openLev = _openLev;
    }


    /// @notice Sell tokens
    /// @dev Sell exact amount of token with tax applied
    /// @param buyToken Address of token transfer from Dex pair
    /// @param sellToken Address of token transfer into Dex pair
    /// @param sellAmount Exact amount to sell
    /// @param minBuyAmount minmum amount of token to receive.
    /// @param data Dex to use for swap
    /// @return buyAmount Exact Amount bought
    function sell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        address payer = msg.sender;
        buyAmount = uniClassSell(dexInfo[data.toDex()], buyToken, sellToken, sellAmount, minBuyAmount, payer, payer);
    }

    /// @notice Sell tokens
    /// @dev Sell exact amount of token through path
    /// @param sellAmount Exact amount to sell
    /// @param minBuyAmount minmum amount of token to receive.
    /// @param data Dex to use for swap and path of the swap
    /// @return buyAmount Exact amount bought
    function sellMul(uint sellAmount, uint minBuyAmount, bytes memory data) external override returns (uint buyAmount){
        buyAmount = uniClassSellMul(dexInfo[data.toDex()], sellAmount, minBuyAmount, data.toUniV2Path());
    }

    /// @notice Buy tokens
    /// @dev Buy exact amount of token with tax applied
    /// @param buyToken Address of token transfer from Dex pair
    /// @param sellToken Address of token transfer into Dex pair
    /// @param buyTax Tax applyed by buyToken while transfer from Dex pair
    /// @param sellTax Tax applyed by sellToken while transfer into Dex pair
    /// @param buyAmount Exact amount to buy
    /// @param maxSellAmount maximum amount of token to receive.
    /// @param data Dex to use for swap
    /// @return sellAmount Exact amount sold
    function buy(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint buyAmount, uint maxSellAmount, bytes memory data) external override returns (uint sellAmount){
        sellAmount = uniClassBuy(dexInfo[data.toDex()], buyToken, sellToken, buyAmount, maxSellAmount, buyTax, sellTax);
    }

    /// @notice Calculate amount of token to buy
    /// @dev Calculate exact amount of token to buy with tax applied
    /// @param buyToken Address of token transfer from Dex pair
    /// @param sellToken Address of token transfer into Dex pair
    /// @param buyTax Tax applyed by buyToken while transfer from Dex pair
    /// @param sellTax Tax applyed by sellToken while transfer into Dex pair
    /// @param sellAmount Exact amount to sell
    /// @param data Dex to use for swap
    /// @return buyAmount Amount of buyToken would bought
    function calBuyAmount(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint sellAmount, bytes memory data) external view override returns (uint buyAmount) {
        sellAmount = Utils.toAmountAfterTax(sellAmount, sellTax);
        buyAmount = uniClassCalBuyAmount(dexInfo[data.toDex()], buyToken, sellToken, sellAmount);
        buyAmount = Utils.toAmountAfterTax(buyAmount, buyTax);
    }

    /// @notice Calculate amount of token to sell
    /// @dev Calculate exact amount of token to sell with tax applied
    /// @param buyToken Address of token transfer from Dex pair
    /// @param sellToken Address of token transfer into Dex pair
    /// @param buyTax Tax applyed by buyToken while transfer from Dex pair
    /// @param sellTax Tax applyed by SellToken while transfer into Dex pair
    /// @param buyAmount Exact amount to buy
    /// @param data Dex to use for swap
    /// @return sellAmount Amount of sellToken would sold
    function calSellAmount(address buyToken, address sellToken, uint24 buyTax, uint24 sellTax, uint buyAmount, bytes memory data) external view override returns (uint sellAmount){
        sellAmount = uniClassCalSellAmount(dexInfo[data.toDex()], buyToken, sellToken, buyAmount, buyTax, sellTax);
    }

    /// @notice Get price
    /// @dev Get current price of desToken / quoteToken
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param data Dex to use for swap
    function getPrice(address desToken, address quoteToken, bytes memory data) external view override returns (uint256 price, uint8 decimals){
        decimals = priceDecimals;
        price = uniClassGetPrice(dexInfo[data.toDex()].factory, desToken, quoteToken, decimals);
    }

    /// @dev Get average price of desToken / quoteToken in the last period of time
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param secondsAgo Time period of the average
    /// @param data Dex to use for swap
    function getAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, bytes memory data) external view override returns (uint256 price, uint8 decimals, uint256 timestamp){
        require(data.isUniV2Class(), "unsupported dex");
        // Shh - currently unused
        secondsAgo;
        decimals = priceDecimals;
        address pair = getUniClassPair(desToken, quoteToken, dexInfo[data.toDex()].factory);
        V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
        (price, timestamp) = uniClassGetAvgPrice(desToken, quoteToken, priceOracle);
    }

    /// @notice Fet current and history price
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param secondsAgo not used on BSC
    /// @param dexData dex parameters
    /// @return price Real-time price
    /// @return cAvgPrice Current TWAP price
    /// @return hAvgPrice Historical TWAP price
    /// @return decimals Token price decimal
    /// @return timestamp Last TWAP price update timestamp
    function getPriceCAvgPriceHAvgPrice(
        address desToken,
        address quoteToken,
        uint32 secondsAgo,
        bytes memory dexData
    ) external view override returns (uint price, uint cAvgPrice, uint256 hAvgPrice, uint8 decimals, uint256 timestamp){
        require(dexData.isUniV2Class(), "unsupported dex");
        secondsAgo;
        decimals = priceDecimals;
        address pair = getUniClassPair(desToken, quoteToken, dexInfo[dexData.toDex()].factory);
        V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
        (price, cAvgPrice, hAvgPrice, timestamp) = uniClassGetPriceCAvgPriceHAvgPrice(pair, priceOracle, desToken, quoteToken, decimals);
    }

    /// @dev Update Dex price if not updated over time window
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param timeWindow minmum time gap between two updates
    /// @param data dex parameters
    /// @return If updated
    function updatePriceOracle(address desToken, address quoteToken, uint32 timeWindow, bytes memory data) external override returns (bool){
        require(msg.sender == openLev, "Only openLev can update price");
        require(data.isUniV2Class(), "unsupported dex");
        address pair = getUniClassPair(desToken, quoteToken, dexInfo[data.toDex()].factory);
        V2PriceOracle memory priceOracle = uniV2PriceOracle[IUniswapV2Pair(pair)];
        (V2PriceOracle memory updatedPriceOracle, bool updated) = uniClassUpdatePriceOracle(pair, priceOracle, timeWindow, priceDecimals);
        if (updated) {
            uniV2PriceOracle[IUniswapV2Pair(pair)] = updatedPriceOracle;
        }
        return updated;
    }

    /// @dev Update UniV3 observations
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param data Dex parameters
    function updateV3Observation(address desToken, address quoteToken, bytes memory data) external pure override {
        // Shh - currently unused
        (desToken,quoteToken, data);
        revert("Not implemented");
    }
}
