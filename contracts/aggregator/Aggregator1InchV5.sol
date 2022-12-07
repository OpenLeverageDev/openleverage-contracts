// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../lib/TransferHelper.sol";

library Aggregator1InchV5 {
    using SafeMath for uint;
    using TransferHelper for IERC20;

    struct Swap1inchVar {
        address buyToken;
        address sellToken;
        uint sellAmount;
        uint minBuyAmount;
        address payer;
        address payee;
        address router;
        bytes data;
    }

    event Swap1InchRouter(
        address indexed buyToken,
        address indexed sellToken,
        uint sellAmount,
        uint minBuyAmount,
        uint realToAmount
    );

    function swap1inch(
        Swap1inchVar memory swapVar
    ) internal returns (uint realToAmount) {
        uint sellTokenBalanceBefore = IERC20(swapVar.sellToken).balanceOf(swapVar.payer);
        uint buyTokenBalanceBefore = IERC20(swapVar.buyToken).balanceOf(swapVar.payee);
        (,bytes memory returnData) = swapVar.router.call{value: 0}(swapVar.data);
        require(swapVar.sellAmount == sellTokenBalanceBefore.sub(IERC20(swapVar.sellToken).balanceOf(swapVar.payer)), '1InchRouter: sell_amount_error');
        (realToAmount,) = abi.decode(returnData, (uint, uint));
        require(realToAmount == IERC20(swapVar.buyToken).balanceOf(swapVar.payee).sub(buyTokenBalanceBefore), '1InchRouter: receive_amount_error');
        require(realToAmount >= swapVar.minBuyAmount, 'buy amount less than min');
        emit Swap1InchRouter(swapVar.buyToken, swapVar.sellToken, swapVar.sellAmount, swapVar.minBuyAmount, realToAmount);
    }
}
