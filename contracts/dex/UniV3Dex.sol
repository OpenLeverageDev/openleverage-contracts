// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol";
import '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import '@uniswap/v3-core/contracts/libraries/TickMath.sol';


import '@uniswap/v3-periphery/contracts/libraries/CallbackValidation.sol';

contract UniV3Dex is IUniswapV3SwapCallback {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    IUniswapV3Factory public immutable uniV3Factory;
    uint24[] public feesArray;

    struct SwapCallbackData {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address payer;
    }
    constructor (IUniswapV3Factory _uniV3Factory){
        uniV3Factory = _uniV3Factory;
        feesArray.push(500);
        feesArray.push(3000);
        feesArray.push(10000);
    }
    function uniV3Sell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, uint24 fee) internal returns (uint amountOut){
        SwapCallbackData memory data = SwapCallbackData({tokenIn : sellToken, tokenOut : buyToken, fee : fee, payer : msg.sender});
        bool zeroForOne = data.tokenIn < data.tokenOut;
        IUniswapV3Pool pool;
        if (fee == 0) {
            (pool, fee,,) = getMaxLiquidityPoolInfo(data.tokenIn, data.tokenOut, 1);
            data.fee = fee;
        } else {
            pool = getPool(data.tokenIn, data.tokenOut, fee);
        }
        require(isPoolObservationsMoreThanOne(pool), "Pool observations less than 2");
        (int256 amount0, int256 amount1) =
        pool.swap(
            data.payer,
            zeroForOne,
            sellAmount.toInt256(),
            getSqrtPriceLimitX96(zeroForOne),
            abi.encode(data)
        );
        amountOut = uint256(- (zeroForOne ? amount1 : amount0));
        require(amountOut >= minBuyAmount, 'Too little received');
        uint actualPayAmount = uint256(zeroForOne ? amount0 : amount1);
        require(sellAmount == actualPayAmount, 'Cannot sell all');
    }

    function uniV3Buy(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount, uint24 fee) internal returns (uint amountIn){
        SwapCallbackData memory data = SwapCallbackData({tokenIn : sellToken, tokenOut : buyToken, fee : fee, payer : msg.sender});
        bool zeroForOne = data.tokenIn < data.tokenOut;
        IUniswapV3Pool pool;
        if (fee == 0) {
            (pool, fee,,) = getMaxLiquidityPoolInfo(data.tokenIn, data.tokenOut, 1);
            data.fee = fee;
        } else {
            pool = getPool(data.tokenIn, data.tokenOut, fee);
        }
        require(isPoolObservationsMoreThanOne(pool), "Pool observations less than 2");
        (int256 amount0Delta, int256 amount1Delta) =
        pool.swap(
            data.payer,
            zeroForOne,
            - buyAmount.toInt256(),
            getSqrtPriceLimitX96(zeroForOne),
            abi.encode(data)
        );

        uint256 amountOutReceived;
        (amountIn, amountOutReceived) = zeroForOne
        ? (uint256(amount0Delta), uint256(- amount1Delta))
        : (uint256(amount1Delta), uint256(- amount0Delta));
        require(amountOutReceived == buyAmount, 'Cannot buy enough');
        require(amountIn <= maxSellAmount, 'Too much requested');
    }


    function uniV3CalBuyAmount(address buyToken, address sellToken, uint sellAmount, uint24 fee) internal pure returns (uint buyAmount) {
        // Shh - currently unused
        buyToken;
        sellToken;
        sellAmount;
        fee;
        require(false, "Unsupported cal");
    }

    function uniV3GetPrice(address desToken, address quoteToken, uint8 decimals, uint24 fee) internal view returns (uint256){
        IUniswapV3Pool pool;
        if (fee == 0) {
            (pool,,,) = getMaxLiquidityPoolInfo(desToken, quoteToken, 1);
        } else {
            pool = getPool(desToken, quoteToken, fee);
        }

        if (address(0) == address(pool)) {
            return 0;
        }
        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        return getPriceBySqrtPriceX96(desToken, quoteToken, sqrtPriceX96, decimals);
    }
    //get maximum liquidity in previous block as a reference price
    function uniV3GetAvgPrice(address desToken, address quoteToken, uint32 secondsAgo, uint8 decimals, uint24 fee) internal view returns (uint256){
        // Shh - currently unused
        fee;
        require(secondsAgo > 0, "SecondsAgo must not 0");
        (,,, int24 avgTick) = getMaxLiquidityPoolInfo(desToken, quoteToken, secondsAgo);
        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(avgTick);
        return getPriceBySqrtPriceX96(desToken, quoteToken, sqrtPriceX96, decimals);
    }

    function getPriceBySqrtPriceX96(address desToken, address quoteToken, uint160 sqrtPriceX96, uint8 decimals) internal pure returns (uint256){
        uint priceScale = 10 ** decimals;
        // maximum～2**
        uint token0Price;
        // when sqrtPrice>1  retain 4 decimals
        if (sqrtPriceX96 > (2 ** 96)) {
            token0Price = (uint(sqrtPriceX96) >> (86)).mul((uint(sqrtPriceX96) >> (86))).mul(priceScale) >> (10 * 2);
        } else {
            token0Price = uint(sqrtPriceX96).mul(uint(sqrtPriceX96)).mul(priceScale) >> (96 * 2);
        }
        if (desToken < quoteToken) {
            return token0Price;
        } else {
            return uint(priceScale).mul(priceScale).div(token0Price);
        }
    }

    function getMaxLiquidityPoolInfo(address desToken, address quoteToken, uint32 secondsAgo) internal view returns (IUniswapV3Pool maxPool, uint24 fees, uint160 maxAvgLiquidity, int24 maxAvgTick) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = 0;
        secondsAgos[1] = secondsAgo;
        for (uint i = 0; i < feesArray.length; i++) {
            IUniswapV3Pool pool = getPool(desToken, quoteToken, feesArray[i]);
            if (address(pool) == address(0)) {
                continue;
            }
            if (!isPoolObservationsMoreThanOne(pool)) {
                continue;
            }
            (int56[] memory tickCumulatives1, uint160[] memory secondsPerLiquidityCumulativeX128s1) = pool.observe(secondsAgos);
            uint160 avgLiquidity1 = (secondsPerLiquidityCumulativeX128s1[0] - secondsPerLiquidityCumulativeX128s1[1]) / (secondsAgo);
            if (avgLiquidity1 > maxAvgLiquidity) {
                maxAvgLiquidity = avgLiquidity1;
                maxAvgTick = int24(((tickCumulatives1[0] - tickCumulatives1[1]) / (secondsAgo)));
                maxPool = pool;
                fees = feesArray[i];
            }
        }
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata _data
    ) external override {
        require(amount0Delta > 0 || amount1Delta > 0);
        SwapCallbackData memory data = abi.decode(_data, (SwapCallbackData));
        require(msg.sender == address(getPool(data.tokenIn, data.tokenOut, data.fee)), "V3 call back invalid");
        //    CallbackValidation.verifyCallback(address(uniV3Factory), data.tokenIn, data.tokenOut, data.fee);
        uint256 amountToPay = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        IERC20(data.tokenIn).safeTransferFrom(data.payer, msg.sender, amountToPay);
    }

    function getSqrtPriceLimitX96(bool zeroForOne) internal pure returns (uint160) {
        return zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1;
    }

    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal view returns (IUniswapV3Pool) {
        return IUniswapV3Pool(uniV3Factory.getPool(tokenA, tokenB, fee));
        //               return IUniswapV3Pool(PoolAddress.computeAddress(address(uniV3Factory), PoolAddress.getPoolKey(tokenA, tokenB, fee)));
    }

    function isPoolObservationsMoreThanOne(IUniswapV3Pool pool) internal view returns (bool){
        (,,,,uint16 count,,) = pool.slot0();
        return count > 1;
    }
}
