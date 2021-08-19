// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "./UniV2Dex.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract UniV2Dex {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    struct V2PriceOracle {
        uint32 blockTimestampLast;
        uint112 price0;
        uint112 price1;
        uint price0CumulativeLast;
        uint price1CumulativeLast;
    }

    function uniV2Sell(address pair, address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, address payer, address payee) internal returns (uint buyAmount){
        require(pair != address(0), 'Invalid pair');
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        bool isToken0 = IUniswapV2Pair(pair).token0() == buyToken ? true : false;
        if (isToken0) {
            buyAmount = getAmountOut(sellAmount, token1Reserves, token0Reserves);
            require(buyAmount >= minBuyAmount, 'buy amount less than min');
            transferOut(IERC20(sellToken), payer, pair, sellAmount);
            IUniswapV2Pair(pair).swap(buyAmount, 0, payee, "");
        } else {
            buyAmount = getAmountOut(sellAmount, token0Reserves, token1Reserves);
            require(buyAmount >= minBuyAmount, 'buy amount less than min');
            transferOut(IERC20(sellToken), payer, pair, sellAmount);
            IUniswapV2Pair(pair).swap(0, buyAmount, payee, "");
        }
    }

    function uniV2SellMul(IUniswapV2Factory factory, uint sellAmount, uint minBuyAmount, address[] memory tokens) internal returns (uint buyAmount){
        for (uint i = 1; i < tokens.length; i++) {
            address sellToken = tokens[i - 1];
            address buyToken = tokens[i];
            bool isLast = i == tokens.length - 1;
            address payer = i == 1 ? msg.sender : address(this);
            address payee = isLast ? msg.sender : address(this);
            buyAmount = uniV2Sell(factory.getPair(sellToken, buyToken), buyToken, sellToken, sellAmount, 0, payer, payee);
            if (!isLast) {
                sellAmount = buyAmount;
            }
        }
        require(buyAmount >= minBuyAmount, 'buy amount less than min');
    }

    function uniV2Buy(address pair, address buyToken, address sellToken, uint buyAmount, uint maxSellAmount) internal returns (uint sellAmount){
        require(pair != address(0), 'Invalid pair');
        address payer = msg.sender;
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        bool isToken0 = IUniswapV2Pair(pair).token0() == buyToken ? true : false;
        if (isToken0) {
            sellAmount = getAmountIn(buyAmount, token1Reserves, token0Reserves);
            require(sellAmount <= maxSellAmount, 'sell amount not enough');
            transferOut(IERC20(sellToken), payer, pair, sellAmount);
            IUniswapV2Pair(pair).swap(buyAmount, 0, payer, "");
        } else {
            sellAmount = getAmountIn(buyAmount, token0Reserves, token1Reserves);
            require(sellAmount <= maxSellAmount, 'sell amount not enough');
            transferOut(IERC20(sellToken), payer, pair, sellAmount);
            IUniswapV2Pair(pair).swap(0, buyAmount, payer, "");
        }
    }

    function uniV2CalBuyAmount(address pair, address buyToken, uint sellAmount) internal view returns (uint) {
        require(pair != address(0), 'Invalid pair');
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        bool isToken0 = IUniswapV2Pair(pair).token0() == buyToken ? true : false;
        if (isToken0) {
            return getAmountOut(sellAmount, token1Reserves, token0Reserves);
        } else {
            return getAmountOut(sellAmount, token0Reserves, token1Reserves);
        }
    }

    function uniV2GetPrice(address pair, address desToken, uint8 decimals) internal view returns (uint256){
        if (address(pair) == address(0)) {
            return (0);
        }
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        return desToken == IUniswapV2Pair(pair).token0() ? token1Reserves.mul(10 ** decimals).div(token0Reserves) : token0Reserves.mul(10 ** decimals).div(token1Reserves);
    }

    function uniV2GetAvgPrice(address pair, V2PriceOracle memory priceOracle, address desToken) internal view returns (uint256 price, uint256 timestamp){
        timestamp = priceOracle.blockTimestampLast;
        price = IUniswapV2Pair(pair).token0() == desToken ? uint(priceOracle.price0) : uint(priceOracle.price1);
    }

    function uniV2GetCurrentPriceAndAvgPrice(address pair, V2PriceOracle memory priceOracle, address desToken, uint8 decimals) internal view returns (uint256 currentPrice, uint256 avgPrice, uint256 timestamp){
        currentPrice = uniV2GetPrice(pair, desToken, decimals);
        (avgPrice, timestamp) = uniV2GetAvgPrice(pair, priceOracle, desToken);
    }

    function uniV2GetPriceCAvgPriceHAvgPrice(address pair, V2PriceOracle memory priceOracle, address desToken, uint8 decimals) internal view returns (uint price, uint cAvgPrice, uint256 hAvgPrice, uint256 timestamp){
        bool isToken0 = IUniswapV2Pair(pair).token0() == desToken;
        (uint256 token0Reserves, uint256 token1Reserves,uint32 uniBlockTimeLast) = IUniswapV2Pair(pair).getReserves();
        price = isToken0 ? token1Reserves.mul(10 ** decimals).div(token0Reserves) : token0Reserves.mul(10 ** decimals).div(token1Reserves);

        hAvgPrice = isToken0 ? uint(priceOracle.price0) : uint(priceOracle.price1);
        timestamp = priceOracle.blockTimestampLast;
        if (uniBlockTimeLast <= priceOracle.blockTimestampLast) {
            cAvgPrice = hAvgPrice;
        } else {
            uint32 timeElapsed = uniBlockTimeLast - priceOracle.blockTimestampLast;
            cAvgPrice = uint256(isToken0 ? calTPrice(IUniswapV2Pair(pair).price0CumulativeLast(), priceOracle.price0CumulativeLast, timeElapsed, decimals) : calTPrice(IUniswapV2Pair(pair).price1CumulativeLast(), priceOracle.price1CumulativeLast, timeElapsed, decimals));
        }
    }

    function uniV2UpdatePriceOracle(address pair, V2PriceOracle storage priceOracle, uint8 decimals) internal {
        if (address(pair) == address(0)) {
            return;
        }
        uint32 currentBlockTime = toUint32(block.timestamp);
        //min 2 blocks
        if (currentBlockTime < (priceOracle.blockTimestampLast + 25)) {
            return;
        }
        (,,uint32 uniBlockTimeLast) = IUniswapV2Pair(pair).getReserves();
        if (uniBlockTimeLast != currentBlockTime) {
            IUniswapV2Pair(pair).sync();
        }
        uint32 timeElapsed = currentBlockTime - priceOracle.blockTimestampLast;
        uint currentPrice0CumulativeLast = IUniswapV2Pair(pair).price0CumulativeLast();
        uint currentPrice1CumulativeLast = IUniswapV2Pair(pair).price1CumulativeLast();
        if (priceOracle.blockTimestampLast != 0) {
            priceOracle.price0 = calTPrice(currentPrice0CumulativeLast, priceOracle.price0CumulativeLast, timeElapsed, decimals);
            priceOracle.price1 = calTPrice(currentPrice1CumulativeLast, priceOracle.price1CumulativeLast, timeElapsed, decimals);
        }
        priceOracle.price0CumulativeLast = currentPrice0CumulativeLast;
        priceOracle.price1CumulativeLast = currentPrice1CumulativeLast;
        priceOracle.blockTimestampLast = currentBlockTime;
    }

    function calTPrice(uint currentPriceCumulativeLast, uint historyPriceCumulativeLast, uint32 timeElapsed, uint8 decimals) internal pure returns (uint112){
        return toUint112(((currentPriceCumulativeLast.sub(historyPriceCumulativeLast).mul(10 ** decimals)) >> 112).div(timeElapsed));
    }

    function toUint112(uint256 y) internal pure returns (uint112 z) {
        require((z = uint112(y)) == y);
    }

    function toUint32(uint256 y) internal pure returns (uint32 z) {
        require((z = uint32(y)) == y);
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

    function transferOut(IERC20 token, address payer, address to, uint amount) private {
        if (payer == address(this)) {
            token.safeTransfer(to, amount);
        } else {
            token.safeTransferFrom(payer, to, amount);
        }

    }

}
