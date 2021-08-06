// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "./UniV2Dex.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract UniV2Dex {
    IUniswapV2Factory public immutable uniV2Factory;
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    constructor (IUniswapV2Factory _uniV2Factory) {
        uniV2Factory = _uniV2Factory;
    }
    function uniV2Sell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount) internal returns (uint buyAmount){
        address pair = uniV2Factory.getPair(buyToken, sellToken);
        require(pair != address(0), 'Invalid pair');
        address payer = msg.sender;
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        bool isToken0 = IUniswapV2Pair(pair).token0() == buyToken ? true : false;
        if (isToken0) {
            buyAmount = getAmountOut(sellAmount, token1Reserves, token0Reserves);
            require(buyAmount >= minBuyAmount, 'buy amount less than min');
            IERC20(sellToken).safeTransferFrom(payer, pair, sellAmount);
            IUniswapV2Pair(pair).swap(buyAmount, 0, payer, "");
        } else {
            buyAmount = getAmountOut(sellAmount, token0Reserves, token1Reserves);
            require(buyAmount >= minBuyAmount, 'buy amount less than min');
            IERC20(sellToken).safeTransferFrom(payer, pair, sellAmount);
            IUniswapV2Pair(pair).swap(0, buyAmount, payer, "");
        }
    }

    function uniV2Buy(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount) internal returns (uint sellAmount){
        address pair = uniV2Factory.getPair(buyToken, sellToken);
        require(pair != address(0), 'Invalid pair');
        address payer = msg.sender;
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        bool isToken0 = IUniswapV2Pair(pair).token0() == buyToken ? true : false;
        if (isToken0) {
            sellAmount = getAmountIn(buyAmount, token1Reserves, token0Reserves);
            require(sellAmount <= maxSellAmount, 'sell amount not enough');
            IERC20(sellToken).safeTransferFrom(payer, pair, sellAmount);
            IUniswapV2Pair(pair).swap(buyAmount, 0, payer, "");
        } else {
            sellAmount = getAmountIn(buyAmount, token0Reserves, token1Reserves);
            require(sellAmount <= maxSellAmount, 'sell amount not enough');
            IERC20(sellToken).safeTransferFrom(payer, pair, sellAmount);
            IUniswapV2Pair(pair).swap(0, buyAmount, payer, "");
        }
    }

    function uniV2CalBuyAmount(address buyToken, address sellToken, uint sellAmount) internal view returns (uint) {
        address pair = uniV2Factory.getPair(buyToken, sellToken);
        require(pair != address(0), 'Invalid pair');
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        bool isToken0 = IUniswapV2Pair(pair).token0() == buyToken ? true : false;
        if (isToken0) {
            return getAmountOut(sellAmount, token1Reserves, token0Reserves);
        } else {
            return getAmountOut(sellAmount, token0Reserves, token1Reserves);
        }
    }

    function uniV2GetPrice(address desToken, address quoteToken, uint8 decimals) internal view returns (uint256){
        IUniswapV2Pair pair = IUniswapV2Pair(uniV2Factory.getPair(desToken, quoteToken));
        if (address(pair) == address(0)) {
            return (0);
        }
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        return desToken == pair.token0() ? token1Reserves.mul(10 ** decimals).div(token0Reserves) : token0Reserves.mul(10 ** decimals).div(token1Reserves);
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) private pure returns (uint amountOut)
    {
        require(amountIn > 0, 'INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'INSUFFICIENT_LIQUIDITY');
        uint amountInWithFee = amountIn.mul(997);
        uint numerator = amountInWithFee.mul(reserveOut);
        uint denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) private pure returns (uint amountIn) {
        require(amountOut > 0, 'INSUFFICIENT_OUTPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'INSUFFICIENT_LIQUIDITY');
        uint numerator = reserveIn.mul(amountOut).mul(1000);
        uint denominator = reserveOut.sub(amountOut).mul(997);
        amountIn = (numerator / denominator).add(1);
    }


}
