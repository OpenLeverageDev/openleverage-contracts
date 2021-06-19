// SPDX-License-Identifier: MIT

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "./Adminable.sol";
import "./DexCaller.sol";
import "./TreasuryInterface.sol";
import "./DelegateInterface.sol";

contract Treasury is DelegateInterface, TreasuryInterface, TreasuryStorage, Adminable, DexCaller {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    constructor ()
    {
    }

    function initialize(
        IUniswapV2Factory _uniswapFactory,
        address _oleToken,
        address _sharingToken,
        uint _devFundRatio,
        address _dev
    ) public {
        require(msg.sender == admin, "not admin");
        require(_oleToken != address(0), "_oleToken address cannot be 0");
        require(_sharingToken != address(0), "_sharingToken address cannot be 0");
        require(_dev != address(0), "_dev address cannot be 0");
        oleToken = IERC20(_oleToken);
        sharingToken = IERC20(_sharingToken);
        devFundRatio = _devFundRatio;
        dev = _dev;
        uniswapFactory = _uniswapFactory;
    }


    function devWithdraw(uint amount) external override {
        require(msg.sender == dev, "Dev fund only be withdrawn by dev");
        require(amount != 0, "Amount can't be 0");
        require(amount <= devFund, "Exceed available balance");
        devFund = devFund.sub(amount);
        sharingToken.transfer(dev, amount);
    }

    function convertToSharingToken(address fromToken, uint amount, uint minBuyAmount) external override {
        if (fromToken == address(oleToken)) {
            require(oleToken.balanceOf(address(this)).sub(totalStaked) >= amount, 'Exceed available balance');
        }
        uint newReward;
        //sharing token increment
        if (fromToken == address(sharingToken)) {
            //sharingTokenAvailableAmount=balanceOf-(totalToShared-transferredToAccount)-devFund
            uint sharingTokenAvailableAmount = sharingToken.balanceOf(address(this)).sub(totalToShared.sub(transferredToAccount)).sub(devFund);
            require(sharingTokenAvailableAmount >= amount, 'Exceed available balance');
            newReward = amount;
        } else {
            newReward = flashSell(address(sharingToken), fromToken, amount, minBuyAmount);
        }
        uint newDevFund = newReward.mul(devFundRatio).div(100);
        uint feesShare = newReward.sub(newDevFund);
        devFund = devFund.add(newDevFund);
        totalToShared = totalToShared.add(feesShare);
        lastUpdateTime = block.timestamp;
        rewardPerTokenStored = rewardPerToken(feesShare);
        emit RewardAdded(fromToken, amount, feesShare);
    }

    function earned(address account) external override view returns (uint) {
        return earnedInternal(account);
    }

    function earnedInternal(address account) internal view returns (uint) {
        return stakedBalances[account]
        .mul(rewardPerToken(0).sub(userRewardPerTokenPaid[account]))
        .div(1e18)
        .add(rewards[account]);
    }

    function rewardPerToken(uint newReward) internal view returns (uint) {
        if (totalStaked == 0) {
            return rewardPerTokenStored;
        }

        if (block.timestamp == lastUpdateTime) {
            return rewardPerTokenStored.add(newReward
            .mul(1e18)
            .div(totalStaked));
        } else {
            return rewardPerTokenStored;
        }
    }

    function stake(uint amount) external override updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        totalStaked = totalStaked.add(amount);
        stakedBalances[msg.sender] = stakedBalances[msg.sender].add(amount);
        oleToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint amount) external override {
        withdrawInternal(amount);
    }

    function withdrawInternal(uint amount) internal updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        totalStaked = totalStaked.sub(amount);
        stakedBalances[msg.sender] = stakedBalances[msg.sender].sub(amount);
        oleToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() external override {
        getRewardInternal();
    }

    function getRewardInternal() internal updateReward(msg.sender) {
        uint reward = earnedInternal(msg.sender);
        if (reward > 0) {
            rewards[msg.sender] = 0;
            transferredToAccount = transferredToAccount.add(reward);
            sharingToken.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function exit() external override {
        withdrawInternal(stakedBalances[msg.sender]);
        getRewardInternal();
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken(0);
        rewards[account] = earnedInternal(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
        _;
    }

    /*** Admin Functions ***/
    function setDevFundRatio(uint newRatio) external override onlyAdmin {
        require(newRatio <= 100);
        devFundRatio = newRatio;
    }

    function setDev(address newDev) external override onlyAdmin {
        dev = newDev;
    }
}
