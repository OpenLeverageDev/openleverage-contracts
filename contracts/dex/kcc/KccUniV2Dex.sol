// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../../lib/TransferHelper.sol";
import "../../lib/DexData.sol";
import "../../lib/Utils.sol";

contract KccUniV2Dex {
    using SafeMath for uint;
    using Utils for uint;
    using TransferHelper for IERC20;

    struct V2PriceOracle {
        uint32 blockTimestampLast;  // Last block timestamp when price updated
        uint price0; // recorded price for token0
        uint price1; // recorded price for token1
        uint price0CumulativeLast; // Cumulative TWAP for token0
        uint price1CumulativeLast; // Cumulative TWAP for token1
    }

    struct DexInfo {
        IUniswapV2Factory factory;
        uint16 fees;
    }

    function uniClassSell(DexInfo memory dexInfo,
        address buyToken,
        address sellToken,
        uint sellAmount,
        uint minBuyAmount,
        address payer,
        address payee
    ) internal returns (uint buyAmount){
        address pair = getUniClassPair(buyToken, sellToken, dexInfo.factory);
        IUniswapV2Pair(pair).sync();
        sellAmount = transferOut(IERC20(sellToken), payer, pair, sellAmount);
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        sellAmount = buyToken < sellToken ? IERC20(sellToken).balanceOf(pair).sub(token1Reserves) : IERC20(sellToken).balanceOf(pair).sub(token0Reserves);

        uint balanceBefore = IERC20(buyToken).balanceOf(payee);
        dexInfo.fees = getPairFees(dexInfo, pair);

        if (buyToken < sellToken) {
            buyAmount = getAmountOut(sellAmount, token1Reserves, token0Reserves, dexInfo.fees);
            IUniswapV2Pair(pair).swap(buyAmount, 0, payee, "");
        } else {
            buyAmount = getAmountOut(sellAmount, token0Reserves, token1Reserves, dexInfo.fees);
            IUniswapV2Pair(pair).swap(0, buyAmount, payee, "");
        }
        buyAmount = IERC20(buyToken).balanceOf(payee).sub(balanceBefore);
        require(buyAmount >= minBuyAmount, 'buy amount less than min');
    }

    function uniClassSellMul(DexInfo memory dexInfo, uint sellAmount, uint minBuyAmount, address[] memory tokens)
    internal returns (uint buyAmount){
        for (uint i = 1; i < tokens.length; i++) {
            address sellToken = tokens[i - 1];
            address buyToken = tokens[i];
            bool isLast = i == tokens.length - 1;
            address payer = i == 1 ? msg.sender : address(this);
            address payee = isLast ? msg.sender : address(this);
            buyAmount = uniClassSell(dexInfo, buyToken, sellToken, sellAmount, 0, payer, payee);
            if (!isLast) {
                sellAmount = buyAmount;
            }
        }
        require(buyAmount >= minBuyAmount, 'buy amount less than min');
    }

    function uniClassBuy(
        DexInfo memory dexInfo,
        address buyToken,
        address sellToken,
        uint buyAmount,
        uint maxSellAmount,
        uint24 buyTokenFeeRate,
        uint24 sellTokenFeeRate)
    internal returns (uint sellAmount){
        address pair = getUniClassPair(buyToken, sellToken, dexInfo.factory);
        IUniswapV2Pair(pair).sync();
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        uint balanceBefore = IERC20(buyToken).balanceOf(msg.sender);
        dexInfo.fees = getPairFees(dexInfo, pair);
        if (buyToken < sellToken) {
            sellAmount = getAmountIn(buyAmount.toAmountBeforeTax(buyTokenFeeRate), token1Reserves, token0Reserves, dexInfo.fees);
            sellAmount = sellAmount.toAmountBeforeTax(sellTokenFeeRate);
            require(sellAmount <= maxSellAmount, 'sell amount not enough');
            transferOut(IERC20(sellToken), msg.sender, pair, sellAmount);
            IUniswapV2Pair(pair).swap(buyAmount.toAmountBeforeTax(buyTokenFeeRate), 0, msg.sender, "");
        } else {
            sellAmount = getAmountIn(buyAmount.toAmountBeforeTax(buyTokenFeeRate), token0Reserves, token1Reserves, dexInfo.fees);
            sellAmount = sellAmount.toAmountBeforeTax(sellTokenFeeRate);
            require(sellAmount <= maxSellAmount, 'sell amount not enough');
            transferOut(IERC20(sellToken), msg.sender, pair, sellAmount);
            IUniswapV2Pair(pair).swap(0, buyAmount.toAmountBeforeTax(buyTokenFeeRate), msg.sender, "");
        }

        uint balanceAfter = IERC20(buyToken).balanceOf(msg.sender);
        require(buyAmount <= balanceAfter.sub(balanceBefore), "wrong amount bought");
    }

    function uniClassCalBuyAmount(DexInfo memory dexInfo, address buyToken, address sellToken, uint sellAmount) internal view returns (uint) {
        address pair = getUniClassPair(buyToken, sellToken, dexInfo.factory);
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        if (buyToken < sellToken) {
            return getAmountOut(sellAmount, token1Reserves, token0Reserves, getPairFees(dexInfo, pair));
        } else {
            return getAmountOut(sellAmount, token0Reserves, token1Reserves, getPairFees(dexInfo, pair));
        }
    }

    function uniClassCalSellAmount(
        DexInfo memory dexInfo,
        address buyToken,
        address sellToken,
        uint buyAmount,
        uint24 buyTokenFeeRate,
        uint24 sellTokenFeeRate) internal view returns (uint sellAmount) {
        address pair = getUniClassPair(buyToken, sellToken, dexInfo.factory);
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        sellAmount = buyToken < sellToken ?
        getAmountIn(buyAmount.toAmountBeforeTax(buyTokenFeeRate), token1Reserves, token0Reserves, getPairFees(dexInfo, pair)) :
        getAmountIn(buyAmount.toAmountBeforeTax(buyTokenFeeRate), token0Reserves, token1Reserves, getPairFees(dexInfo, pair));

        return sellAmount.toAmountBeforeTax(sellTokenFeeRate);
    }

    function uniClassGetPrice(IUniswapV2Factory factory, address desToken, address quoteToken, uint8 decimals) internal view returns (uint256){
        address pair = getUniClassPair(desToken, quoteToken, factory);
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        return desToken == IUniswapV2Pair(pair).token0() ?
        token1Reserves.mul(10 ** decimals).div(token0Reserves) :
        token0Reserves.mul(10 ** decimals).div(token1Reserves);
    }

    function uniClassGetAvgPrice(address desToken, address quoteToken, V2PriceOracle memory priceOracle) internal pure returns (uint256 price, uint256 timestamp){
        timestamp = priceOracle.blockTimestampLast;
        price = desToken < quoteToken ? uint(priceOracle.price0) : uint(priceOracle.price1);
    }


    function uniClassGetPriceCAvgPriceHAvgPrice(address pair, V2PriceOracle memory priceOracle, address desToken, address quoteToken, uint8 decimals)
    internal view returns (uint price, uint cAvgPrice, uint256 hAvgPrice, uint256 timestamp){
        bool isToken0 = desToken < quoteToken;
        (uint256 token0Reserves, uint256 token1Reserves, uint32 uniBlockTimeLast) = IUniswapV2Pair(pair).getReserves();
        price = isToken0 ?
        token1Reserves.mul(10 ** decimals).div(token0Reserves) :
        token0Reserves.mul(10 ** decimals).div(token1Reserves);

        hAvgPrice = isToken0 ? uint(priceOracle.price0) : uint(priceOracle.price1);
        timestamp = priceOracle.blockTimestampLast;

        if (uniBlockTimeLast <= priceOracle.blockTimestampLast) {
            cAvgPrice = hAvgPrice;
        } else {
            uint32 timeElapsed = uniBlockTimeLast - priceOracle.blockTimestampLast;
            cAvgPrice = uint256(isToken0 ?
                calTPrice(IUniswapV2Pair(pair).price0CumulativeLast(), priceOracle.price0CumulativeLast, timeElapsed, decimals) :
                calTPrice(IUniswapV2Pair(pair).price1CumulativeLast(), priceOracle.price1CumulativeLast, timeElapsed, decimals));
        }
    }

    function uniClassUpdatePriceOracle(address pair, V2PriceOracle memory priceOracle, uint32 timeWindow, uint8 decimals) internal returns (V2PriceOracle memory, bool updated) {
        uint32 currentBlockTime = toUint32(block.timestamp);
        if (currentBlockTime < (priceOracle.blockTimestampLast + timeWindow)) {
            return (priceOracle, false);
        }
        IUniswapV2Pair(pair).sync();
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
        return (priceOracle, true);
    }

    function calTPrice(uint currentPriceCumulativeLast, uint historyPriceCumulativeLast, uint32 timeElapsed, uint8 decimals)
    internal pure returns (uint){
        uint256 diff = currentPriceCumulativeLast.sub(historyPriceCumulativeLast);
        if (diff < (1e50)) {
            return ((diff.mul(10 ** decimals)) >> 112).div(timeElapsed);
        } else {
            return ((diff) >> 112).mul(10 ** decimals).div(timeElapsed);
        }
    }

    function toUint32(uint256 y) internal pure returns (uint32 z) {
        require((z = uint32(y)) == y);
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, uint16 fees) private pure returns (uint amountOut)
    {
        require(amountIn > 0, 'INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'INSUFFICIENT_LIQUIDITY');
        uint amountInWithFee = amountIn.mul(uint(10000).sub(fees));
        uint numerator = amountInWithFee.mul(reserveOut);
        uint denominator = reserveIn.mul(10000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut, uint16 fees) private pure returns (uint amountIn) {
        require(amountOut > 0, 'INSUFFICIENT_OUTPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'INSUFFICIENT_LIQUIDITY');
        uint numerator = reserveIn.mul(amountOut).mul(10000);
        uint denominator = reserveOut.sub(amountOut).mul(uint(10000).sub(fees));
        amountIn = (numerator / denominator).add(1);
    }

    function transferOut(IERC20 token, address payer, address to, uint amount) private returns (uint256 amountReceived) {
        if (payer == address(this)) {
            amountReceived = token.safeTransfer(to, amount);
        } else {
            amountReceived = token.safeTransferFrom(payer, to, amount);
        }
    }

    function getUniClassPair(address tokenA, address tokenB, IUniswapV2Factory factory) internal view returns (address pair){
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (address(factory) == 0x79855A03426e15Ad120df77eFA623aF87bd54eF3) {
            // mojito
            return address(uint(keccak256(abi.encodePacked(
                    hex'ff',
                    address(factory),
                    keccak256(abi.encodePacked(token0, token1)),
                    hex'3b58864b0ea7cc084fc3a5dc3ca7ea2fb5cedd9aac7f9fff0c3dd9a15713f1c7'
                ))));
        } else if (address(factory) == 0xAE46cBBCDFBa3bE0F02F463Ec5486eBB4e2e65Ae) {
            // ku
            return address(uint(keccak256(abi.encodePacked(
                    hex'ff',
                    address(factory),
                    keccak256(abi.encodePacked(token0, token1)),
                    hex'5d71f8561d80ed979ca73d5b742278f4719baab5f0dd78b6ca91bec31f0e2dbc'
                ))));
        } else {
            return factory.getPair(tokenA, tokenB);
        }
    }

    function getPairFees(DexInfo memory dexInfo, address pair) private view returns (uint16){
        if (address(dexInfo.factory) == 0x79855A03426e15Ad120df77eFA623aF87bd54eF3) {
            // mojito
            return toUint16((IMojitoPair)(pair).swapFeeNumerator());
        } else if (address(dexInfo.factory) == 0xAE46cBBCDFBa3bE0F02F463Ec5486eBB4e2e65Ae) {
            // ku
            return toUint16((uint(10)).mul((IKuswapPair)(pair).swapFee()));
        } else {
            return dexInfo.fees;
        }
    }

    function toUint16(uint256 y) internal pure returns (uint16 z) {
        require((z = uint16(y)) == y);
    }
}

interface IMojitoPair {
    function swapFeeNumerator() external view returns (uint);
}

interface IKuswapPair {
    function swapFee() external view returns (uint32);
}