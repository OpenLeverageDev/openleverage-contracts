// SPDX-License-Identifier: MIT

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "../DexCaller.sol";
import "./MockUniswapV2Pair.sol";

contract MockUniswapFactory is IUniswapV2Factory {

    mapping(address => mapping(address => IUniswapV2Pair)) pairs;

    function addPair(MockUniswapV2Pair pair) external {
        mapping(address => IUniswapV2Pair) storage _pairs = pairs[pair.token0()];
        _pairs[pair.token1()] = pair;
    }

    function getPair(
        address tokenA,
        address tokenB)
    external view override returns (address)
    {
        IUniswapV2Pair pair;

        if (tokenA < tokenB) {
            pair = pairs[tokenA][tokenB];
        } else {
            pair = pairs[tokenB][tokenA];
        }
        return address(pair);
    }

}
