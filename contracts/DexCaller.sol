// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./dex/IUniswapV2Factory.sol";
import "./dex/IUniswapV2Pair.sol";
import "./dex/IUniswapV2Callee.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract DexCaller is IUniswapV2Callee {

    using SafeMath for uint;
    using SafeERC20 for IERC20;
    struct UniVars {
        address sellToken;
        uint amount;
    }



    function flashSell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount) internal returns (uint buyAmount){
        address pair = uniswapFactory.getPair(buyToken, sellToken);
        require(pair != address(0), 'Invalid pair');
        UniVars memory uniVars = UniVars({
        sellToken : sellToken,
        amount : sellAmount
        });
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        bool isToken0 = IUniswapV2Pair(pair).token0() == buyToken ? true : false;
        if (isToken0) {
            buyAmount = getAmountOut(sellAmount, token1Reserves, token0Reserves);
            require(buyAmount >= minBuyAmount, 'buy amount less than min');
            IUniswapV2Pair(pair).swap(buyAmount, 0, address(this), abi.encode(uniVars));
        } else {
            buyAmount = getAmountOut(sellAmount, token0Reserves, token1Reserves);
            require(buyAmount >= minBuyAmount, 'buy amount less than min');
            IUniswapV2Pair(pair).swap(0, buyAmount, address(this), abi.encode(uniVars));
        }
        return buyAmount;
    }

    function flashBuy(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount) internal returns (uint sellAmount){
        address pair = uniswapFactory.getPair(buyToken, sellToken);
        require(pair != address(0), 'Invalid pair');

        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        bool isToken0 = IUniswapV2Pair(pair).token0() == buyToken ? true : false;
        if (isToken0) {
            sellAmount = getAmountIn(buyAmount, token1Reserves, token0Reserves);
            require(maxSellAmount >= sellAmount, 'sell amount not enough');
            UniVars memory uniVars = UniVars({
            sellToken : sellToken,
            amount : sellAmount
            });
            IUniswapV2Pair(pair).swap(buyAmount, 0, address(this), abi.encode(uniVars));
        } else {
            sellAmount = getAmountIn(buyAmount, token0Reserves, token1Reserves);
            require(maxSellAmount >= sellAmount, 'sell amount not enough');
            UniVars memory uniVars = UniVars({
            sellToken : sellToken,
            amount : sellAmount
            });
            IUniswapV2Pair(pair).swap(0, buyAmount, address(this), abi.encode(uniVars));
        }
        return sellAmount;
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) internal pure returns (uint amountOut)
    {
        require(amountIn > 0, 'INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'INSUFFICIENT_LIQUIDITY');
        uint amountInWithFee = amountIn.mul(997);
        uint numerator = amountInWithFee.mul(reserveOut);
        uint denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) internal pure returns (uint amountIn) {
        require(amountOut > 0, 'INSUFFICIENT_OUTPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'INSUFFICIENT_LIQUIDITY');
        uint numerator = reserveIn.mul(amountOut).mul(1000);
        uint denominator = reserveOut.sub(amountOut).mul(997);
        amountIn = (numerator / denominator).add(1);
    }

    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external override {
        onSwapCall(sender, amount0, amount1, data);
    }
//
//    function hswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external override {
//        onSwapCall(sender, amount0, amount1, data);
//    }
//
//    function pancakeCall(address sender, uint amount0, uint amount1, bytes calldata data) external override {
//        onSwapCall(sender, amount0, amount1, data);
//    }

    function calBuyAmount(address buyToken, address sellToken, uint sellAmount) public override view returns (uint) {
        address pair = uniswapFactory.getPair(buyToken, sellToken);
        require(pair != address(0), 'Invalid pair');
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        bool isToken0 = IUniswapV2Pair(pair).token0() == buyToken ? true : false;
        if (isToken0) {
            return getAmountOut(sellAmount, token1Reserves, token0Reserves);
        } else {
            return getAmountOut(sellAmount, token0Reserves, token1Reserves);
        }
    }

    function onSwapCall(address sender, uint amount0, uint amount1, bytes calldata data) internal {
        // Shh - currently unused
        sender;
        amount0;
        amount1;
        // fetch the address of token0
        address token0 = IUniswapV2Pair(msg.sender).token0();
        // fetch the address of token1
        address token1 = IUniswapV2Pair(msg.sender).token1();
        // ensure that msg.sender is a V2 pair
        assert(msg.sender == uniswapFactory.getPair(token0, token1));
        // rest of the function goes here!
        (UniVars memory uniVars) = abi.decode(data, (UniVars));
        IERC20(uniVars.sellToken).safeTransfer(msg.sender, uniVars.amount);
    }
}
