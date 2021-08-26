// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./lib/SignedSafeMath128.sol";
import "./Adminable.sol";
import "./DelegateInterface.sol";
import "./XOLEInterface.sol";
import "./DelegateInterface.sol";
import "./lib/DexData.sol";


// @title Voting Escrowed Token
// @notice Lock OLE to get time and amount weighted xOLE
// The weight in this implementation is linear, and lock cannot be more than maxtime (4 years)
contract XOLE is DelegateInterface, Adminable, XOLEInterface, XOLEStorage, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using SignedSafeMath128 for int128;
    using DexData for bytes;

    /* We cannot really do block numbers per se b/c slope is per time, not per block
    and per block could be fairly bad b/c Ethereum changes blocktimes.
    What we can do is to extrapolate ***At functions
    */
    constructor() {
    }

    function initialize(
        address _oleToken,
        DexAggregatorInterface _dexAgg,
        uint _devFundRatio,
        address _dev
    ) public {
        require(msg.sender == admin, "Not admin");
        require(_oleToken != address(0), "_oleToken address cannot be 0");
        require(_dev != address(0), "_dev address cannot be 0");
        oleToken = IERC20(_oleToken);
        devFundRatio = _devFundRatio;
        dev = _dev;
        point_history[0].blk = block.number;
        point_history[0].ts = block.timestamp;
        dexAgg = _dexAgg;
    }

    function setDexAgg(DexAggregatorInterface newDexAgg) external override onlyAdmin {
        dexAgg = newDexAgg;
    }

    // Fees sharing functions  =====

    function withdrawDevFund() external override {
        require(msg.sender == dev, "Dev only");
        require(devFund != 0, "No fund to withdraw");
        uint toSend = devFund;
        devFund = 0;
        oleToken.transfer(dev, toSend);
    }

    function convertToSharingToken(uint amount, uint minBuyAmount, bytes memory dexData) external override onlyAdminOrDeveloper() {
        require(supply > 0, "Can't share without locked OLE");
        address fromToken;
        address toToken;
        // If no swapping, then assuming OLE reward distribution
        if (dexData.length == 0) {
            fromToken = address(oleToken);
        } // Not OLE
        else {
            if (dexData.isUniV2Class()) {
                address[] memory path = dexData.toUniV2Path();
                fromToken = path[0];
                toToken = path[path.length - 1];
            } else {
                DexData.V3PoolData[] memory path = dexData.toUniV3Path();
                fromToken = path[0].tokenA;
                toToken = path[path.length - 1].tokenB;
            }
        }
        uint newReward;
        if (fromToken == address(oleToken)) {
            uint claimable = totalRewarded.sub(withdrewReward);
            uint toShare = oleToken.balanceOf(address(this)).sub(claimable).sub(supply).sub(devFund);
            require(toShare >= amount, 'Exceed OLE balance');
            newReward = toShare;
        } else {
            require(IERC20(fromToken).balanceOf(address(this)) >= amount, "Exceed available balance");
            (IERC20(fromToken)).approve(address(dexAgg), amount);
            newReward = dexAgg.sellMul(amount, minBuyAmount, dexData);
        }
        //fromToken or toToken equal OLE ,update reward
        if (fromToken == address(oleToken) || toToken == address(oleToken)) {
            uint newDevFund = newReward.mul(devFundRatio).div(10000);
            newReward = newReward.sub(newDevFund);
            devFund = devFund.add(newDevFund);
            totalRewarded = totalRewarded.add(newReward);
            lastUpdateTime = block.timestamp;
            rewardPerTokenStored = rewardPerToken(newReward);
            emit RewardAdded(fromToken, amount, newReward);
        } else {
            emit RewardConvert(fromToken, toToken, amount, newReward);
        }

    }

    function earned(address account) external override view returns (uint) {
        return earnedInternal(account);
    }

    function earnedInternal(address account) internal view returns (uint) {
        return locked[account].amount
        .mul(rewardPerToken(0).sub(userRewardPerTokenPaid[account]))
        .div(1e18)
        .add(rewards[account]);
    }

    function rewardPerToken(uint newReward) internal view returns (uint) {
        if (supply == 0) {
            return rewardPerTokenStored;
        }

        if (block.timestamp == lastUpdateTime) {
            return rewardPerTokenStored.add(newReward
            .mul(1e18)
            .div(supply));
        } else {
            return rewardPerTokenStored;
        }
    }

    function withdrawReward() external override {
        uint reward = getReward();
        oleToken.safeTransfer(msg.sender, reward);
        emit RewardPaid(msg.sender, reward);
    }

    function getReward() internal updateReward(msg.sender) returns (uint) {
        uint reward = earnedInternal(msg.sender);
        if (reward > 0) {
            rewards[msg.sender] = 0;
            withdrewReward = withdrewReward.add(reward);
        }
        return reward;
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken(0);
        rewards[account] = earnedInternal(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
        _;
    }

    /*** Admin Functions ***/
    function setDevFundRatio(uint newRatio) external override onlyAdmin {
        require(newRatio <= 10000);
        devFundRatio = newRatio;
    }

    function setDev(address newDev) external override onlyAdmin {
        dev = newDev;
    }

    // xOLE functions =====

    /*"
    @notice Get the most recently recorded rate of voting power decrease for `addr`
    @param addr Address of the user wallet
    @return Value of the slope
    */
    function get_last_user_slope(address addr) external view override returns (int128) {
        uint256 uepoch = user_point_epoch[addr];
        return user_point_history[addr][uepoch].slope;
    }

    /*
    @notice Get the timestamp for checkpoint `_idx` for `_addr`
    @param _addr User wallet address
    @param _idx User epoch number
    @return Epoch time of the checkpoint*/
    function user_point_history_ts(address _addr, uint256 _idx) external view override returns (uint256){
        return user_point_history[_addr][_idx].ts;
    }

    /*
    @notice Get timestamp when `_addr`'s lock finishes
    @param _addr User wallet
    @return Epoch time of the lock end
    */
    function locked__end(address _addr) external view override returns (uint256) {
        return locked[_addr].end;
    }

    /*
    @notice Record global and per - user data to checkpoint
    @param addr User's wallet address. No user checkpoint if 0x0
    @param old_locked Previous locked amount / end lock time for the user
    @param new_locked New locked amount / end lock time for the user*/
    function _checkpoint(address addr, LockedBalance memory old_locked, LockedBalance memory new_locked) internal {
        Point memory u_old;
        Point memory u_new;
        int128 old_dslope = 0;
        int128 new_dslope = 0;
        Vars memory vars;
        vars._epoch = epoch;

        if (addr != ZERO_ADDRESS) {
            // Calculate slopes and biases
            // Kept at zero when they have to
            if (old_locked.end > block.timestamp && old_locked.amount > 0) {
                u_old.slope = toInt128(old_locked.amount.div(MAXTIME));
                u_old.bias = u_old.slope.mul(toInt128(old_locked.end.sub(block.timestamp)));
            }
            if (new_locked.end > block.timestamp && new_locked.amount > 0) {
                u_new.slope = toInt128(new_locked.amount.div(MAXTIME));
                u_new.bias = u_new.slope.mul(toInt128(new_locked.end.sub(block.timestamp)));
            }

            // Read values of scheduled changes in the slope
            // old_locked.end can be in the past and in the future
            // new_locked.end can ONLY by in the FUTURE unless everything expired : than zeros
            old_dslope = slope_changes[old_locked.end];
            if (new_locked.end != 0) {
                if (new_locked.end == old_locked.end)
                    new_dslope = old_dslope;
                else
                    new_dslope = slope_changes[new_locked.end];
            }
        }

        Point memory last_point = Point(0, 0, block.timestamp, block.number);

        if (vars._epoch > 0) {
            last_point = point_history[vars._epoch];
        }

        uint256 last_checkpoint = last_point.ts;

        // initial_last_point is used for extrapolation to calculate block number
        // (approximately, for * At methods) and save them
        // as we cannot figure that out exactly from inside the contract

        Point memory initial_last_point = Point(last_point.bias, last_point.slope, last_point.ts, last_point.blk);
        uint256 block_slope = 0;
        // dblock / dt

        if (block.timestamp > last_point.ts) {
            block_slope = MULTIPLIER.mul(block.number.sub(last_point.blk)).div(block.timestamp.sub(last_point.ts));
        }
        // If last point is already recorded in this block, slope = 0
        // But that's ok b / c we know the block in such case

        // Go over weeks to fill history and calculate what the current point is
        uint256 t_i = last_checkpoint.div(WEEK).mul(WEEK);

        for (uint i = 0; i <= 255; i++) {
            // Hopefully it won't happen that this won't get used in 5 years!
            // If it does, users will be able to withdraw but vote weight will be broken
            t_i = t_i.add(WEEK);
            int128 d_slope = 0;
            if (t_i > block.timestamp)
                t_i = block.timestamp;
            else
                d_slope = slope_changes[t_i];

            last_point.bias = last_point.bias.sub(last_point.slope.mul(toInt128(t_i.sub(last_checkpoint))));
            last_point.slope = last_point.slope.add(d_slope);

            if (last_point.bias < 0) // This can happen
                last_point.bias = 0;

            if (last_point.slope < 0) // This cannot happen - just in case
                last_point.slope = 0;

            last_checkpoint = t_i;
            last_point.ts = t_i;
            last_point.blk = initial_last_point.blk.add(block_slope.mul(t_i.sub(initial_last_point.ts)).div(MULTIPLIER));
            vars._epoch = vars._epoch.add(1);
            if (t_i == block.timestamp) {
                last_point.blk = block.number;
                break;
            } else {
                point_history[vars._epoch] = last_point;
            }
        }

        epoch = vars._epoch;
        // Now point_history is filled until t = now

        if (addr != ZERO_ADDRESS) {
            // If last point was in this block, the slope change has been applied already
            // But in such case we have 0 slope(s)
            last_point.slope = last_point.slope.add(u_new.slope.sub(u_old.slope));
            last_point.bias = last_point.bias.add(u_new.bias.sub(u_old.bias));
            if (last_point.slope < 0)
                last_point.slope = 0;
            if (last_point.bias < 0)
                last_point.bias = 0;
        }

        // Record the changed point into history
        point_history[vars._epoch] = last_point;

        if (addr != ZERO_ADDRESS) {
            // Schedule the slope changes (slope is going down)
            // We subtract new_user_slope from [new_locked.end]
            // and add old_user_slope to [old_locked.end]
            if (old_locked.end > block.timestamp) {
                // old_dslope was < something > - u_old.slope, so we cancel that
                old_dslope = old_dslope.add(u_old.slope);
                if (new_locked.end == old_locked.end)
                    old_dslope = old_dslope.sub(u_new.slope);
                // It was a new deposit, not extension
                slope_changes[old_locked.end] = old_dslope;
            }

            if (new_locked.end > block.timestamp) {
                if (new_locked.end > old_locked.end) {
                    new_dslope = new_dslope.sub(u_new.slope);
                    // old slope disappeared at this point
                    slope_changes[new_locked.end] = new_dslope;
                }
                // else : we recorded it already in old_dslope
            }

            // Now handle user history
            vars.user_epoch = user_point_epoch[addr] + 1;

            user_point_epoch[addr] = vars.user_epoch;
            u_new.ts = block.timestamp;
            u_new.blk = block.number;
            user_point_history[addr][vars.user_epoch] = u_new;
        }
    }

    /*
    @notice Deposit and lock tokens for a user
    @param _addr User's wallet address
    @param _value Amount to deposit
    @param unlock_time New time when to unlock the tokens, or 0 if unchanged
    @param locked_balance Previous locked amount / timestamp
    */
    function _deposit_for(address _addr, uint256 _value, uint256 unlock_time, LockedBalance memory _locked, int128 _type) internal updateReward(msg.sender) {
        uint256 supply_before = supply;
        supply = supply_before.add(_value);
        LockedBalance memory old_locked = LockedBalance(_locked.amount, _locked.end);

        // Adding to existing lock, or if a lock is expired - creating a new one
        _locked.amount = _locked.amount.add(_value);

        if (unlock_time != 0) {
            _locked.end = unlock_time;
        }
        locked[_addr] = _locked;

        // Possibilities :
        // Both old_locked.end could be current or expired (> / < block.timestamp)
        // value == 0 (extend lock) or value > 0 (add to lock or extend lock)
        // _locked.end > block.timestamp (always)
        _checkpoint(_addr, old_locked, _locked);

        if (_value != 0) {
            assert(IERC20(oleToken).transferFrom(_addr, address(this), _value));
        }

        emit Deposit(_addr, _value, _locked.end, _type, block.timestamp);
        emit Supply(supply_before, supply_before + _value);
    }

    //@notice Record global data to checkpoint
    function checkpoint() external override {
        LockedBalance memory lb;
        LockedBalance memory lb2;
        _checkpoint(ZERO_ADDRESS, lb, lb2);
    }

    /*
    @notice Deposit `_value` tokens for `_addr` and add to the lock
    @dev Anyone (even a smart contract) can deposit for someone else, but
    cannot extend their locktime and deposit for a brand new user
    @param _addr User's wallet address
    @param _value Amount to add to user's lock
    */

    function deposit_for(address _addr, uint256 _value) external override nonReentrant() {
        LockedBalance memory _locked = locked[_addr];

        require(_value > 0);
        //# dev : need non - zero value
        require(_locked.amount > 0, "No existing lock found");
        require(_locked.end > block.timestamp, "Cannot add to expired lock. Withdraw");

        _deposit_for(_addr, _value, 0, locked[_addr], DEPOSIT_FOR_TYPE);
    }


    /*
    @notice Deposit `_value` tokens for `msg.sender` and lock until `_unlock_time`
    @param _value Amount to deposit
    @param _unlock_time Epoch time when tokens unlock, rounded down to whole weeks
    */
    function create_lock(uint256 _value, uint256 _unlock_time) external override nonReentrant() {
        // Locktime is rounded down to weeks
        uint256 unlock_time = _unlock_time.div(WEEK).mul(WEEK);
        LockedBalance memory _locked = locked[msg.sender];

        require(_value > 0, "Non zero value");
        require(_locked.amount == 0, "Withdraw old tokens first");
        require(unlock_time > block.timestamp, "Can only lock until time in the future");
        require(unlock_time <= block.timestamp + MAXTIME, "Voting lock can be 4 years max");

        _deposit_for(msg.sender, _value, unlock_time, _locked, CREATE_LOCK_TYPE);
    }

    /*
    @notice Deposit `_value` additional tokens for `msg.sender`
    without modifying the unlock time
    @param _value Amount of tokens to deposit and add to the lock
    */
    function increase_amount(uint256 _value) external override nonReentrant() {
        LockedBalance memory _locked = locked[msg.sender];
        require(_value > 0, "need non - zero value");
        require(_locked.amount > 0, "No existing lock found");
        require(_locked.end > block.timestamp, "Cannot add to expired lock. Withdraw");
        _deposit_for(msg.sender, _value, 0, _locked, INCREASE_LOCK_AMOUNT);
    }

    /*
    @notice Extend the unlock time for `msg.sender` to `_unlock_time`
    @param _unlock_time New epoch time for unlocking
    */

    function increase_unlock_time(uint256 _unlock_time) external override nonReentrant() {
        LockedBalance memory _locked = locked[msg.sender];
        // Locktime is rounded down to weeks
        uint256 unlock_time = _unlock_time.div(WEEK).mul(WEEK);
        require(_locked.end > block.timestamp, "Lock expired");
        require(_locked.amount > 0, "Nothing is locked");
        require(unlock_time > _locked.end, "Can only increase lock duration");
        require(unlock_time <= block.timestamp + MAXTIME, "Voting lock can be 4 years max");

        _deposit_for(msg.sender, 0, unlock_time, _locked, INCREASE_UNLOCK_TIME);
    }

    /*
    @notice Withdraw all tokens for `msg.sender`
    @dev Only possible if the lock has expired
    */
    function withdraw() external override nonReentrant() updateReward(msg.sender) {
        LockedBalance memory _locked = locked[msg.sender];
        require(_locked.amount >= 0, "Nothing to withdraw");
        require(block.timestamp >= _locked.end, "The lock didn't expire");
        uint256 value = _locked.amount;
        LockedBalance memory old_locked = LockedBalance(_locked.amount, _locked.end);
        _locked.end = 0;
        _locked.amount = 0;
        locked[msg.sender] = _locked;
        uint256 supply_before = supply;
        supply = supply_before.sub(value);

        /*
        old_locked can have either expired <= timestamp or zero end
        _locked has only 0 end
        Both can have >= 0 amount
        */
        _checkpoint(msg.sender, old_locked, _locked);
        uint reward = getReward();
        require(IERC20(oleToken).transfer(msg.sender, value.add(reward)));

        emit Withdraw(msg.sender, value, block.timestamp);
        emit RewardPaid(msg.sender, reward);
        emit Supply(supply_before, supply_before - value);
    }

    /*
    # The following ERC20/minime-compatible methods are not real balanceOf and supply!
    # They measure the weights for the purpose of voting, so they don't represent
    # real coins.
    */


    /*
    @notice Binary search to estimate timestamp for block number
    @param _block Block to find
    @param max_epoch Don't go beyond this epoch
    @return Approximate timestamp for block
    */
    function find_block_epoch(uint256 _block, uint256 max_epoch) internal view returns (uint256) {
        // Binary search
        uint256 _min = 0;
        uint256 _max = max_epoch;

        // Will be always enough for 128 - bit numbers
        for (uint i = 0; i <= 128; i++) {
            if (_min >= _max)
                break;
            uint256 _mid = _min.add(_max).add(1).div(2);
            if (point_history[_mid].blk <= _block)
                _min = _mid;
            else
                _max = _mid.sub(1);
        }
        return _min;
    }


    /*
    @notice Get the current voting power for `msg.sender`
    @dev Adheres to the ERC20 `balanceOf` interface for Aragon compatibility
    @param addr User wallet address
    @param _t Epoch time to return voting power at
    @return User voting power
    */
    function balanceOf(address addr, uint256 _t) external view override returns (uint256){
        if (_t == 0)
            _t = block.timestamp;

        uint256 _epoch = user_point_epoch[addr];
        if (_epoch == 0) {
            return 0;
        } else {
            Point memory last_point = user_point_history[addr][_epoch];
            last_point.bias = last_point.bias.sub(last_point.slope.mul(toInt128(_t.sub(last_point.ts))));
            if (last_point.bias < 0)
                last_point.bias = 0;
            return uint256(last_point.bias);
        }
    }

    /*
    @notice Measure voting power of `addr` at block height `_block`
    @dev Adheres to MiniMe `balanceOfAt` interface: https://github.com/Giveth/minime
    @param addr User's wallet address
    @param _block Block to calculate the voting power at
    @return Voting power
    */

    function balanceOfAt(address addr, uint256 _block) external view override returns (uint256){
        // Copying and pasting totalSupply code because Vyper cannot pass by
        // reference yet
        require(_block <= block.number);

        // Binary search
        uint256 _min = 0;
        uint256 _max = user_point_epoch[addr];

        //# Will be always enough for 128 - bit numbers
        for (uint i = 0; i <= 128; i++) {
            if (_min >= _max)
                break;
            uint256 _mid = _min.add(_max).add(1).div(2);
            if (user_point_history[addr][_mid].blk <= _block)
                _min = _mid;
            else
                _max = _mid.sub(1);
        }

        Point memory upoint = user_point_history[addr][_min];

        uint256 max_epoch = epoch;
        uint256 _epoch = find_block_epoch(_block, max_epoch);
        Point memory point_0 = point_history[_epoch];
        uint256 d_block = 0;
        uint256 d_t = 0;

        if (_epoch < max_epoch) {
            Point memory point_1 = point_history[_epoch + 1];
            d_block = point_1.blk.sub(point_0.blk);
            d_t = point_1.ts.sub(point_0.ts);
        }
        else {
            d_block = block.number.sub(point_0.blk);
            d_t = block.timestamp.sub(point_0.ts);
        }
        uint256 block_time = point_0.ts;
        if (d_block != 0)
            block_time += d_t * (_block.sub(point_0.blk)) / d_block;

        //upoint.bias -= upoint.slope * int128(block_time - upoint.ts);
        upoint.bias = upoint.bias.sub(upoint.slope.mul(toInt128(block_time.sub(upoint.ts))));
        if (upoint.bias >= 0)
            return uint256(upoint.bias);
        else
            return 0;
    }

    /*
    @notice Calculate total voting power at some point in the past
    @param point The point (bias / slope) to start search from
    @param t Time to calculate the total voting power at
    @return Total voting power at that time*/
    function supply_at(Point memory point, uint256 t) internal view returns (uint256){
        Point memory last_point = point;
        uint256 t_i = last_point.ts.div(WEEK).mul(WEEK);
        for (uint i = 0; i <= 255; i++) {
            t_i += WEEK;
            int128 d_slope = 0;
            if (t_i > t)
                t_i = t;
            else
                d_slope = slope_changes[t_i];

            last_point.bias = last_point.bias.sub(last_point.slope.mul(toInt128(t_i.sub(last_point.ts))));
            if (t_i == t)
                break;
            last_point.slope = last_point.slope.add(d_slope);
            last_point.ts = t_i;
        }

        if (last_point.bias < 0)
            last_point.bias = 0;
        return uint256(last_point.bias);
    }

    /*
    @notice Calculate total voting power
    @dev Adheres to the ERC20 `totalSupply` interface for Aragon compatibility
    @return Total voting power
    */
    function totalSupply(uint256 t) external view override returns (uint256) {
        if (t == 0)
            t = block.timestamp;

        uint256 _epoch = epoch;
        Point memory last_point = point_history[_epoch];
        return supply_at(last_point, t);
    }

    /*
    @notice Calculate total voting power at some point in the past
    @param _block Block to calculate the total voting power at
    @return Total voting power at `_block`*/
    function totalSupplyAt(uint256 _block) external view override returns (uint256) {
        require(_block <= block.number);
        uint256 _epoch = epoch;
        uint256 target_epoch = find_block_epoch(_block, _epoch);

        Point memory point = point_history[target_epoch];
        uint256 dt = 0;

        if (target_epoch < _epoch) {
            Point memory point_next = point_history[target_epoch.add(1)];
            if (point.blk != point_next.blk)
                dt = _block.sub(point.blk).mul(point_next.ts.sub(point.ts)).div(point_next.blk.sub(point.blk));
                //dt = (_block - point.blk) * (point_next.ts - point.ts) / (point_next.blk - point.blk);
        }
        else {
            if (point.blk != block.number)
                dt = _block.sub(point.blk).mul(block.timestamp.sub(point.ts)).div(block.number.sub(point.blk));
               //dt = (_block - point.blk) * (block.timestamp - point.ts) / (block.number - point.blk);
        }
        // Now dt contains info on how far are we beyond point
        return supply_at(point, point.ts.add(dt));
    }

    function toInt128(uint256 value) internal pure returns (int128) {
        require(value < 2**127, "SafeCast: value doesn\'t fit in 128 bits");
        return int128(value);
    }

}
