// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./Adminable.sol";

contract Reserve is Adminable {
    IERC20 public oleToken;
    using SafeMath for uint;

    uint public vestingAmount;
    uint public vestingBegin;
    uint public vestingEnd;
    uint public releaseRate;
    uint public withdrawAmount;

    event TransferTo(address to, uint amount);

    constructor (
        address payable _admin,
        IERC20 _oleToken,
        uint _vestingAmount,
        uint _vestingBegin,
        uint _vestingEnd
    ) {
        require(_admin != address(0), "_admin address cannot be 0");
        require(address(_oleToken) != address(0), "_oleToken address cannot be 0");
        require(_vestingBegin >= block.timestamp, 'Vesting begin too early');
        require(_vestingEnd > _vestingBegin, 'End is too early');
        require(_vestingAmount != 0, "Should not be start with zero reserve");

        admin = _admin;
        oleToken = _oleToken;
        vestingBegin = _vestingBegin;
        vestingEnd = _vestingEnd;
        vestingAmount = _vestingAmount;
        releaseRate = vestingAmount.div(vestingEnd - vestingBegin);
    }

    function transfer(address to, uint amount) external onlyAdmin {
        require(to != address(0), "to address cannot be 0");
        require(amount > 0, "amount is 0!");
        require(amount <= availableToVest(), "Amount exceeds limit");
        withdrawAmount = withdrawAmount + amount;
        oleToken.transfer(to, amount);
        emit TransferTo(to, amount);
    }

    function availableToVest() public view returns (uint) {
        if (block.timestamp >= vestingEnd) {
            return oleToken.balanceOf(address(this));
        } else {
            return vestingBegin > block.timestamp ? 0 : releaseRate.mul(block.timestamp - vestingBegin).sub(withdrawAmount);
        }
    }

}
