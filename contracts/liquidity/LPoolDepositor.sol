// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;


import "./LPoolInterface.sol";
import "../lib/Exponential.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract LPoolDepositor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    constructor() {
    }

    function deposit(address pool, uint amount) external payable nonReentrant() {
        IERC20(LPoolInterface(pool).underlying()).transferFrom(msg.sender, pool, amount);
        LPoolInterface(pool).mintTo(msg.sender);
    }

    function depositNative(address payable pool) external payable nonReentrant() {
        LPoolInterface(pool).mintTo{value : msg.value}(msg.sender);
    }

}

