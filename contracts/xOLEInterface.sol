// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./dex/DexAggregatorInterface.sol";


contract xOLEStorage {

    // EIP-20 token name for this token
    string public name = 'xOLE';

    // EIP-20 token symbol for this token
    string public symbol = 'xOLE';

    // EIP-20 token decimals for this token
    uint8 public constant decimals = 18;

    // Total number of tokens locked
    uint public supply;

    // Allowance amounts on behalf of others
    mapping(address => mapping(address => uint)) internal allowances;

    // Official record of token balances for each account
    mapping(address => uint) internal balances;

    mapping(address => LockedBalance) public locked;

    uint256 public epoch;

    Point[100000000000000000000000000000] public point_history; // epoch -> unsigned point

    mapping(address => Point[1000000000]) public user_point_history; // user -> Point[user_epoch]

    mapping(address => uint256) public user_point_epoch;

    mapping(uint256 => int128) public slope_changes; // time -> signed slope change

    DexAggregatorInterface dexAgg;

    struct Point {
        int128 bias;
        int128 slope;   // - dweight / dt
        uint256 ts;
        uint256 blk;   // block
    }

    struct LockedBalance {
        uint256 amount;
        uint256 end;
    }

    struct Vars {
        uint256 _epoch;
        uint256 user_epoch;
    }

    address ZERO_ADDRESS = address(0);

    int128 constant DEPOSIT_FOR_TYPE = 0;
    int128 constant CREATE_LOCK_TYPE = 1;
    int128 constant INCREASE_LOCK_AMOUNT = 2;
    int128 constant INCREASE_UNLOCK_TIME = 3;

    uint256 constant WEEK = 7 * 86400;  // all future times are rounded by week
    uint256 constant MAXTIME = 4 * 365 * 86400;  // 4 years
    uint256 constant MULTIPLIER = 10 ** 18;

    // Treasury variable

    IERC20 oleToken;

    // dev team account
    address public dev;

    uint public devFund;

    uint public totalStaked;

    // user => staked balance of OLE
    mapping(address => uint) public stakedBalances;

    uint public devFundRatio; // ex. 5000 => 50%

    mapping(address => uint256) public userRewardPerTokenPaid;

    // user => reward
    mapping(address => uint256) public rewards;

    // total to shared
    uint public totalRewarded;

    uint public withdrewReward;

    uint public lastUpdateTime;

    uint public rewardPerTokenStored;

    event RewardAdded(address fromToken, uint convertAmount, uint reward);

    event Deposit (
        address indexed provider,
        uint256 value,
        uint256 indexed locktime,
        int128 type_,
        uint256 ts
    );

    event Withdraw (
        address indexed provider,
        uint256 value,
        uint256 ts
    );

    event Supply (
        uint256 prevSupply,
        uint256 supply
    );

    event RewardPaid (
        address paidTo,
        uint256 amount
    );
}


interface xOLEInterface {

    function convertToSharingToken(address fromToken, uint amount, uint minBuyAmount, bytes memory data) external;

    function withdrawDevFund() external;

    function earned(address account) external view returns (uint);

    function withdrawReward() external;

    /*** Admin Functions ***/

    function setDevFundRatio(uint newRatio) external;

    function setDev(address newDev) external;

    function setDexAgg(DexAggregatorInterface newDexAgg) external;

    event CommitOwnership (address admin);

    event ApplyOwnership (address admin);

}

