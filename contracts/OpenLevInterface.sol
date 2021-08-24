// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./Types.sol";
import "./liquidity/LPoolInterface.sol";
import "./ControllerInterface.sol";
import "./dex/DexAggregatorInterface.sol";

abstract contract OpenLevStorage {
    using SafeMath for uint;
    using SafeERC20 for IERC20;


    // number of markets
    uint16 public numPairs;

    // marketId => Pair
    mapping(uint16 => Types.Market) public markets;

    // owner => marketId => long0(true)/long1(false) => Trades
    mapping(address => mapping(uint16 => mapping(bool => Types.Trade))) public activeTrades;

    mapping(address => bool) public allowedDepositTokens;

    DexAggregatorInterface public dexAggregator;

    address public controller;

    address public wETH;

    address public xOLE;

    event NewDefalutFeesRate(uint16 oldFeesRate, uint16 newFeesRate);

    event NewMarketFeesRate(uint16 marketId,uint16 oldFeesRate, uint16 newFeesRate);

    event NewDefaultMarginLimit(uint32 oldRatio, uint32 newRatio);

    event NewMarketMarginLimit(uint16 marketId, uint32 oldRatio, uint32 newRatio);

    event NewInsuranceRatio(uint8 oldInsuranceRatio, uint8 newInsuranceRatio);

    event NewController(address oldController, address newController);

    event NewDexAggregator(DexAggregatorInterface oldDexAggregator, DexAggregatorInterface newDexAggregator);

    event ChangeAllowedDepositTokens(address[] token, bool allowed);

    event NewPriceDiffientRatio(uint16 oldPriceDiffientRatio, uint32 newPriceDiffientRatio);

    event NewMarketDex(uint16 marketId, uint32[] oldDex, uint32[] newDex);


    // 0.3%
    uint16 public defaultFeesRate = 30; // 0.003

    uint8 public insuranceRatio = 33; // 33%

    uint32 public defaultMarginLimit = 3000; // 30%

    uint16 public priceDiffientRatio = 10; //10=>10%

    uint256 public feesDiscountThreshold = 30 * (10 ** 18); // minimal holding of xOLE to enjoy fees discount

    uint public feesDiscount = 2500; // 25%

    event MarginTrade(
        address trader,
        uint16 marketId,
        bool longToken, // 0 => long token 0; 1 => long token 1;
        bool depositToken,
        uint deposited,
        uint borrowed,
        uint held,
        uint fees,
        uint sellAmount,
        uint receiveAmount,
        uint32 dex
    );

    event TradeClosed(
        address owner,
        uint16 marketId,
        bool longToken,
        uint closeAmount,
        uint depositDecrease,
        uint depositReturn,
        uint fees,
        uint sellAmount,
        uint receiveAmount,
        uint32 dex
    );

    event Liquidation(
        address owner,
        uint16 marketId,
        bool longToken,
        uint liquidationAmount,
        uint outstandingAmount,
        address liquidator,
        uint depositDecrease,
        uint depositReturn,
        uint sellAmount,
        uint receiveAmount,
        uint32 dex
    );
}

/**
  * @title OpenLevInterface
  * @author OpenLeverage
  */
interface OpenLevInterface {

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint32 marginLimit,
        bytes memory dexData
    ) external returns (uint16);


    function marginTrade(uint16 marketId, bool longToken, bool depositToken, uint deposit, uint borrow, uint minBuyAmount, bytes memory dexData) external payable;

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minBuyAmount, bytes memory dexData) external;

    function liquidate(address owner, uint16 marketId, bool longToken, bytes memory dexData) external;

    function marginRatio(address owner, uint16 marketId, bool longToken, bytes memory dexData) external view returns (uint current, uint avg, uint32 limit);

    function shouldUpdatePrice(uint16 marketId, bool isOpen, bytes memory dexData) external view returns (bool);

    function getMarketSupportDexs(uint16 marketId) external view returns (uint32[] memory);


    /*** Admin Functions ***/

    function setDefaultMarginLimit(uint32 newRatio) external;

    function setMarketMarginLimit(uint16 marketId, uint32 newRatio) external;

    function setDefaultFeesRate(uint16 newRate) external;

    function setMarketFeesRate(uint16 marketId, uint16 newRate) external;

    function setInsuranceRatio(uint8 newRatio) external;

    function setController(address newController) external;

    function setDexAggregator(DexAggregatorInterface _dexAggregator) external;

    function moveInsurance(uint16 marketId, uint8 poolIndex, address to, uint amount) external;

    function setAllowedDepositTokens(address[] memory tokens, bool allowed) external;

    function setPriceDiffientRatio(uint16 newPriceDiffientRatio) external;

    function setMarketDexs(uint16 marketId, uint32[] memory dexs) external;

    function setFeesDiscountThreshold (uint newThreshold) external;

    function setFeesDiscount (uint newDiscount) external;

}
