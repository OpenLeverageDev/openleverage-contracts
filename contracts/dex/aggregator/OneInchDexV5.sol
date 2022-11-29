// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../lib/TransferHelper.sol";

contract OneInchDexV5 {
    using SafeMath for uint;
    using TransferHelper for IERC20;
    address public oneInchRouter;
    address wETH;

    event OneInchRouterSwap(
        address indexed fromToken,
        address indexed toToken,
        uint256 fromAmount,
        uint256 minToAmount,
        uint256 realToAmount
    );

    function _approveIfNeeded(
        address _token,
        uint _amount
    ) internal {
        uint allowance = IERC20(_token).allowance(address(this), oneInchRouter);
        if (allowance < _amount) {
            IERC20(_tokenIn).safeApprove(oneInchRouter, _amount);
        }
    }

    function oneInchSwap(
        address fromToken,
        address toToken,
        uint256 fromAmount,
        uint256 minToAmount,
        bytes calldata data
    ) internal returns (uint realToAmount) {
        _approveIfNeeded(fromToken, fromAmount);
        uint256 preBalance = IERC20(toToken).balanceOf(address(this));
        (bool success, bytes memory returnData) = oneInchRouter.call{value: fromToken == wETH ? fromAmount : 0}(data);
        uint256 postBalance = IERC20(toToken).balanceOf(address(this));
        realToAmount = postBalance.sub(preBalance);
        require(realToAmount >= minToAmount, '1InchRouter: realToAmount_NOT_ENOUGH');
        emit OneInchRouterSwap(fromToken, toToken, fromAmount, minToAmount, realToAmount);
    }
}
