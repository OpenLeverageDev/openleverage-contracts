// SPDX-License-Identifier: MIT
pragma solidity 0.7.3;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./OpenLevInterface.sol";
import "./ReferralInterface.sol";
import "./Adminable.sol";
import "./DelegateInterface.sol";

contract Referral is DelegateInterface, ReferralInterface, ReferralStorage, Adminable {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    constructor() {}

    function initialize(address _openLev) external {
        require(msg.sender == admin, "not admin");
        openLev = _openLev;
    }

    function registerReferrer() override external {
        Account storage account = accounts[msg.sender];
        require(!account.isActive, "Already registered");
        account.isActive = true;
        emit NewReferrer(msg.sender);
    }

    function calReferralReward(address referee, address referrer, uint baseAmount, address token) external override returns (uint referrerReward, uint refereeDiscount) {
        require(msg.sender == openLev, "Only call from OpenLev allowed");
        require(referee != address(0), "Referee empty");

        Account storage refereeAcct = accounts[referee];
        address registeredReferrer = refereeAcct.referrer;

        // make referee as a active user and referrer after any trade
        if (!refereeAcct.isActive) {
            refereeAcct.isActive = true;
            emit NewReferrer(msg.sender);
        }

        if (registeredReferrer != address(0)) {// already has registered referrer, ignoring the one passed in
            Account storage registeredReferrerAcct = accounts[registeredReferrer];
            return payReward(registeredReferrerAcct, baseAmount, token);
        } else {
            if (referrer == address(0)) {// not found registeredReferrer and not passed-in any referrer
                return (0, 0);
            } else {// new referrer
                require(!isCircularReference(referrer, referee), "Circular referral");
                Account storage referrerAcct = accounts[referrer];

                // only make referral if referrer is active
                if (referrerAcct.isActive) {
                    refereeAcct.referrer = referrer;
                    referrerAcct.referredCount = referrerAcct.referredCount.add(1);
                    emit RegisteredReferral(referee, referrer);
                    return payReward(referrerAcct, baseAmount, token);
                } else {// referrer inactive
                    return (0, 0);
                }
            }
        }
    }

    function getReward(address referrer, address token) external view override returns (uint){
        return accounts[referrer].reward[token];
    }

    function withdrawReward(address token) external override {
        uint withdrawAmt = accounts[msg.sender].reward[token];
        require(withdrawAmt > 0, "balance is 0");
        accounts[msg.sender].reward[token] = 0;
        IERC20(token).transfer(msg.sender, withdrawAmt);
    }

    function payReward(Account storage referrerAcct, uint baseAmount, address token) internal returns (uint, uint) {
        uint firstLevelReward = calAmount(firstLevelRate, baseAmount);
        referrerAcct.reward[token] = referrerAcct.reward[token].add(firstLevelReward);
        uint calRefereeDiscount = calAmount(refereeDiscount, baseAmount);

        if (referrerAcct.referrer != address(0)) {// two level referral
            uint secondLevelReward = calAmount(secondLevelRate, baseAmount);
            Account storage upperReferrerAcct = accounts[referrerAcct.referrer];
            upperReferrerAcct.reward[token] = upperReferrerAcct.reward[token].add(secondLevelReward);
            return (firstLevelReward.add(secondLevelReward), calRefereeDiscount);
        } else {
            return (firstLevelReward, calRefereeDiscount);
        }
    }

    function calAmount(uint rate, uint baseAmount) internal pure returns (uint){
        return baseAmount.mul(rate).div(100);
    }

    function isCircularReference(address referrer, address referee) internal view returns (bool){
        address parent = referrer;

        for (uint i; i < 5; i++) {
            if (parent == address(0)) {
                break;
            }
            if (parent == referee) {
                return true;
            }
            parent = accounts[parent].referrer;
        }
        return false;
    }

    /*** Admin Functions ***/

    function setRate(uint _firstLevelRate, uint _secondLevelRate, uint _refereeDiscount) override external onlyAdmin {
        firstLevelRate = _firstLevelRate;
        secondLevelRate = _secondLevelRate;
        refereeDiscount = _refereeDiscount;
    }

    function setOpenLev(address _openLev) override external onlyAdmin {
        openLev = _openLev;
    }

}
