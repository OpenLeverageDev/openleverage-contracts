// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../lib/TransferHelper.sol";

contract Aggregator1InchV5 {
    using SafeMath for uint;
    using TransferHelper for IERC20;
    address public router1inch;
    address wETH;

    event Swap1InchRouter(
        address indexed fromToken,
        address indexed toToken,
        uint256 fromAmount,
        uint256 realToAmount
    );

    function swap1inch(
        address fromToken,
        address toToken,
        uint256 fromAmount,
        address payee,
        bytes calldata data
    ) internal returns (uint realToAmount) {
        uint fromTokenBalanceBefore = IERC20(fromToken).balanceOf(payee);
        uint toTokenBalanceBefore = IERC20(toToken).balanceOf(payee);
        (bool success, bytes memory returnData) = router1inch.call{value: fromToken == wETH ? fromAmount : 0}(data);
        require(success, '1InchRouter: swap_fail');
        (uint realToAmount, uint spentAmount) = abi.decode(returnData, (uint, uint));
        require(fromAmount == fromTokenBalanceBefore.sub(IERC20(fromToken).balanceOf(payee)), '1InchRouter: sell_amount_error');
        require(realToAmount == IERC20(toToken).balanceOf(payee).sub(toTokenBalanceBefore), '1InchRouter: receive_amount_error');
        emit Swap1InchRouter(fromToken, toToken, fromAmount, realToAmount);
    }
}
