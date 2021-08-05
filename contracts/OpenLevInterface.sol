// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./Types.sol";
import "./liquidity/LPoolInterface.sol";
import "./ControllerInterface.sol";
import "./dex/IUniswapV2Factory.sol";
import "./dex/PriceOracleInterface.sol";
import "./Referral.sol";


abstract contract OpenLevStorage {
    using SafeMath for uint;
    using SafeERC20 for IERC20;


    // number of markets
    uint16 public numPairs;

    // marketId => Pair
    mapping(uint16 => Types.Market) public markets;

    // owner => marketId => long0(true)/long1(false) => Trades
    mapping(address => mapping(uint16 => mapping(bool => Types.Trade))) public activeTrades;

    /**
     * @dev Total number of Ltokens in circulation
     */
    uint public _totalSupply;

    /**
     * @dev Official record of Ltoken balances for each account
     */
    //    mapping(address => uint) internal balance;

    address public treasury;

    ReferralInterface public referral;

    PriceOracleInterface public priceOracle;

    address public controller;

    event NewFeesRate(uint oldFeesRate, uint newFeesRate);

    event NewDefaultMarginRatio(uint32 oldRatio, uint32 newRatio);

    event NewMarketMarginLimit(uint16 marketId, uint32 oldRatio, uint32 newRatio);

    event NewInsuranceRatio(uint8 oldInsuranceRatio, uint8 newInsuranceRatio);

    event NewController(address oldController, address newController);

    event NewPriceOracle(PriceOracleInterface oldPriceOracle, PriceOracleInterface newPriceOracle);

    event NewUniswapFactory(IUniswapV2Factory oldUniswapFactory, IUniswapV2Factory newUniswapFactory);

    event NewReferral(ReferralInterface oldReferral, ReferralInterface newReferral);


    // 0.3%
    uint public feesRate = 30; // 0.003

    uint8 public insuranceRatio = 33; // 33%

    uint32 public defaultMarginRatio = 3000; // 30%

    event MarginTrade(
        address trader,
        uint16 marketId,
        bool longToken, // 0 => long token 0; 1 => long token 1;
        bool depositToken,
        uint deposited,
        uint borrowed,
        uint held,
        uint fees,
        uint atPrice,
        uint8 priceDecimals
    );

    event TradeClosed(
        address owner,
        uint16 marketId,
        bool longToken,
        uint closeAmount,
        uint depositDecrease,
        uint depositReturn,
        uint fees,
        uint atPrice,
        uint8 priceDecimals
    );

    event LiquidationMarker(
        address owner,
        uint16 marketId,
        bool longToken,
        address marker,
        uint atPrice,
        uint8 priceDecimals
    );
    event LiquidationMarkerReset(
        address owner,
        uint16 marketId,
        bool longToken,
        address marker,
        address resetBy,
        uint atPrice,
        uint8 priceDecimals
    );
    event Liquidation(
        address owner,
        uint16 marketId,
        bool longToken,
        uint liquidationAmount,
        address liquidator1,
        address liquidator2,
        uint depositDecrease,
        uint depositReturn,
        uint atPrice,
        uint8 priceDecimals
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
        uint32 marginRatio
    ) external returns (uint16);


    function marginTrade(
        uint16 marketId,
        bool longToken,
        bool depositToken,
        uint deposit,
        uint borrow,
        uint minBuyAmount,
        address referrer
    ) external;

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minBuyAmount) external;

    function marginRatio(address owner, uint16 marketId, bool longToken) external view returns (uint current, uint32 marketLimit);

    function liqMarker(address owner, uint16 marketId, bool longToken) external;

    function liqMarkerReset(address owner, uint16 marketId, bool longToken) external;

    function liquidate(address owner, uint16 marketId, bool longToken) external;


    /*** Admin Functions ***/

    function setDefaultMarginRatio(uint32 newRatio) external;

    function setMarketMarginLimit(uint16 marketId, uint32 newRatio) external;

    function setFeesRate(uint newRate) external;

    function setInsuranceRatio(uint8 newRatio) external;

    function setController(address newController) external;

    function setPriceOracle(PriceOracleInterface newPriceOracle) external;

    function setUniswapFactory(IUniswapV2Factory _uniswapFactory) external;

    function setReferral(ReferralInterface _referral) external;

    function moveInsurance(uint16 marketId, uint8 poolIndex, address to, uint amount) external;


}
