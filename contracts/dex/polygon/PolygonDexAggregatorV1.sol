// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "./UniV3Dex.sol";
import "../DexAggregatorInterface.sol";
import "../../lib/DexData.sol";
import "../../lib/Utils.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../DelegateInterface.sol";
import "../../Adminable.sol";

/// @title Swap logic on Polygon
/// @author OpenLeverage
/// @notice Use this contract to swap tokens.
/// @dev Routers for different swap requests.
contract PolygonDexAggregatorV1 is
    DelegateInterface,
    Adminable,
    DexAggregatorInterface,
    UniV3Dex
{
    using DexData for bytes;
    using SafeMath for uint256;

    address public openLev;

    uint8 private constant priceDecimals = 24;

    mapping(uint8 => DexInfo) public dexInfo;

    //v3 0x1f98431c8ad98523631ae4a59f267346ea31f984
    function initialize(IUniswapV3Factory _uniV3Factory) public {
        require(msg.sender == admin, "Not admin");
        initializeUniV3(_uniV3Factory);
    }

    /// @notice Save factories of the dex.
    /// @param dexName Index of Dex. find list of dex in contracts/lib/DexData.sol.
    /// @param factoryAddr Factory address of Different dex forked from uniswap.
    /// @param fees Swap fee collects by.
    function setDexInfo(
        uint8[] memory dexName,
        IUniswapV2Factory[] memory factoryAddr, // TODO Fix this to work for just Uniswap V3
        uint16[] memory fees
    ) external override onlyAdmin {
        require(
            dexName.length == factoryAddr.length &&
                dexName.length == fees.length,
            "EOR"
        );
        for (uint256 i = 0; i < dexName.length; i++) {
            dexInfo[dexName[i]] = DexInfo(factoryAddr[i], fees[i]);
        }
    }

    /// @dev SetOpenlev address to update dex price
    function setOpenLev(address _openLev) external onlyAdmin {
        require(address(0) != _openLev, "0x");
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
    function sell(
        address buyToken,
        address sellToken,
        uint256 sellAmount,
        uint256 minBuyAmount,
        bytes memory data
    ) external override returns (uint256 buyAmount) {
        address payer = msg.sender;
        buyAmount = uniV3Sell(
            buyToken,
            sellToken,
            sellAmount,
            minBuyAmount,
            data.toFee(),
            true,
            payer,
            payer
        );
    }

    /// @notice Sell tokens
    /// @dev Sell exact amount of token through path
    /// @param sellAmount Exact amount to sell
    /// @param minBuyAmount Minmum amount of token to receive.
    /// @param data Dex to use for swap and path of the swap
    /// @return buyAmount Exact amount bought
    function sellMul(
        uint256 sellAmount,
        uint256 minBuyAmount,
        bytes memory data
    ) external override returns (uint256 buyAmount) {
        buyAmount = uniV3SellMul(sellAmount, minBuyAmount, data.toUniV3Path());
    }

    /// @notice Buy tokens
    /// @dev Buy exact amount of token with tax applied
    /// @param buyToken Address of token transfer from Dex pair
    /// @param sellToken Address of token transfer into Dex pair
    /// @param buyTax Tax applyed by buyToken while transfer from Dex pair
    /// @param sellTax Tax applyed by SellToken while transfer into Dex pair
    /// @param buyAmount Exact amount to buy
    /// @param maxSellAmount Maximum amount of token to receive.
    /// @param data Dex to use for swap
    /// @return sellAmount Exact amount sold
    function buy(
        address buyToken,
        address sellToken,
        uint24 buyTax,
        uint24 sellTax,
        uint256 buyAmount,
        uint256 maxSellAmount,
        bytes memory data
    ) external override returns (uint256 sellAmount) {
        sellAmount = uniV3Buy(
            buyToken,
            sellToken,
            buyAmount,
            maxSellAmount,
            data.toFee(),
            true
        );
    }

    /// @notice Calculate amount of token to buy
    /// @dev Calculate exact amount of token to buy with tax applied
    /// @param buyToken Address of token transfer from Dex pair
    /// @param sellToken Address of token transfer into Dex pair
    /// @param buyTax Tax applyed by buyToken while transfer from Dex pair
    /// @param sellTax Tax applyed by SellToken while transfer into Dex pair
    /// @param sellAmount Exact amount to sell
    /// @param data Dex to use for swap
    /// @return buyAmount Amount of buyToken would bought
    function calBuyAmount(
        address buyToken,
        address sellToken,
        uint24 buyTax,
        uint24 sellTax,
        uint256 sellAmount,
        bytes memory data
    ) external view override returns (uint256 buyAmount) {
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
    // TODO make work for Polygon network only on V3
    function calSellAmount(
        address buyToken,
        address sellToken,
        uint24 buyTax,
        uint24 sellTax,
        uint256 buyAmount,
        bytes memory data
    ) external view override returns (uint256 sellAmount) {
        if (data.isUniV2Class()) {
            sellAmount = uniV2CalSellAmount(
                dexInfo[data.toDex()],
                buyToken,
                sellToken,
                buyAmount,
                buyTax,
                sellTax
            );
        } else {
            revert("Unsupported dex");
        }
    }

    /// @notice Get price
    /// @dev Get current price of desToken / quoteToken
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param data Dex to use for swap
    function getPrice(
        address desToken,
        address quoteToken,
        bytes memory data
    ) external view override returns (uint256 price, uint8 decimals) {
        decimals = priceDecimals;
        (price, ) = uniV3GetPrice(desToken, quoteToken, decimals, data.toFee());
    }

    /// @dev Get average price of desToken / quoteToken in the last period of time
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param secondsAgo Time period of the average
    /// @param data Dex to use for swap
    function getAvgPrice(
        address desToken,
        address quoteToken,
        uint32 secondsAgo,
        bytes memory data
    )
        external
        view
        override
        returns (
            uint256 price,
            uint8 decimals,
            uint256 timestamp
        )
    {
        decimals = priceDecimals;
        (price, timestamp, ) = uniV3GetAvgPrice(
            desToken,
            quoteToken,
            secondsAgo,
            decimals,
            data.toFee()
        );
    }

    /// @notice Get current and history price
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param secondsAgo TWAP length for UniV3
    /// @param data Dex parameters
    /// @return price Real-time price
    /// @return cAvgPrice Current TWAP price
    /// @return hAvgPrice Historical TWAP price
    /// @return decimals Token price decimal
    /// @return timestamp Last TWAP price update timestamp
    function getPriceCAvgPriceHAvgPrice(
        address desToken,
        address quoteToken,
        uint32 secondsAgo,
        bytes memory data
    )
        external
        view
        override
        returns (
            uint256 price,
            uint256 cAvgPrice,
            uint256 hAvgPrice,
            uint8 decimals,
            uint256 timestamp
        )
    {
        decimals = priceDecimals;
        (
            price,
            cAvgPrice,
            hAvgPrice,
            timestamp
        ) = uniV3GetPriceCAvgPriceHAvgPrice(
            desToken,
            quoteToken,
            secondsAgo,
            decimals,
            data.toFee()
        );
    }

    /// @dev Update Dex price if not updated over time window
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param timeWindow Minmum time gap between two updates
    /// @param data Dex parameters
    /// @return If updated
    // TODO make work for polygon network only on V3
    function updatePriceOracle(
        address desToken,
        address quoteToken,
        uint32 timeWindow,
        bytes memory data
    ) external override returns (bool) {
        require(msg.sender == openLev, "Only openLev can update price");
        if (data.isUniV2Class()) {
            address pair = getUniV2ClassPair(
                desToken,
                quoteToken,
                dexInfo[data.toDex()].factory
            );
            V2PriceOracle memory priceOracle = uniV2PriceOracle[
                IUniswapV2Pair(pair)
            ];
            (
                V2PriceOracle memory updatedPriceOracle,
                bool updated
            ) = uniV2UpdatePriceOracle(
                    pair,
                    priceOracle,
                    timeWindow,
                    priceDecimals
                );
            if (updated) {
                uniV2PriceOracle[IUniswapV2Pair(pair)] = updatedPriceOracle;
            }
            return updated;
        }
        return false;
    }

    /// @dev Update UniV3 observations
    /// @param desToken Token to be priced
    /// @param quoteToken Token used for pricing
    /// @param data Dex parameters
    function updateV3Observation(
        address desToken,
        address quoteToken,
        bytes memory data
    ) external override {
        increaseV3Observation(desToken, quoteToken, data.toFee());
    }
}
