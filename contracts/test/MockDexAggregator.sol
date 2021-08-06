// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../dex/DexAggregatorV1.sol";
pragma experimental ABIEncoderV2;


contract MockDexAggregator is DexAggregatorV1 {
    constructor (
        IUniswapV2Factory _uniV2Factory,
        IUniswapV3Factory _uniV3Factory) DexAggregatorV1(_uniV2Factory, _uniV3Factory){
    }
}
