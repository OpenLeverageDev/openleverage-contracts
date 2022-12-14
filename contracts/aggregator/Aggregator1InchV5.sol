// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../lib/TransferHelper.sol";
import "../lib/DexData.sol";

library Aggregator1InchV5 {
    using SafeMath for uint;
    using TransferHelper for IERC20;
    using DexData for bytes;

    function swap1inch(address router, bytes memory data, address payee, address buyToken, address sellToken, uint sellAmount, uint minBuyAmount) internal returns (uint returnAmount) {
        // verify sell token
        require(data.to1InchSellToken() == sellToken, "sell token error");
        uint buyTokenBalanceBefore = IERC20(buyToken).balanceOf(payee);
        IERC20(sellToken).safeApprove(router, sellAmount);
        (bool success, bytes memory returnData) = router.call(data);
        IERC20(sellToken).safeApprove(router, 0);
        assembly {
            if eq(success, 0) {revert(add(returnData, 0x20), returndatasize())}
        }
        returnAmount = IERC20(buyToken).balanceOf(payee).sub(buyTokenBalanceBefore);
        require(returnAmount >= minBuyAmount, '1inch: buy amount less than min');
    }
}
