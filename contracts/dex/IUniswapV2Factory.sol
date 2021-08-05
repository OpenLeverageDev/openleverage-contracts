// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.3;
//mainnet:0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f

interface IUniswapV2Factory {

    function getPair(address tokenA, address tokenB) external view returns (address pair);

}
