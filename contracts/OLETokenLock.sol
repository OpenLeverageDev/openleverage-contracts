// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./gov/OLEToken.sol";
import "./lib/Utils.sol";

/// @title OLE token Locked
/// @author OpenLeverage
/// @notice Release OLE to beneficiaries linearly.
contract OLETokenLock {
    using SafeMath for uint;

    OLEToken public oleToken;
    mapping(uint => ReleaseVar) public releaseVars;
    mapping(uint => address) public ownerOf;
    mapping(address => uint[]) public holdings;
    uint public releaseVarsCount;

    event Mint(address indexed owner, uint indexed releaseID, uint amount, uint startTime, uint endTime);
    event TransferOut(address indexed owner, uint indexed releaseID, uint amount);
    event Release(address indexed beneficiary, uint indexed releaseID, uint amount);

    struct ReleaseVar {
        uint amount;
        uint128 startTime;
        uint128 endTime;
        uint128 lastUpdateTime;
    }

    constructor(OLEToken token, address[] memory beneficiaries, uint[] memory amounts, uint128[] memory startTimes, uint128[] memory endTimes) {
        require(beneficiaries.length == amounts.length
        && beneficiaries.length == startTimes.length
            && beneficiaries.length == endTimes.length, "Array length must be same");
        
        oleToken = token;
        for (uint i = releaseVarsCount; i < beneficiaries.length; i++) {
            // require(startTimes[i] > block.timestamp, "too late to start");
            require(endTimes[i] > startTimes[i], "startTime must earlier than endTime");
            
            address beneficiary = beneficiaries[i];
            ReleaseVar memory releaseVar = ReleaseVar(amounts[i], startTimes[i], endTimes[i], startTimes[i]);
            releaseVars[i] = releaseVar;
            ownerOf[i] = beneficiary;
            holdings[beneficiary].push(i);

            emit Mint(beneficiary, i, amounts[i], startTimes[i], endTimes[i]);
        }

        releaseVarsCount += beneficiaries.length;
    }

    function release(uint[] memory releaseIDs) external {
        require(releaseInternal(releaseIDs) > 0, "nothing to release");
    }

    function releaseAll() external{
        require(releaseInternal(holdings[msg.sender]) > 0, "nothing to release");
    }

    function releaseInternal(uint[] memory releaseIDs) internal returns (uint releaseAmount){
        for (uint i; i < releaseIDs.length; i++){
            uint releaseID = releaseIDs[i];
            ReleaseVar memory releaseVar = releaseVars[releaseID];
            if (block.timestamp > releaseVar.startTime && releaseVar.amount > 0){
                releaseAmount += amountToRelease(releaseVar);
                if (block.timestamp < releaseVar.endTime){
                    releaseVars[releaseID].lastUpdateTime = uint128(block.timestamp);
                }else{
                    delete releaseVars[releaseID];
                    delete ownerOf[releaseID];
                }
                emit Release(msg.sender, releaseID, releaseAmount);
            }
        }

        if (releaseAmount > 0){
            // The transfer out limit exceeds the available limit of the account
            require(oleToken.balanceOf(address(this)) >= releaseAmount, "transfer out limit exceeds");
            oleToken.transfer(msg.sender, releaseAmount);
        }
    }

    function transferTo(address to, uint releaseID, uint amount) external {
        require(ownerOf[releaseID] == msg.sender, "release ID not found");
        require(to != msg.sender, 'same address');
        // release first
        {
            uint[] memory releaseIDs = new uint[](1);
            releaseIDs[0] = releaseID;
            releaseInternal(releaseIDs);
        }

        // calc locked left amount
        ReleaseVar memory releaseVar = releaseVars[releaseID];
        require(releaseVar.amount > 0, "nothing to transfer");
        uint lockedLeftAmount = amountLocked(releaseVar);
        require(lockedLeftAmount >= amount, 'Not enough');

        uint128 startTime = uint128(Utils.maxOf(releaseVar.startTime, block.timestamp));
        uint128 endTime = releaseVar.endTime;
        releaseVars[releaseID].amount = lockedLeftAmount.sub(amount);
        releaseVars[releaseID].startTime = startTime;

        uint newReleaseID = releaseVarsCount;
        releaseVarsCount++;
        releaseVars[newReleaseID] = ReleaseVar(amount, startTime, endTime, startTime);
        ownerOf[newReleaseID] = to;
        holdings[to].push(newReleaseID);

        emit TransferOut(msg.sender, releaseID, amount);
        emit Mint(to, newReleaseID, amount, startTime, endTime);
    }

    function amountToRelease(ReleaseVar memory releaseVar) internal view returns (uint) {
        uint calTime = Utils.minOf(block.timestamp, releaseVar.endTime);
        return calTime.sub(releaseVar.lastUpdateTime).mul(releaseVar.amount)
        .div(releaseVar.endTime - releaseVar.startTime);
    }

    function amountLocked(ReleaseVar memory releaseVar) internal pure returns (uint){
        return releaseVar.amount.mul(releaseVar.endTime - releaseVar.lastUpdateTime).div(releaseVar.endTime - releaseVar.startTime);
    }

    function releaseAbleAmount(address beneficiary) external view returns (uint amount){
        uint[] memory releaseIDs = holdings[beneficiary];
        for (uint i; i < releaseIDs.length; i++){
            ReleaseVar memory releaseVar = releaseVars[releaseIDs[i]];
            if(block.timestamp >= releaseVar.startTime && releaseVar.amount > 0){
                amount += amountToRelease(releaseVar);
            }
        }
    }

    function lockedAmount(address beneficiary) external view returns (uint amount){
        uint[] memory releaseIDs = holdings[beneficiary];
        for (uint i; i < releaseIDs.length; i++){
            ReleaseVar memory releaseVar = releaseVars[releaseIDs[i]];
            if(releaseVar.endTime >= block.timestamp){
                amount += amountLocked(releaseVar);
            }
        }
    }

    function getUserHoldings(address beneficiary) external view returns (uint[] memory validHoldings){
        uint[] memory userHoldings = holdings[beneficiary];
        uint count;
        for (uint i; i < userHoldings.length; i++){
            if (releaseVars[userHoldings[i]].amount > 0){
                count ++;
            }
        }
        validHoldings = new uint[](count);

        count = 0;
        for (uint i; i < userHoldings.length; i++){
            if (releaseVars[userHoldings[i]].amount > 0){
                validHoldings[count] = userHoldings[i];
                count ++;
            }
        }
    }

    function reArrangeUserHoldings(address beneficiary) external{
        uint[] memory userHoldings = holdings[beneficiary];
        delete holdings[beneficiary];
        for (uint i; i < userHoldings.length; i++){
            if (releaseVars[userHoldings[i]].amount > 0){
                holdings[beneficiary].push(userHoldings[i]);
            }
        }
    }
}