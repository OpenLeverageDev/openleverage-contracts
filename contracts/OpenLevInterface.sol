// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./Types.sol";
import "./liquidity/LPoolInterface.sol";
import "./ControllerInterface.sol";
import "./dex/DexAggregatorInterface.sol";
import "./OpenLevInterface.sol";
import "./lib/DexData.sol";

abstract contract OpenLevStorage {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    struct CalculateConfig {
        uint16 defaultFeesRate; // 30 =>0.003
        uint8 insuranceRatio; // 33=>33%
        uint16 defaultMarginLimit; // 3000=>30%
        uint16 priceDiffientRatio; //10=>10%
        uint16 updatePriceDiscount;//25=>25%
        uint16 feesDiscount; // 25=>25%
        uint128 feesDiscountThreshold; //  30 * (10 ** 18) minimal holding of xOLE to enjoy fees discount
        uint16 penaltyRatio;//100=>1%
        uint8 maxLiquidationPriceDiffientRatio;//30=>30%
        uint16 twapDuration;//28=>28s
    }

    struct AddressConfig {
        DexAggregatorInterface dexAggregator;
        address controller;
        address wETH;
        address xOLE;
    }

    // number of markets
    uint16 public numPairs;

    // marketId => Pair
    mapping(uint16 => Types.Market) public markets;

    // owner => marketId => long0(true)/long1(false) => Trades
    mapping(address => mapping(uint16 => mapping(bool => Types.Trade))) public activeTrades;

    mapping(address => bool) public allowedDepositTokens;

    CalculateConfig internal calculateConfig;

    AddressConfig public addressConfig;

    uint8[] public supportDexs;

    event MarginTrade(
        address trader,
        uint16 marketId,
        bool longToken, // 0 => long token 0; 1 => long token 1;
        bool depositToken,
        uint deposited,
        uint borrowed,
        uint held,
        uint fees,
        uint token0Price,
        uint32 dex
    );

    event TradeClosed(
        address owner,
        uint16 marketId,
        bool longToken,
        bool depositToken,
        uint closeAmount,
        uint depositDecrease,
        uint depositReturn,
        uint fees,
        uint token0Price,
        uint32 dex
    );

    event Liquidation(
        address owner,
        uint16 marketId,
        bool longToken,
        bool depositToken,
        uint liquidationAmount,
        uint outstandingAmount,
        address liquidator,
        uint depositDecrease,
        uint depositReturn,
        uint fees,
        uint token0Price,
        uint penalty,
        uint32 dex
    );

    event NewAddressConfig(address controller, address dexAggregator);

    event NewCalculateConfig(
        uint16 defaultFeesRate,
        uint8 insuranceRatio,
        uint16 defaultMarginLimit,
        uint16 priceDiffientRatio,
        uint16 updatePriceDiscount,
        uint16 feesDiscount,
        uint128 feesDiscountThreshold,
        uint16 penaltyRatio,
        uint8 maxLiquidationPriceDiffientRatio,
        uint16 twapDuration);

    event NewMarketConfig(uint16 marketId, uint16 feesRate, uint32 marginLimit, uint16 priceDiffientRatio, uint32[] dexs);

    event ChangeAllowedDepositTokens(address[] token, bool allowed);

}

/**
  * @title OpenLevInterface
  * @author OpenLeverage
  */
interface OpenLevInterface {

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint16 marginLimit,
        bytes memory dexData
    ) external returns (uint16);


    function marginTrade(uint16 marketId, bool longToken, bool depositToken, uint deposit, uint borrow, uint minBuyAmount, bytes memory dexData) external payable;

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minOrMaxAmount, bytes memory dexData) external;

    function liquidate(address owner, uint16 marketId, bool longToken, uint minOrMaxAmount, bytes memory dexData) external;

    function marginRatio(address owner, uint16 marketId, bool longToken, bytes memory dexData) external view returns (uint current, uint cAvg, uint hAvg, uint32 limit);

    function updatePrice(uint16 marketId, bytes memory dexData) external;

    function shouldUpdatePrice(uint16 marketId, bytes memory dexData) external view returns (bool);

    function getMarketSupportDexs(uint16 marketId) external view returns (uint32[] memory);

    function getCalculateConfig() external view returns (OpenLevStorage.CalculateConfig memory);

    /*** Admin Functions ***/
    function setCalculateConfig(uint16 defaultFeesRate, uint8 insuranceRatio, uint16 defaultMarginLimit, uint16 priceDiffientRatio,
        uint16 updatePriceDiscount, uint16 feesDiscount, uint128 feesDiscountThreshold, uint16 penaltyRatio, uint8 maxLiquidationPriceDiffientRatio, uint16 twapDuration) external;

    function setAddressConfig(address controller, DexAggregatorInterface dexAggregator) external;

    function setMarketConfig(uint16 marketId, uint16 feesRate, uint16 marginLimit, uint16 priceDiffientRatio, uint32[] memory dexs) external;

    function moveInsurance(uint16 marketId, uint8 poolIndex, address to, uint amount) external;

    function setAllowedDepositTokens(address[] memory tokens, bool allowed) external;

    function setSupportDexs(uint8[] memory _dexs) external;


}
