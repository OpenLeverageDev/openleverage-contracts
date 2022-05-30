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


/// @title Voting Escrowed Token
/// @author OpenLeverage
/// @notice Lock OLE to get time and amount weighted xOLE
/// @dev The weight in this implementation is linear, and lock cannot be more than maxtime (4 years)
contract XOLE is DelegateInterface, Adminable, XOLEInterface, XOLEStorage, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using SignedSafeMath128 for int128;
    using DexData for bytes;

    IERC20 public shareToken;

    IERC20 public oleLpStakeToken;

    address public oleLpStakeAutomator;

    /* We cannot really do block numbers per se b/c slope is per time, not per block
    and per block could be fairly bad b/c Ethereum changes blocktimes.
    What we can do is to extrapolate ***At functions
    */
    constructor() {
    }

    /// @notice initialize proxy contract
    /// @dev This function is not supposed to call multiple times. All configs can be set through other functions.
    /// @param _oleToken Address of contract _oleToken.
    /// @param _dexAgg Contract DexAggregatorDelegator.
    /// @param _devFundRatio Ratio of token reserved to Dev team
    /// @param _dev Address of Dev team.
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
        dexAgg = _dexAgg;
    }

    /*** Admin Functions ***/
    function setDevFundRatio(uint newRatio) external override onlyAdmin {
        require(newRatio <= 10000);
        devFundRatio = newRatio;
    }

    function setDev(address newDev) external override onlyAdmin {
        require(newDev != address(0), "0x");
        dev = newDev;
    }

    function setDexAgg(DexAggregatorInterface newDexAgg) external override onlyAdmin {
        dexAgg = newDexAgg;
    }

    function setShareToken(address _shareToken) external override onlyAdmin {
        require(_shareToken != address(0), "0x");
        require(devFund == 0 && claimableTokenAmountInternal() == 0, 'Withdraw fund firstly');
        shareToken = IERC20(_shareToken);
    }

    function setOleLpStakeToken(address _oleLpStakeToken) external override onlyAdmin {
        require(_oleLpStakeToken != address(0), "0x");
        require(address(oleLpStakeToken) == address(0), "Initialized");
        oleLpStakeToken = IERC20(_oleLpStakeToken);
    }

    function setOleLpStakeAutomator(address _oleLpStakeAutomator) external override onlyAdmin {
        require(_oleLpStakeAutomator != address(0), "0x");
        oleLpStakeAutomator = _oleLpStakeAutomator;
    }

    // Fees sharing functions  =====
    function withdrawDevFund() external override {
        require(msg.sender == dev, "Dev only");
        require(devFund != 0, "No fund to withdraw");
        uint toSend = devFund;
        devFund = 0;
        shareToken.safeTransfer(dev, toSend);
    }

    function withdrawCommunityFund(address to) external override onlyAdmin {
        require(to != address(0), "0x");
        uint claimable = claimableTokenAmountInternal();
        require(claimable != 0, "No fund to withdraw");
        withdrewReward = withdrewReward.add(claimable);
        shareToken.safeTransfer(to, claimable);
        emit RewardPaid(to, claimable);
    }

    function shareableTokenAmount() external override view returns (uint256){
        return shareableTokenAmountInternal();
    }

    function shareableTokenAmountInternal() internal view returns (uint256 shareableAmount){
        uint claimable = claimableTokenAmountInternal();
        if (address(shareToken) == address(oleLpStakeToken)) {
            shareableAmount = shareToken.balanceOf(address(this)).sub(totalLocked).sub(claimable).sub(devFund);
        } else {
            shareableAmount = shareToken.balanceOf(address(this)).sub(claimable).sub(devFund);
        }
    }

    function claimableTokenAmount() external override view returns (uint256){
        return claimableTokenAmountInternal();
    }

    function claimableTokenAmountInternal() internal view returns (uint256 claimableAmount){
        claimableAmount = totalRewarded.sub(withdrewReward);
    }

    /// @dev swap feeCollected to reward token
    function convertToSharingToken(uint amount, uint minBuyAmount, bytes memory dexData) external override onlyAdminOrDeveloper() {
        address fromToken;
        address toToken;
        // If no swapping, then assuming shareToken reward distribution
        if (dexData.length == 0) {
            fromToken = address(shareToken);
        }
        // Not shareToken
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
        // If fromToken is ole, check amount
        if (fromToken == address(oleLpStakeToken)) {
            require(oleLpStakeToken.balanceOf(address(this)).sub(totalLocked) >= amount, 'Exceed OLE balance');
        }
        uint newReward;
        if (fromToken == address(shareToken)) {
            uint toShare = shareableTokenAmountInternal();
            require(toShare >= amount, 'Exceed share token balance');
            newReward = amount;
        }
        else {
            require(IERC20(fromToken).balanceOf(address(this)) >= amount, "Exceed available balance");
            (IERC20(fromToken)).safeApprove(address(dexAgg), 0);
            (IERC20(fromToken)).safeApprove(address(dexAgg), amount);
            newReward = dexAgg.sellMul(amount, minBuyAmount, dexData);
            require(newReward > 0, 'New reward is 0');
        }
        //fromToken or toToken equal shareToken ,update reward
        if (fromToken == address(shareToken) || toToken == address(shareToken)) {
            uint newDevFund = newReward.mul(devFundRatio).div(10000);
            newReward = newReward.sub(newDevFund);
            devFund = devFund.add(newDevFund);
            totalRewarded = totalRewarded.add(newReward);
            emit RewardAdded(fromToken, amount, newReward);
        } else {
            emit RewardConvert(fromToken, toToken, amount, newReward);
        }

    }


    function balanceOf(address addr) external view override returns (uint256){
        return balances[addr];
    }

    /// @dev get supply amount by blocknumber
    function totalSupplyAt(uint256 blockNumber) external view returns (uint){
        if (totalSupplyNumCheckpoints == 0) {
            return 0;
        }
        if (totalSupplyCheckpoints[totalSupplyNumCheckpoints - 1].fromBlock <= blockNumber) {
            return totalSupplyCheckpoints[totalSupplyNumCheckpoints - 1].votes;
        }

        // Next check implicit zero balance
        if (totalSupplyCheckpoints[0].fromBlock > blockNumber) {
            return 0;
        }

        uint lower;
        uint upper = totalSupplyNumCheckpoints - 1;
        while (upper > lower) {
            uint center = upper - (upper - lower) / 2;
            // ceil, avoiding overflow
            Checkpoint memory cp = totalSupplyCheckpoints[center];
            if (cp.fromBlock == blockNumber) {
                return cp.votes;
            } else if (cp.fromBlock < blockNumber) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return totalSupplyCheckpoints[lower].votes;
    }

    /// @notice Deposit `_value` tokens for `msg.sender` and lock until `_unlock_time`
    /// @param _value Amount to deposit
    /// @param _unlock_time Epoch time when tokens unlock, rounded down to whole weeks
    function create_lock(uint256 _value, uint256 _unlock_time) external override nonReentrant() {
        uint256 unlock_time = create_lock_check(msg.sender, _value, _unlock_time);
        _deposit_for(msg.sender, _value, unlock_time, locked[msg.sender], CREATE_LOCK_TYPE);
    }

    function create_lock_for(address to, uint256 _value, uint256 _unlock_time) external override nonReentrant() {
        uint256 unlock_time = create_lock_check(to, _value, _unlock_time);
        _deposit_for(to, _value, unlock_time, locked[to], CREATE_LOCK_TYPE);
    }

    function create_lock_check(address to, uint256 _value, uint256 _unlock_time) internal view returns (uint unlock_time) {
        // Locktime is rounded down to weeks
        unlock_time = _unlock_time.div(WEEK).mul(WEEK);
        LockedBalance memory _locked = locked[to];
        require(_value > 0, "Non zero value");
        require(_locked.amount == 0, "Withdraw old tokens first");
        require(unlock_time > block.timestamp, "Can only lock until time in the future");
        require(unlock_time <= block.timestamp + MAXTIME, "Voting lock can be 4 years max");
    }


    /// @notice Deposit `_value` additional tokens for `msg.sender`
    /// without modifying the unlock time
    /// @param _value Amount of tokens to deposit and add to the lock
    function increase_amount(uint256 _value) external override nonReentrant() {
        LockedBalance memory _locked = increase_amount_check(msg.sender, _value);
        _deposit_for(msg.sender, _value, 0, _locked, INCREASE_LOCK_AMOUNT);
    }

    function increase_amount_for(address to, uint256 _value) external override nonReentrant() {
        LockedBalance memory _locked = increase_amount_check(to, _value);
        _deposit_for(to, _value, 0, _locked, INCREASE_LOCK_AMOUNT);
    }

    function increase_amount_check(address to, uint256 _value) internal view returns (LockedBalance memory _locked) {
        _locked = locked[to];
        require(_value > 0, "need non - zero value");
        require(_locked.amount > 0, "No existing lock found");
        require(_locked.end > block.timestamp, "Cannot add to expired lock. Withdraw");
    }

    /// @notice Extend the unlock time for `msg.sender` to `_unlock_time`
    /// @param _unlock_time New epoch time for unlocking
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

    /// @notice Deposit and lock tokens for a user
    /// @param _addr User's wallet address
    /// @param _value Amount to deposit
    /// @param unlock_time New time when to unlock the tokens, or 0 if unchanged
    /// @param _locked Previous locked amount / timestamp
    /// @param _type For event only.
    function _deposit_for(address _addr, uint256 _value, uint256 unlock_time, LockedBalance memory _locked, int128 _type) internal {
        uint256 locked_before = totalLocked;
        totalLocked = locked_before.add(_value);
        // Adding to existing lock, or if a lock is expired - creating a new one
        _locked.amount = _locked.amount.add(_value);

        if (unlock_time != 0) {
            _locked.end = unlock_time;
        }
        locked[_addr] = _locked;

        if (_value != 0) {
            oleLpStakeToken.safeTransferFrom(msg.sender, address(this), _value);
        }

        uint calExtraValue = _value;
        // only increase unlock time
        if (_value == 0) {
            _burn(_addr);
            calExtraValue = locked[_addr].amount;
        }
        uint weekCount = locked[_addr].end.sub(block.timestamp).div(WEEK);
        if (weekCount > 1) {
            uint extraToken = calExtraValue.mul(oneWeekExtraRaise).mul(weekCount - 1).div(10000);
            _mint(_addr, calExtraValue + extraToken);
        } else {
            _mint(_addr, calExtraValue);
        }
        emit Deposit(_addr, _value, _locked.end, _type, block.timestamp);
    }

    function _mint(address account, uint amount) internal {
        totalSupply = totalSupply.add(amount);
        balances[account] = balances[account].add(amount);
        emit Transfer(address(0), account, amount);
        if (delegates[account] == address(0)) {
            delegates[account] = account;
        }
        _moveDelegates(address(0), delegates[account], amount);
        _updateTotalSupplyCheckPoints();
    }

    function _burn(address account) internal {
        uint burnAmount = balances[account];
        totalSupply = totalSupply.sub(burnAmount);
        balances[account] = 0;
        emit Transfer(account, address(0), burnAmount);
        _moveDelegates(delegates[account], address(0), burnAmount);
        _updateTotalSupplyCheckPoints();
    }

    function _updateTotalSupplyCheckPoints() internal {
        uint32 blockNumber = safe32(block.number, "block number exceeds 32 bits");
        if (totalSupplyNumCheckpoints > 0 && totalSupplyCheckpoints[totalSupplyNumCheckpoints - 1].fromBlock == blockNumber) {
            totalSupplyCheckpoints[totalSupplyNumCheckpoints - 1].votes = totalSupply;
        }
        else {
            totalSupplyCheckpoints[totalSupplyNumCheckpoints] = Checkpoint(blockNumber, totalSupply);
            totalSupplyNumCheckpoints = totalSupplyNumCheckpoints + 1;
        }
    }


    /// @notice Withdraw all tokens for `msg.sender`
    /// @dev Only possible if the lock has expired
    function withdraw() external override nonReentrant() {
        _withdraw_for(msg.sender, msg.sender);
    }

    function withdraw_automator(address owner) external override nonReentrant() {
        require(oleLpStakeAutomator == msg.sender, "Not automator");
        _withdraw_for(owner, oleLpStakeAutomator);
    }

    function _withdraw_for(address owner, address to) internal {
        LockedBalance memory _locked = locked[owner];
        require(_locked.amount > 0, "Nothing to withdraw");
        require(block.timestamp >= _locked.end, "The lock didn't expire");
        uint256 value = _locked.amount;
        totalLocked = totalLocked.sub(value);
        _locked.end = 0;
        _locked.amount = 0;
        locked[to] = _locked;
        oleLpStakeToken.safeTransfer(to, value);
        _burn(owner);
        emit Withdraw(owner, value, block.timestamp);
    }

    /// Delegate votes from `msg.sender` to `delegatee`
    /// @param delegatee The address to delegate votes to
    function delegate(address delegatee) public {
        require(delegatee != address(0), 'delegatee:0x');
        return _delegate(msg.sender, delegatee);
    }

    /// Delegates votes from signatory to `delegatee`
    /// @param delegatee The address to delegate votes to
    /// @param nonce The contract state required to match the signature
    /// @param expiry The time at which to expire the signature
    /// @param v The recovery byte of the signature
    /// @param r Half of the ECDSA signature pair
    /// @param s Half of the ECDSA signature pair
    function delegateBySig(address delegatee, uint nonce, uint expiry, uint8 v, bytes32 r, bytes32 s) public {
        delegateBySigInternal(delegatee, nonce, expiry, v, r, s);
    }

    function delegateBySigs(address delegatee, uint[] memory nonce, uint[] memory expiry, uint8[] memory v, bytes32[] memory r, bytes32[] memory s) public {
        require(nonce.length == expiry.length && nonce.length == v.length && nonce.length == r.length && nonce.length == s.length);
        for (uint i = 0; i < nonce.length; i++) {
            (bool success,) = address(this).call(
                abi.encodeWithSelector(XOLE(address(this)).delegateBySig.selector, delegatee, nonce[i], expiry[i], v[i], r[i], s[i])
            );
            if (!success) emit FailedDelegateBySig(delegatee, nonce[i], expiry[i], v[i], r[i], s[i]);
        }
    }

    function delegateBySigInternal(address delegatee, uint nonce, uint expiry, uint8 v, bytes32 r, bytes32 s) internal {
        require(delegatee != address(0), 'delegatee:0x');
        require(block.timestamp <= expiry, "delegateBySig: signature expired");

        bytes32 domainSeparator = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), getChainId(), address(this)));
        bytes32 structHash = keccak256(abi.encode(DELEGATION_TYPEHASH, delegatee, nonce, expiry));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signatory = ecrecover(digest, v, r, s);
        require(signatory != address(0), "delegateBySig: invalid signature");
        require(nonce == nonces[signatory], "delegateBySig: invalid nonce");

        _delegate(signatory, delegatee);
    }

    /// Gets the current votes balance for `account`
    /// @param account The address to get votes balance
    /// @return The number of current votes for `account`
    function getCurrentVotes(address account) external view returns (uint) {
        uint32 nCheckpoints = numCheckpoints[account];
        return nCheckpoints > 0 ? checkpoints[account][nCheckpoints - 1].votes : 0;
    }

    /// Determine the prior number of votes for an account as of a block number
    /// @dev Block number must be a finalized block or else this function will revert to prevent misinformation.
    /// @param account The address of the account to check
    /// @param blockNumber The block number to get the vote balance at
    /// @return The number of votes the account had as of the given block
    function getPriorVotes(address account, uint blockNumber) public view returns (uint) {
        require(blockNumber < block.number, "getPriorVotes:not yet determined");

        uint32 nCheckpoints = numCheckpoints[account];
        if (nCheckpoints == 0) {
            return 0;
        }

        // First check most recent balance
        if (checkpoints[account][nCheckpoints - 1].fromBlock <= blockNumber) {
            return checkpoints[account][nCheckpoints - 1].votes;
        }

        // Next check implicit zero balance
        if (checkpoints[account][0].fromBlock > blockNumber) {
            return 0;
        }

        uint32 lower;
        uint32 upper = nCheckpoints - 1;
        while (upper > lower) {
            uint32 center = upper - (upper - lower) / 2;
            // ceil, avoiding overflow
            Checkpoint memory cp = checkpoints[account][center];
            if (cp.fromBlock == blockNumber) {
                return cp.votes;
            } else if (cp.fromBlock < blockNumber) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return checkpoints[account][lower].votes;
    }

    function _delegate(address delegator, address delegatee) internal {
        nonces[delegator]++;
        address currentDelegate = delegates[delegator];
        uint delegatorBalance = balances[delegator];
        delegates[delegator] = delegatee;
        emit DelegateChanged(delegator, currentDelegate, delegatee);
        _moveDelegates(currentDelegate, delegatee, delegatorBalance);
    }

    function _moveDelegates(address srcRep, address dstRep, uint amount) internal {
        if (srcRep != dstRep && amount > 0) {
            if (srcRep != address(0)) {
                uint32 srcRepNum = numCheckpoints[srcRep];
                uint srcRepOld = srcRepNum > 0 ? checkpoints[srcRep][srcRepNum - 1].votes : 0;
                uint srcRepNew = srcRepOld.sub(amount);
                _writeCheckpoint(srcRep, srcRepNum, srcRepOld, srcRepNew);
            }

            if (dstRep != address(0)) {
                uint32 dstRepNum = numCheckpoints[dstRep];
                uint dstRepOld = dstRepNum > 0 ? checkpoints[dstRep][dstRepNum - 1].votes : 0;
                uint dstRepNew = dstRepOld.add(amount);
                _writeCheckpoint(dstRep, dstRepNum, dstRepOld, dstRepNew);
            }
        }
    }

    function _writeCheckpoint(address delegatee, uint32 nCheckpoints, uint oldVotes, uint newVotes) internal {
        uint32 blockNumber = safe32(block.number, "block number exceeds 32 bits");

        if (nCheckpoints > 0 && checkpoints[delegatee][nCheckpoints - 1].fromBlock == blockNumber) {
            checkpoints[delegatee][nCheckpoints - 1].votes = newVotes;
        } else {
            checkpoints[delegatee][nCheckpoints] = Checkpoint(blockNumber, newVotes);
            numCheckpoints[delegatee] = nCheckpoints + 1;
        }

        emit DelegateVotesChanged(delegatee, oldVotes, newVotes);
    }

    function safe32(uint n, string memory errorMessage) internal pure returns (uint32) {
        require(n < 2 ** 32, errorMessage);
        return uint32(n);
    }

    function getChainId() internal pure returns (uint) {
        uint256 chainId;
        assembly {chainId := chainid()}
        return chainId;
    }
}
