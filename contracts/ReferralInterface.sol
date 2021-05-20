// SPDX-License-Identifier: MIT
pragma solidity 0.7.3;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

abstract contract ReferralStorage {
    using SafeMath for uint;

    struct Account {
        address referrer;
        mapping(address => uint) reward; // Reward by token
        uint referredCount;
        bool isActive;
    }

    address public openLev;
    uint public firstLevelRate = 16;
    uint public secondLevelRate = 8;
    uint public refereeDiscount = 8;

    mapping(address => Account) public accounts;

    event NewReferrer(address referrer);

    event RegisteredReferral(address referee, address referrer);
}

interface ReferralInterface {


    function registerReferrer() external;

    function calReferralReward(address referee, address referrer, uint baseAmount, address token) external returns (uint referrerReward, uint refereeDiscount);

    function getReward(address referrer, address token) external view returns (uint);

    function withdrawReward(address token) external;

    /*** Admin Functions ***/

    function setRate(uint _firstLevelRate, uint _secondLevelRate, uint _refereeDiscount) external;

    function setOpenLev(address _openLev) external;


}
