// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;


import "@openzeppelin/contracts/math/SafeMath.sol";
import "./gov/OLEToken.sol";
import "./Adminable.sol";

/// @title OLE token Locked
/// @author OpenLeverage
/// @notice Release retroactive airdrop OLE to beneficiaries linearly.
contract RetroactiveAirdropLock is Adminable{
    using SafeMath for uint256;
    uint128 public startTime;
    uint128 public endTime;
    uint128 public expireTime;
    OLEToken public token;
    mapping(address => ReleaseVar) public releaseVars;

    event Release(address beneficiary, uint amount);

    struct ReleaseVar {
        uint256 amount;
        uint128 lastUpdateTime;
    }

    constructor(OLEToken token_, address payable _admin, uint128 startTime_, uint128 endTime_, uint128 expireTime_) {
        require(endTime_ > startTime_, "StartTime must be earlier than endTime");
        require(expireTime_ > endTime_, "EndTime must be earlier than expireTime");
        startTime = startTime_;
        endTime = endTime_;
        expireTime = expireTime_;
        admin = _admin;
        token = token_;
    }

    function setReleaseBatch(address[] memory beneficiaries, uint256[] memory amounts) external onlyAdmin{
        require(beneficiaries.length == amounts.length, "Length must be same");
        for (uint i = 0; i < beneficiaries.length; i++) {
            address beneficiary = beneficiaries[i];
            require(releaseVars[beneficiary].amount == 0, 'Beneficiary is exist');
            releaseVars[beneficiary] = ReleaseVar(amounts[i], startTime);
        }
    }

    function release() external {
        require(expireTime >= block.timestamp, "time expired");
        releaseInternal(msg.sender);
    }

    function withdraw(address to) external onlyAdmin{
        uint256 amount = token.balanceOf(address(this));
        require(amount > 0, "no amount available");
        token.transfer(to, amount);
    }

    function releaseInternal(address beneficiary) internal {
        uint256 amount = token.balanceOf(address(this));
        uint256 releaseAmount = releaseAbleAmount(beneficiary);
        // The transfer out limit exceeds the available limit of the account
        require(releaseAmount > 0, "no releasable amount");
        require(amount >= releaseAmount, "transfer out limit exceeds");
        releaseVars[beneficiary].lastUpdateTime = uint128(block.timestamp > endTime ? endTime : block.timestamp);
        token.transfer(beneficiary, releaseAmount);
        emit Release(beneficiary, releaseAmount);
    }

    function releaseAbleAmount(address beneficiary) public view returns (uint256){
        ReleaseVar memory releaseVar = releaseVars[beneficiary];
        require(block.timestamp >= startTime, "not time to unlock");
        require(releaseVar.amount > 0, "beneficiary does not exist");
        uint256 calTime = block.timestamp > endTime ? endTime : block.timestamp;
        return calTime.sub(releaseVar.lastUpdateTime).mul(releaseVar.amount)
        .div(endTime - startTime);
    }

    function lockedAmount(address beneficiary) public view returns (uint256){
        ReleaseVar memory releaseVar = releaseVars[beneficiary];
        require(endTime >= block.timestamp, 'locked end');
        return releaseVar.amount.mul(endTime - releaseVar.lastUpdateTime)
        .div(endTime - startTime);
    }

}