// SPDX-License-Identifier: MIT
pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "./ControllerInterface.sol";
import "./liquidity/LPoolDelegator.sol";
import "./Adminable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "./DelegateInterface.sol";
import "./dex/PriceOracleInterface.sol";

/**
  * @title Controller
  * @author OpenLeverage
  */
contract ControllerV1 is DelegateInterface, ControllerInterface, ControllerStorage, Adminable {
    using SafeMath for uint;

    constructor () {}

    function initialize(
        ERC20 _oleToken,
        address _wChainToken,
        address _lpoolImplementation,
        address _openlev
    ) public {
        require(msg.sender == admin, "not admin");
        oleToken = _oleToken;
        wChainToken = _wChainToken;
        lpoolImplementation = _lpoolImplementation;
        openLev = _openlev;
    }
    /*** Policy Hooks ***/
    function mintAllowed(address lpool, address minter, uint mintAmount) external override {
        // Shh - currently unused
        mintAmount;
        require(!lpoolUnAlloweds[lpool], "mint paused");
        updateReward(LPoolInterface(lpool), minter, false);
    }

    function transferAllowed(address lpool, address from, address to) external override {
        require(!lpoolUnAlloweds[lpool], "transfer paused");
        updateReward(LPoolInterface(lpool), from, false);
        updateReward(LPoolInterface(lpool), to, false);
    }

    function redeemAllowed(address lpool, address redeemer, uint redeemTokens) external override {
        // Shh - currently unused
        redeemTokens;
        if (updateReward(LPoolInterface(lpool), redeemer, false)) {
            getRewardInternal(LPoolInterface(lpool), redeemer, false);
        }
    }

    function borrowAllowed(address lpool, address borrower, address payee, uint borrowAmount) external override {
        require(!lpoolUnAlloweds[lpool], "borrow paused");
        require(LPoolInterface(lpool).availableForBorrow() >= borrowAmount, "borrow out of range");
        require(openLev == payee || openLev == address(0), 'payee not openLev');

        updateReward(LPoolInterface(lpool), borrower, true);
    }

    function repayBorrowAllowed(address lpool, address payer, address borrower, uint repayAmount) external override {
        // Shh - currently unused
        payer;
        repayAmount;
        if (updateReward(LPoolInterface(lpool), borrower, true)) {
            getRewardInternal(LPoolInterface(lpool), borrower, true);
        }
    }

    function liquidateAllowed(uint marketId, address liqMarker, address liquidator, uint liquidateAmount) external override {
        // Shh - currently unused
        liquidateAmount;
        require(openLev == msg.sender || openLev == address(0), 'liquidate sender not openLev');
        // market no distribution
        if (marketLiqDistribution[marketId] == false) {
            return;
        }
        // rewards is zero or balance not enough
        if (oleTokenDistribution.liquidatorMaxPer == 0) {
            return;
        }
        //get wChainToken quote ole price
        (uint256 price, uint8 decimal) = (ControllerOpenLevInterface(openLev).priceOracle()).getPrice(wChainToken, address(oleToken));
        // oleRewards=(600,000gas)*
        uint calcLiquidatorRewards = uint(600000)
        .mul(tx.gasprice).mul(price).div(10 ** uint(decimal))
        .mul(oleTokenDistribution.liquidatorOLERatio).div(100);
        // check compare max
        if (calcLiquidatorRewards > oleTokenDistribution.liquidatorMaxPer) {
            calcLiquidatorRewards = oleTokenDistribution.liquidatorMaxPer;
        }
        if (oleTokenDistribution.liquidatorBalance < calcLiquidatorRewards) {
            return;
        }
        if (liqMarker == liquidator) {
            if (transferOut(liqMarker, calcLiquidatorRewards)) {
                oleTokenDistribution.liquidatorBalance = oleTokenDistribution.liquidatorBalance.sub(calcLiquidatorRewards);
            }
            return;
        }
        uint tranferAmountAvg = calcLiquidatorRewards.div(2);
        uint tranferAmountSucceed;
        if (transferOut(liqMarker, tranferAmountAvg)) {
            tranferAmountSucceed = tranferAmountAvg;
        }
        if (transferOut(liquidator, tranferAmountAvg)) {
            tranferAmountSucceed = tranferAmountSucceed.add(tranferAmountAvg);
        }
        oleTokenDistribution.liquidatorBalance = oleTokenDistribution.liquidatorBalance.sub(tranferAmountSucceed);
    }

    function marginTradeAllowed(uint marketId) external override {
        // Shh - currently unused
        marketId;
        require(tradeAllowed, 'Trade is UnAllowed!');
    }
    /*** Admin Functions ***/

    function setLPoolImplementation(address _lpoolImplementation) external override onlyAdmin {
        lpoolImplementation = _lpoolImplementation;
    }

    function setOpenLev(address _openlev) external override onlyAdmin {
        openLev = _openlev;
    }

    function setInterestParam(uint256 _baseRatePerBlock, uint256 _multiplierPerBlock, uint256 _jumpMultiplierPerBlock, uint256 _kink) external override onlyAdmin {
        baseRatePerBlock = _baseRatePerBlock;
        multiplierPerBlock = _multiplierPerBlock;
        jumpMultiplierPerBlock = _jumpMultiplierPerBlock;
        kink = _kink;
    }

    function setLPoolUnAllowed(address lpool, bool unAllowed) external override onlyAdmin {
        lpoolUnAlloweds[lpool] = unAllowed;
    }

    function setMarginTradeAllowed(bool isAllowed) external override onlyAdmin {
        tradeAllowed = isAllowed;
    }


    function createLPoolPair(address token0, address token1, uint32 marginRatio) external override {
        require(token0 != token1, 'identical address');
        require(lpoolPairs[token0][token1].lpool0 == address(0) || lpoolPairs[token1][token0].lpool0 == address(0), 'pool pair exists');
        string memory tokenName = "OpenLeverage LP";
        string memory tokenSymbol = "OLE-LP";
        LPoolDelegator pool0 = new LPoolDelegator();
        pool0.initialize(token0, address(this), baseRatePerBlock, multiplierPerBlock, jumpMultiplierPerBlock, kink, 1e18,
            tokenName, tokenSymbol, 18, admin, lpoolImplementation);
        LPoolDelegator pool1 = new LPoolDelegator();
        pool1.initialize(token1, address(this), baseRatePerBlock, multiplierPerBlock, jumpMultiplierPerBlock, kink, 1e18,
            tokenName, tokenSymbol, 18, admin, lpoolImplementation);
        lpoolPairs[token0][token1] = LPoolPair(address(pool0), address(pool1));
        lpoolPairs[token1][token0] = LPoolPair(address(pool0), address(pool1));
        uint16 marketId = (ControllerOpenLevInterface(openLev)).addMarket(LPoolInterface(pool0), LPoolInterface(pool1), marginRatio);
        emit LPoolPairCreated(token0, address(pool0), token1, address(pool1), marketId, marginRatio);
    }

    function setOLETokenDistribution(uint moreLiquidatorBalance, uint liquidatorMaxPer, uint liquidatorOLERatio, uint moreSupplyBorrowBalance) external override onlyAdmin {
        uint newLiquidatorBalance = oleTokenDistribution.liquidatorBalance.add(moreLiquidatorBalance);

        uint newSupplyBorrowBalance = oleTokenDistribution.supplyBorrowBalance.add(moreSupplyBorrowBalance);

        uint totalAll = newLiquidatorBalance.add(newSupplyBorrowBalance);
        require(oleToken.balanceOf(address(this)) >= totalAll, 'not enough balance');

        oleTokenDistribution.liquidatorBalance = newLiquidatorBalance;
        oleTokenDistribution.liquidatorMaxPer = liquidatorMaxPer;
        oleTokenDistribution.liquidatorOLERatio = liquidatorOLERatio;
        oleTokenDistribution.supplyBorrowBalance = newSupplyBorrowBalance;

    }

    function distributeRewards2Pool(address pool, uint supplyAmount, uint borrowAmount, uint64 startTime, uint64 duration) external override onlyAdmin {
        require(supplyAmount > 0 || borrowAmount > 0, 'amount is less than 0');
        require(startTime > block.timestamp, 'startTime < blockTime');
        require(duration >= LPOOL_DISTRIBUTION_MIN_DURATION, 'duration less than min');
        if (supplyAmount > 0) {
            lpoolDistributions[LPoolInterface(pool)][false] = calcDistribution(supplyAmount, startTime, duration);
        }
        if (borrowAmount > 0) {
            lpoolDistributions[LPoolInterface(pool)][true] = calcDistribution(borrowAmount, startTime, duration);
        }
        uint subAmount = supplyAmount.add(borrowAmount);
        oleTokenDistribution.supplyBorrowBalance = oleTokenDistribution.supplyBorrowBalance.sub(subAmount);
        emit Distribution2Pool(pool, supplyAmount, borrowAmount, startTime, duration);
    }

    function distributeRewards2PoolMore(address pool, uint supplyAmount, uint borrowAmount) external override onlyAdmin {
        require(supplyAmount > 0 || borrowAmount > 0, 'amount0 and amount1 is 0');
        if (supplyAmount > 0) {
            updateReward(LPoolInterface(pool), address(0), false);
            updateDistribution(lpoolDistributions[LPoolInterface(pool)][false], supplyAmount);
        }
        if (borrowAmount > 0) {
            updateReward(LPoolInterface(pool), address(0), true);
            updateDistribution(lpoolDistributions[LPoolInterface(pool)][true], borrowAmount);
        }
        uint subAmount = supplyAmount.add(borrowAmount);
        oleTokenDistribution.supplyBorrowBalance = oleTokenDistribution.supplyBorrowBalance.sub(subAmount);
    }

    function distributeLiqRewards2Market(uint marketId, bool isDistribution) external override onlyAdmin {
        marketLiqDistribution[marketId] = isDistribution;
    }

    /*** Distribution Functions ***/


    function calcDistribution(uint totalAmount, uint64 startTime, uint64 duration) internal pure returns (ControllerStorage.LPoolDistribution memory distribution){
        distribution.startTime = startTime;
        distribution.endTime = startTime + duration;
        require(distribution.endTime >= startTime, 'endTime is overflow');
        distribution.duration = duration;
        distribution.lastUpdateTime = startTime;
        distribution.totalAmount = totalAmount;
        distribution.rewardRate = totalAmount.div(duration);
    }

    function updateDistribution(ControllerStorage.LPoolDistribution storage distribution, uint addAmount) internal {
        uint256 blockTime = block.timestamp;
        require(distribution.endTime > blockTime, 'distribution is end');
        uint addDuration = distribution.endTime - blockTime;
        uint addRewardRate = addAmount.div(addDuration);
        distribution.lastUpdateTime = uint64(blockTime);
        distribution.totalAmount = distribution.totalAmount.add(addAmount);
        distribution.rewardRate = distribution.rewardRate.add(addRewardRate);
    }

    function checkStart(LPoolInterface lpool, bool isBorrow) internal view returns (bool){
        //distribution not config
        if (lpoolDistributions[lpool][isBorrow].totalAmount == 0) {
            return false;
        }
        return block.timestamp >= lpoolDistributions[lpool][isBorrow].startTime;
    }


    function lastTimeRewardApplicable(LPoolInterface lpool, bool isBorrow) public view returns (uint256) {
        return Math.min(block.timestamp, lpoolDistributions[lpool][isBorrow].endTime);
    }

    function rewardPerToken(LPoolInterface lpool, bool isBorrow) internal view returns (uint256) {
        LPoolDistribution memory distribution = lpoolDistributions[lpool][isBorrow];
        uint totalAmount = isBorrow ? lpool.totalBorrowsCurrent() : lpool.totalSupply();
        if (totalAmount == 0) {
            return distribution.rewardPerTokenStored;
        }
        return
        distribution.rewardPerTokenStored.add(
            lastTimeRewardApplicable(lpool, isBorrow)
            .sub(distribution.lastUpdateTime)
            .mul(distribution.rewardRate)
            .mul(1e18)
            .div(totalAmount)
        );
    }

    function updateReward(LPoolInterface lpool, address account, bool isBorrow) internal returns (bool) {
        if (!checkStart(lpool, isBorrow)) {
            return false;
        }
        uint rewardPerTokenStored = rewardPerToken(lpool, isBorrow);
        lpoolDistributions[lpool][isBorrow].rewardPerTokenStored = rewardPerTokenStored;
        lpoolDistributions[lpool][isBorrow].lastUpdateTime = uint64(lastTimeRewardApplicable(lpool, isBorrow));
        if (account != address(0)) {
            lPoolRewardByAccounts[lpool][isBorrow][account].rewards = earnedInternal(lpool, account, isBorrow);
            lPoolRewardByAccounts[lpool][isBorrow][account].rewardPerTokenStored = rewardPerTokenStored;
        }
        return true;
    }

    function earnedInternal(LPoolInterface lpool, address account, bool isBorrow) internal view returns (uint256) {
        uint accountBalance = isBorrow ? lpool.borrowBalanceCurrent(account) : lpool.balanceOf(account);
        return
        accountBalance
        .mul(rewardPerToken(lpool, isBorrow).sub(lPoolRewardByAccounts[lpool][isBorrow][account].rewardPerTokenStored))
        .div(1e18)
        .add(lPoolRewardByAccounts[lpool][isBorrow][account].rewards);
    }

    function getRewardInternal(LPoolInterface lpool, address account, bool isBorrow) internal {
        uint256 reward = earnedInternal(lpool, account, isBorrow);
        if (reward > 0) {
            bool succeed = transferOut(account, reward);
            if (succeed) {
                lPoolRewardByAccounts[lpool][isBorrow][account].rewards = 0;
            }
        }
    }

    function earned(LPoolInterface lpool, address account, bool isBorrow) external override view returns (uint256) {
        if (!checkStart(lpool, isBorrow)) {
            return 0;
        }
        return earnedInternal(lpool, account, isBorrow);
    }

    function getSupplyRewards(LPoolInterface[] calldata lpools, address account) external override {
        uint rewards = 0;
        for (uint i = 0; i < lpools.length; i++) {
            if (updateReward(lpools[i], account, false)) {
                rewards = rewards.add(earnedInternal(lpools[i], account, false));
                lPoolRewardByAccounts[lpools[i]][false][account].rewards = 0;
            }
        }
        require(rewards > 0, 'rewards is zero');
        require(oleToken.balanceOf(address(this)) >= rewards, 'balance<rewards');
        oleToken.transfer(account, rewards);
    }


    function transferOut(address to, uint amount) internal returns (bool){
        if (oleToken.balanceOf(address(this)) < amount) {
            return false;
        }
        oleToken.transfer(to, amount);
        return true;
    }
}

interface ControllerOpenLevInterface {
    function priceOracle() external view returns (PriceOracleInterface);

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint32 marginRatio
    ) external returns (uint16);
}

