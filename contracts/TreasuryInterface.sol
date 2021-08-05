// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.3;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


contract TreasuryStorage {
    IERC20 public oleToken;

    IERC20 public sharingToken;

    // dev team account
    address public dev;

    uint public devFund;

    uint public totalStaked;

    // user => staked balance of OLE
    mapping(address => uint) public stakedBalances;

    uint public devFundRatio; // ex. 50 => 50%

    mapping(address => uint256) public userRewardPerTokenPaid;

    // user => reward
    mapping(address => uint256) public rewards;

    // total to shared
    uint public totalToShared;

    uint public transferredToAccount;

    uint public lastUpdateTime;

    uint public rewardPerTokenStored;

    event RewardAdded(address fromToken, uint convertAmount, uint reward);
    event Staked(address indexed user, uint amount);
    event Withdrawn(address indexed user, uint amount);
    event RewardPaid(address indexed user, uint reward);
}


interface TreasuryInterface {

    function convertToSharingToken(address fromToken, uint amount, uint minBuyAmount) external;

    function devWithdraw(uint amount) external;

    function earned(address account) external view returns (uint);

    function stake(uint amount) external;

    function withdraw(uint amount) external;

    function getReward() external;

    function exit() external;

    /*** Admin Functions ***/

    function setDevFundRatio(uint newRatio) external;


    function setDev(address newDev) external;

}

