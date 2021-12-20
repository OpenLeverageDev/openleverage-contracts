// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;


import "./LPoolInterface.sol";
import "../lib/Exponential.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../dex/DexAggregatorInterface.sol";
import "../IWETH.sol";

contract LPoolDepositor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    constructor() {
    }

    function deposit(address pool, uint amount) external payable nonReentrant() {
        IERC20(LPoolInterface(pool).underlying()).safeTransferFrom(msg.sender, pool, amount);
        LPoolInterface(pool).mintTo(msg.sender);
    }

    function depositNative(address payable pool) external payable nonReentrant() {
        LPoolInterface(pool).mintTo{value : msg.value}(msg.sender);
    }

    //offchain call
    function checkSwap(IERC20 depositToken, IERC20 outToken, uint inAmount, DexAggregatorInterface dexAgg, bytes memory data) external payable {
        depositToken.safeTransferFrom(msg.sender, address(this), inAmount);
        checkSwapInternal(depositToken, outToken, inAmount, dexAgg, data);
    }
    //offchain call
    function checkSwapNative(IWETH weth, IERC20 outToken, DexAggregatorInterface dexAgg, bytes memory data) external payable {
        weth.deposit{value : msg.value}();
        checkSwapInternal(IERC20(address(weth)), outToken, msg.value, dexAgg, data);
    }

    function checkSwapInternal(IERC20 depositToken, IERC20 outToken, uint inAmount, DexAggregatorInterface dexAgg, bytes memory data) internal {
        depositToken.approve(address(dexAgg), inAmount);
        uint outTokenAmount = dexAgg.sell(address(outToken), address(depositToken), inAmount, 0, data);
        outToken.approve(address(dexAgg), outTokenAmount);
        dexAgg.sell(address(depositToken), address(outToken), outTokenAmount, 0, data);
        require(false, 'succeed');
    }
}

