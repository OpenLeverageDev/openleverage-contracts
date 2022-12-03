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

    function _approveIfNeeded(
        address _token,
        uint _amount
    ) internal {
        uint allowance = IERC20(_token).allowance(address(this), router1inch);
        if (allowance < _amount) {
            IERC20(_token).safeApprove(router1inch, _amount);
        }
    }

    function swap1inch(
        address fromToken,
        address toToken,
        uint256 fromAmount,
        address payee,
        bytes calldata data
    ) internal returns (uint realToAmount) {
        _approveIfNeeded(fromToken, fromAmount);
        uint balanceBefore = IERC20(toToken).balanceOf(payee);
        (bool success, bytes memory returnData) = router1inch.call{value: fromToken == wETH ? fromAmount : 0}(data);
        require(success, '1InchRouter: swap_fail');
        (uint realToAmount, uint spentAmount) = abi.decode(returnData, (uint, uint));
        require(realToAmount == IERC20(toToken).balanceOf(payee).sub(balanceBefore), '1InchRouter: swap_data_error');
        emit Swap1InchRouter(fromToken, toToken, fromAmount, realToAmount);
    }
}
