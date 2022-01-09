// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;


import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


contract MockERC20 is ERC20 {
    using SafeMath for uint;
    
    uint public taxRate;
    uint public taxRatePrecision;

    constructor (string memory name_, string memory symbol_, uint taxRate_)  ERC20(name_, symbol_) {
        taxRate = taxRate_;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function balanceOf(address addr, uint256 _t) external view returns (uint256){
        _t;
        return balanceOf(addr);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, msg.sender, allowance(sender, msg.sender).sub(amount, "ERC20: transfer amount exceeds allowance"));
        return true;
    }

    function setTaxRate(uint newTaxRate) public {
        taxRate = newTaxRate;
    }
}
