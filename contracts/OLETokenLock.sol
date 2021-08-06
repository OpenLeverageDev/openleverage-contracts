// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;


import "@openzeppelin/contracts/math/SafeMath.sol";

contract OLETokenLock {

    using SafeMath for uint256;
    IOLEToken public token;
    mapping(address => ReleaseVar) public releaseVars;


    struct ReleaseVar {
        address beneficiary;
        uint256 released;
        uint256 amount;
        uint128 startTime;
        uint128 endTime;
    }

    constructor(IOLEToken token_, address[] memory beneficiaries, uint256[] memory amounts, uint128[] memory startTimes, uint128[] memory endTimes, address delegateTo) {
        require(beneficiaries.length == amounts.length
        && beneficiaries.length == startTimes.length
            && beneficiaries.length == endTimes.length, "array length must be same");
        token = token_;
        for (uint i = 0; i < beneficiaries.length; i++) {
            address beneficiary = beneficiaries[i];
            releaseVars[beneficiary] = ReleaseVar(beneficiary, 0, amounts[i], startTimes[i], endTimes[i]);
        }
        token.delegate(delegateTo);

    }


    function release(address beneficiary) external {
        require(beneficiary != address(0), "beneficiary address cannot be 0");
        uint256 currentTransfer = transferableAmount(beneficiary);
        uint256 amount = token.balanceOf(address(this));
        require(amount > 0, "no amount available");
        // The transfer out limit exceeds the available limit of the account
        require(amount >= currentTransfer, "transfer out limit exceeds ");
        releaseVars[beneficiary].released = releaseVars[beneficiary].released.add(currentTransfer);
        token.transfer(beneficiary, currentTransfer);
    }


    function transferableAmount(address beneficiary) public view returns (uint256){
        require(block.timestamp >= releaseVars[beneficiary].startTime, "not time to unlock");
        require(releaseVars[beneficiary].amount > 0, "beneficiary does not exist");

        uint256 currentTime = block.timestamp;
        uint beneficiaryAmount = releaseVars[beneficiary].amount;

        uint256 currentTransfer;
        if (currentTime >= releaseVars[beneficiary].endTime) {
            currentTransfer = beneficiaryAmount;
        } else {
            uint256 moleculeTime = currentTime.sub(releaseVars[beneficiary].startTime);
            currentTransfer = moleculeTime.mul(beneficiaryAmount).div(releaseVars[beneficiary].endTime - releaseVars[beneficiary].startTime);
        }
        return currentTransfer.sub(releaseVars[beneficiary].released);
    }

}

interface IOLEToken {
    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount) external returns (bool);

    function delegate(address delegatee) external;
}
