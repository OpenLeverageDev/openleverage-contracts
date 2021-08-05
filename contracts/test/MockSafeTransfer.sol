// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.3;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./MockUnsafeERC20.sol";

contract MockSafeTransfer {
    using SafeERC20 for IERC20;

    IERC20 public _safeToken;
    IERC20 public _unSafeToken;

    constructor(IERC20 safeToken, IERC20 unSafeToken) {
        _safeToken = safeToken;
        _unSafeToken = unSafeToken;
    }

    function transferSafe(address to, uint amount) external {
        _safeToken.safeTransferFrom(msg.sender, to, amount);
    }

    function transferUnSafe(address to, uint amount) external {
        _unSafeToken.safeTransferFrom(msg.sender, to, amount);
    }
}
