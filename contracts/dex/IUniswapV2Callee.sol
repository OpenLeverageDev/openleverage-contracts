// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.3;

import "./IUniswapV2Factory.sol";

abstract contract IUniswapV2Callee {
    IUniswapV2Factory public uniswapFactory;

    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external virtual;

//    function hswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external virtual;
//
//    function pancakeCall(address sender, uint amount0, uint amount1, bytes calldata data) external virtual;

    function calBuyAmount(address buyToken, address sellToken, uint sellAmount) external virtual view returns (uint) ;
}
