// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../lib/TransferHelper.sol";
import "../../lib/DexData.sol";
import "../../lib/Utils.sol";
import "../IWooPP.sol";

contract WoofiDexV1 {
    using SafeMath for uint;
    using Utils for uint;
    using TransferHelper for IERC20;

    address public quoteToken;
    IWooPP public woo;
    address rebateTo;

    function _approveIfNeeded(
        address _tokenIn,
        uint _amount
    ) internal {
        uint allowance = IERC20(_tokenIn).allowance(address(this), address(woo));
        if (allowance < _amount) {
            IERC20(_tokenIn).safeApprove(address(woo), _amount);
        }
    }

    function _safeQuery(
        function (address, uint) external view returns (uint) qFn,
        address _baseToken,
        uint _baseAmount
    ) internal view returns (uint) {
        try qFn(_baseToken, _baseAmount) returns (uint amountOut) {
            return amountOut;
        } catch {
            return 0;
        }
    }


    function query(
        uint _amountIn,
        address _tokenIn,
        address _tokenOut
    ) external view returns (uint256 amountOut) {
        if (_amountIn == 0) {
            return 0;
        }
        if (_tokenIn == quoteToken) {
            amountOut = woo.querySellQuote(_tokenOut, _amountIn);
        } else if (_tokenOut == quoteToken) {
            amountOut = woo.querySellBase(_tokenIn, _amountIn);
        } else {
            uint quoteAmount = woo.querySellBase(_tokenIn, _amountIn);
            amountOut = woo.querySellQuote(_tokenOut, quoteAmount);
        }
    }

    function wooSwap(
        uint _amountIn,
        uint _amountOut,
        address _tokenIn,
        address _tokenOut,
        address _to
    ) internal returns (uint realToAmount) {
        // check parameters and approve the allowrance if needed

        if (_tokenIn == quoteToken) {
            // case 1: quoteToken --> baseToken
            realToAmount = woo.sellQuote(
                _tokenOut,
                _amountIn,
                _amountOut,
                _to,
                rebateTo
            );
        } else if (_tokenOut == quoteToken) {
            // case 2: fromToken --> quoteToken
            realToAmount = woo.sellBase(
                _tokenIn,
                _amountIn,
                _amountOut,
                _to,
                rebateTo
            );
        } else {
            // case 3: fromToken --> quoteToken --> toToken
            uint256 quoteAmount = woo.sellBase(
                _tokenIn,
                _amountIn,
                0,
                address(this),
                rebateTo
            );
            _approveIfNeeded(quoteToken, quoteAmount);
            realToAmount = woo.sellQuote(
                _tokenOut,
                quoteAmount,
                _amountOut,
                _to,
                rebateTo
            );
        }
        // emit events if needed
    }
}

