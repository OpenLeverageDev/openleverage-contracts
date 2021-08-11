// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

pragma experimental ABIEncoderV2;

import "./liquidity/LPoolInterface.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


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
        uint256 totalAmount;
        uint256 rewardRate;
        uint256 rewardPerTokenStored;
    }
    //lpool-rewardByAccount
    struct LPoolRewardByAccount {
        uint rewardPerTokenStored;
        uint rewards;
    }

    struct OLETokenDistribution {
        uint liquidatorBalance;
        uint liquidatorMaxPer;
        uint liquidatorOLERatio;
        uint supplyBorrowBalance;
    }

    ERC20 public oleToken;

    address public wChainToken;

    address public lpoolImplementation;

    //interest param
    uint256 public baseRatePerBlock;
    uint256 public multiplierPerBlock;
    uint256 public jumpMultiplierPerBlock;
    uint256 public kink;

    address public openLev;

    bool public tradeAllowed = true;

    OLETokenDistribution public oleTokenDistribution;
    //token0=>token1=>pair
    mapping(address => mapping(address => LPoolPair)) public lpoolPairs;
    //marketId=>isDistribution
    mapping(uint => bool) public marketLiqDistribution;
    //pool=>allowed
    mapping(address => bool) public lpoolUnAlloweds;
    //pool=>bool=>distribution(true is borrow,false is supply)
    mapping(LPoolInterface => mapping(bool => LPoolDistribution)) public lpoolDistributions;
    //pool=>bool=>distribution(true is borrow,false is supply)
    mapping(LPoolInterface => mapping(bool => mapping(address => LPoolRewardByAccount))) public lPoolRewardByAccounts;

    event LPoolPairCreated(address token0, address pool0, address token1, address pool1, uint16 marketId, uint32 marginRatio);

    event Distribution2Pool(address pool, uint supplyAmount, uint borrowerAmount, uint64 startTime, uint64 duration);

}
/**
  * @title Controller
  * @author OpenLeverage
  */
interface ControllerInterface {

    /*** Policy Hooks ***/

    function mintAllowed(address lpool, address minter, uint mintAmount) external;

    function transferAllowed(address lpool, address from, address to) external;

    function redeemAllowed(address lpool, address redeemer, uint redeemTokens) external;

    function borrowAllowed(address lpool, address borrower, address payee, uint borrowAmount) external;

    function repayBorrowAllowed(address lpool, address payer, address borrower, uint repayAmount, bool isEnd) external;

    function liquidateAllowed(uint marketId, address liquidator, uint liquidateAmount, bytes memory dexData) external;

    function marginTradeAllowed(uint marketId) external;

    function createLPoolPair(address tokenA, address tokenB, uint32 marginRatio) external;

    /*** Admin Functions ***/

    function setLPoolImplementation(address _lpoolImplementation) external;

    function setOpenLev(address _openlev) external;

    function setInterestParam(uint256 _baseRatePerBlock, uint256 _multiplierPerBlock, uint256 _jumpMultiplierPerBlock, uint256 _kink) external;

    function setLPoolUnAllowed(address lpool, bool unAllowed) external;

    function setMarginTradeAllowed(bool isAllowed) external;

    // liquidatorOLERatio: Two decimal in percentage, ex. 300% => 300
    function setOLETokenDistribution(uint moreLiquidatorBalance, uint liquidatorMaxPer, uint liquidatorOLERatio, uint moreSupplyBorrowBalance) external;

    function distributeRewards2Pool(address pool, uint supplyAmount, uint borrowAmount, uint64 startTime, uint64 duration) external;

    function distributeRewards2PoolMore(address pool, uint supplyAmount, uint borrowAmount) external;

    function distributeLiqRewards2Market(uint marketId, bool isDistribution) external;

    /***Distribution Functions ***/

    function earned(LPoolInterface lpool, address account, bool isBorrow) external view returns (uint256);

    function getSupplyRewards(LPoolInterface[] calldata lpools, address account) external;

}


