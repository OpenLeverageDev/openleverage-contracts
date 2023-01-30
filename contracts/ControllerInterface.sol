// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

pragma experimental ABIEncoderV2;

import "./liquidity/LPoolInterface.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dex/DexAggregatorInterface.sol";

contract ControllerStorage {

    //lpool-pair
    struct LPoolPair {
        address lpool0;
        address lpool1;
    }
    //lpool-distribution
    struct LPoolDistribution {
        uint64 startTime;
        uint64 endTime;
        uint64 duration;
        uint64 lastUpdateTime;
        uint256 totalRewardAmount;
        uint256 rewardRate;
        uint256 rewardPerTokenStored;
        uint256 extraTotalToken;
    }
    //lpool-rewardByAccount
    struct LPoolRewardByAccount {
        uint rewardPerTokenStored;
        uint rewards;
        uint extraToken;
    }

    struct OLETokenDistribution {
        uint supplyBorrowBalance;
        uint extraBalance;
        uint128 updatePricePer;
        uint128 liquidatorMaxPer;
        uint16 liquidatorOLERatio;//300=>300%
        uint16 xoleRaiseRatio;//150=>150%
        uint128 xoleRaiseMinAmount;
    }

    IERC20 public oleToken;

    address public xoleToken;

    address public wETH;

    address public lpoolImplementation;

    //interest param
    uint256 public baseRatePerBlock;
    uint256 public multiplierPerBlock;
    uint256 public jumpMultiplierPerBlock;
    uint256 public kink;

    bytes public oleWethDexData;

    address public openLev;

    DexAggregatorInterface public dexAggregator;

    //useless
    bool public suspend;

    //useless
    OLETokenDistribution public oleTokenDistribution;
    //token0=>token1=>pair
    mapping(address => mapping(address => LPoolPair)) public lpoolPairs;
    //useless
    //marketId=>isDistribution
    mapping(uint => bool) public marketExtraDistribution;
    //marketId=>isSuspend
    mapping(uint => bool) public marketSuspend;
    //useless
    //pool=>allowed
    mapping(address => bool) public lpoolUnAlloweds;
    //useless
    //pool=>bool=>distribution(true is borrow,false is supply)
    mapping(LPoolInterface => mapping(bool => LPoolDistribution)) public lpoolDistributions;
    //useless
    //pool=>bool=>distribution(true is borrow,false is supply)
    mapping(LPoolInterface => mapping(bool => mapping(address => LPoolRewardByAccount))) public lPoolRewardByAccounts;

    bool public suspendAll;

    //marketId=>isSuspend
    mapping(uint => bool) public borrowingSuspend;

    address public opBorrowing;

    event LPoolPairCreated(address token0, address pool0, address token1, address pool1, uint16 marketId, uint16 marginLimit, bytes dexData);

}
/**
  * @title Controller
  * @author OpenLeverage
  */
interface ControllerInterface {

    function createLPoolPair(address tokenA, address tokenB, uint16 marginLimit, bytes memory dexData) external;

    /*** Policy Hooks ***/

    function mintAllowed(address minter, uint lTokenAmount) external;

    function transferAllowed(address from, address to, uint lTokenAmount) external;

    function redeemAllowed(address redeemer, uint lTokenAmount) external;

    function borrowAllowed(address borrower, address payee, uint borrowAmount) external;

    function repayBorrowAllowed(address payer, address borrower, uint repayAmount, bool isEnd) external;

    function liquidateAllowed(uint marketId, address liquidator, uint liquidateAmount, bytes memory dexData) external;

    //useless
    function marginTradeAllowed(uint marketId) external view returns (bool);

    function marginTradeAllowedV2(uint marketId, address trader, bool longToken) external view returns (bool);

    function closeTradeAllowed(uint marketId) external view returns (bool);

    function updatePriceAllowed(uint marketId, address to) external;

    function updateInterestAllowed(address payable sender) external;

    function collBorrowAllowed(uint marketId, address borrower, bool collateralIndex) external view returns (bool);

    function collRepayAllowed(uint marketId) external view returns (bool);

    function collRedeemAllowed(uint marketId) external view returns (bool);

    function collLiquidateAllowed(uint marketId) external view returns (bool);

    /*** Admin Functions ***/

    function setLPoolImplementation(address _lpoolImplementation) external;

    function setOpenLev(address _openlev) external;

    function setDexAggregator(DexAggregatorInterface _dexAggregator) external;

    function setInterestParam(uint256 _baseRatePerBlock, uint256 _multiplierPerBlock, uint256 _jumpMultiplierPerBlock, uint256 _kink) external;

    function setLPoolUnAllowed(address lpool, bool unAllowed) external;

    //useless
    function setSuspend(bool suspend) external;

    function setSuspendAll(bool suspend) external;

    function setMarketSuspend(uint marketId, bool suspend) external;

    function setBorrowingSuspend(uint marketId, bool suspend) external;

    function setOleWethDexData(bytes memory _oleWethDexData) external;

    function setOpBorrowing(address _opBorrowing) external;

}


