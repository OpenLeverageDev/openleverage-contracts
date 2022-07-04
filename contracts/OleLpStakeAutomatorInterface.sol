// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol';
import "./XOLEInterface.sol";
import "./IWETH.sol";

contract OleLpStakeAutomatorStorage {
    XOLEInterface public xole;
    IERC20 public ole;
    IERC20 public otherToken;
    IERC20 public lpToken;
    IWETH public nativeToken;
    IUniswapV2Router01 router;
}

interface OleLpStakeAutomatorInterface {

    function createLockBoth(uint oleAmount, uint otherAmount, uint unlockTime, uint oleMin, uint otherMin) external payable;

    function createLockOLE(uint oleAmount, uint unlockTime, uint oleMin, uint otherMin) external ;

    function createLockOther(uint otherAmount, uint unlockTime, uint oleMin, uint otherMin) external payable;


    function increaseAmountBoth(uint oleAmount, uint otherAmount, uint oleMin, uint otherMin) external payable;

    function increaseAmountOLE(uint oleAmount, uint oleMin, uint otherMin) external ;

    function increaseAmountOther(uint otherAmount, uint oleMin, uint otherMin) external payable;


    function withdrawBoth(uint oleMin, uint otherMin) external;

    function withdrawOle(uint oleMin, uint otherMin) external;

    function withdrawOther(uint oleMin, uint otherMin) external;


}