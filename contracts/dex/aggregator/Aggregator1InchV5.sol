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
        address indexed buyToken,
        address indexed sellToken,
        uint sellAmount,
        uint minBuyAmount,
        uint realToAmount
    );

    function swap1inch(
        address buyToken,
        address sellToken,
        uint sellAmount,
        uint minBuyAmount,
        address payer,
        address payee,
        bytes calldata data
    ) internal returns (uint realToAmount) {
        uint sellTokenBalanceBefore = IERC20(sellToken).balanceOf(payer);
        uint buyTokenBalanceBefore = IERC20(buyToken).balanceOf(payee);
        (bool success, bytes memory returnData) = router1inch.call{value: sellToken == wETH ? sellAmount : 0}(data);
        require(sellAmount == sellTokenBalanceBefore.sub(IERC20(sellToken).balanceOf(payer)), '1InchRouter: sell_amount_error');
        (uint realToAmount, uint spentAmount) = abi.decode(returnData, (uint, uint));
        require(realToAmount == IERC20(buyToken).balanceOf(payee).sub(buyTokenBalanceBefore), '1InchRouter: receive_amount_error');
        require(realToAmount >= minBuyAmount, 'buy amount less than min');
        emit Swap1InchRouter(buyToken, sellToken, sellAmount, minBuyAmount, realToAmount);
    }
}
