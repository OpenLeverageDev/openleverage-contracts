// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;


import "./LPoolInterface.sol";
import "../lib/Exponential.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../lib/TransferHelper.sol";
import "../dex/DexAggregatorInterface.sol";
import "../IWETH.sol";

contract LPoolDepositor is ReentrancyGuard {
    using TransferHelper for IERC20;

    mapping(address => mapping(address => uint)) allowedToTransfer;

    constructor() {
    }

    function deposit(address pool, uint amount) external {
        allowedToTransfer[pool][msg.sender] = amount;
        LPoolInterface(pool).mintTo(msg.sender, amount);
    }

    function transferToPool(address from, uint amount) external{
        require(allowedToTransfer[msg.sender][from] == amount, "for recall only");
        delete allowedToTransfer[msg.sender][from];
        IERC20(LPoolInterface(msg.sender).underlying()).safeTransferFrom(from, msg.sender, amount);
    }

    function depositNative(address payable pool) external payable  {
        LPoolInterface(pool).mintTo{value : msg.value}(msg.sender, 0);
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
        revert('succeed');
    }
}

