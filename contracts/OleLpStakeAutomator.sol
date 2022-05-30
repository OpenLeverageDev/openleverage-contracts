// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

import "./DelegateInterface.sol";
import "./Adminable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OleLpStakeAutomatorInterface.sol";
import "./lib/TransferHelper.sol";

contract OleLpStakeAutomator is DelegateInterface, Adminable, ReentrancyGuard, OleLpStakeAutomatorInterface, OleLpStakeAutomatorStorage {
    using TransferHelper for IERC20;
    using SafeMath for uint;

    function initialize(
        XOLEInterface _xole,
        IERC20 _ole,
        IERC20 _otherToken,
        IERC20 _lpToken,
        IWETH _nativeToken,
        IUniswapV2Router01 _router
    ) public {
        require(msg.sender == admin, "NAD");
        xole = _xole;
        ole = _ole;
        otherToken = _otherToken;
        lpToken = _lpToken;
        nativeToken = _nativeToken;
        router = _router;
    }

    function createLockBoth(uint oleAmount, uint otherAmount, uint unlockTime, uint oleMin, uint otherMin) external payable override nonReentrant {
        transferInBothAndLock(oleAmount, otherAmount, unlockTime, oleMin, otherMin);
    }

    function createLockOLE(uint oleAmount, uint unlockTime, uint oleMin, uint otherMin) external override nonReentrant {
        transferInOleAndLock(oleAmount, unlockTime, oleMin, otherMin);
    }

    function createLockOther(uint otherAmount, uint unlockTime, uint oleMin, uint otherMin) external payable override nonReentrant {
        transferInOtherAndLock(otherAmount, unlockTime, oleMin, otherMin);
    }


    function increaseAmountBoth(uint oleAmount, uint otherAmount, uint oleMin, uint otherMin) external payable override nonReentrant {
        transferInBothAndLock(oleAmount, otherAmount, 0, oleMin, otherMin);
    }

    function increaseAmountOLE(uint oleAmount, uint oleMin, uint otherMin) external override nonReentrant {
        transferInOleAndLock(oleAmount, 0, oleMin, otherMin);
    }

    function increaseAmountOther(uint otherAmount, uint oleMin, uint otherMin) external payable override nonReentrant {
        transferInOtherAndLock(otherAmount, 0, oleMin, otherMin);
    }


    function withdrawBoth(uint oleMin, uint otherMin) external override nonReentrant {
        (uint oleOut, uint otherOut) = removeLiquidity(oleMin, otherMin);
        doTransferOut(msg.sender, ole, oleOut);
        doTransferOut(msg.sender, otherToken, otherOut);
    }

    function withdrawOle(uint oleMin, uint otherMin) external override nonReentrant {
        (uint oleOut, uint otherOut) = removeLiquidity(oleMin, otherMin);
        //swap
        otherToken.safeApprove(address(router), otherOut);
        uint[] memory amounts = router.swapExactTokensForTokens(otherOut, 0, getPath(ole), address(this), timestamp());
        uint oleSwapIn = amounts[1];
        doTransferOut(msg.sender, ole, oleOut.add(oleSwapIn));
    }

    function withdrawOther(uint oleMin, uint otherMin) external override nonReentrant {
        (uint oleOut, uint otherOut) = removeLiquidity(oleMin, otherMin);
        //swap
        ole.safeApprove(address(router), oleOut);
        uint[] memory amounts = router.swapExactTokensForTokens(oleOut, 0, getPath(otherToken), address(this), timestamp());
        uint otherSwapIn = amounts[1];
        doTransferOut(msg.sender, otherToken, otherOut.add(otherSwapIn));
    }

    function transferInBothAndLock(uint oleAmount, uint otherAmount, uint unlockTime, uint oleMin, uint otherMin) internal {
        // transferIn
        uint oleIn = transferIn(msg.sender, ole, oleAmount);
        uint otherIn = transferIn(msg.sender, otherToken, otherAmount);
        // add liquidity and increase amount
        addLiquidityAndLock(oleIn, otherIn, unlockTime, oleMin, otherMin);
    }

    function transferInOleAndLock(uint oleAmount, uint unlockTime, uint oleMin, uint otherMin) internal {
        // transferIn
        uint oleIn = transferIn(msg.sender, ole, oleAmount);
        // swap
        uint oleSwapOut = oleIn.div(2);
        ole.safeApprove(address(router), oleSwapOut);
        uint[] memory amounts = router.swapExactTokensForTokens(oleSwapOut, 0, getPath(otherToken), address(this), timestamp());
        uint otherIn = amounts[1];
        // add liquidity and create lock
        addLiquidityAndLock(oleIn.sub(oleSwapOut), otherIn, unlockTime, oleMin, otherMin);
    }

    function transferInOtherAndLock(uint otherAmount, uint unlockTime, uint oleMin, uint otherMin) internal {
        // transferIn
        uint otherIn = transferIn(msg.sender, otherToken, otherAmount);
        // swap
        uint otherSwapOut = otherIn.div(2);
        otherToken.safeApprove(address(router), otherSwapOut);
        uint[] memory amounts = router.swapExactTokensForTokens(otherSwapOut, 0, getPath(ole), address(this), timestamp());
        uint oleIn = amounts[1];
        // add liquidity and create lock
        addLiquidityAndLock(oleIn, otherIn.sub(otherSwapOut), unlockTime, oleMin, otherMin);
    }

    function addLiquidityAndLock(uint oleIn, uint otherIn, uint unlockTime, uint oleMin, uint otherMin) internal {
        // add liquidity
        ole.safeApprove(address(router), oleIn);
        otherToken.safeApprove(address(router), otherIn);
        (uint oleOut, uint otherOut, uint liquidity) = router.addLiquidity(address(ole), address(otherToken), oleIn, otherIn, oleMin, otherMin, address(this), timestamp());
        // create lock
        lpToken.safeApprove(address(xole), liquidity);
        if (unlockTime > 0) {
            xole.create_lock_for(msg.sender, liquidity, unlockTime);
        } else {
            xole.increase_amount_for(msg.sender, liquidity);
        }
        // back remainder
        if (oleIn > oleOut) {
            doTransferOut(msg.sender, ole, oleIn - oleOut);
        }
        if (otherIn > otherOut) {
            doTransferOut(msg.sender, otherToken, otherIn - otherOut);
        }
    }

    function removeLiquidity(uint oleMin, uint otherMin) internal returns (uint oleOut, uint otherOut){
        //withdraw
        xole.withdraw_automator(msg.sender);
        uint liquidity = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(router), liquidity);
        //remove liquidity
        (oleOut, otherOut) = router.removeLiquidity(address(ole), address(otherToken), liquidity, oleMin, otherMin, address(this), timestamp());
    }

    function transferIn(address from, IERC20 token, uint amount) internal returns (uint) {
        if (isNativeToken(token)) {
            nativeToken.deposit{value : msg.value}();
            return msg.value;
        } else {
            return token.safeTransferFrom(from, address(this), amount);
        }
    }

    function doTransferOut(address to, IERC20 token, uint amount) internal {
        if (isNativeToken(token)) {
            nativeToken.withdraw(amount);
            (bool success,) = to.call{value : amount}("");
            require(success);
        } else {
            token.safeTransfer(to, amount);
        }
    }

    function isNativeToken(IERC20 token) internal view returns (bool) {
        return address(token) == address(nativeToken);
    }

    function getPath(IERC20 destToken) internal view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(destToken) == address(ole) ? address(otherToken) : address(ole);
        path[1] = address(destToken) == address(ole) ? address(ole) : address(otherToken);
    }

    function timestamp() internal view returns (uint){
        return block.timestamp;
    }
}

