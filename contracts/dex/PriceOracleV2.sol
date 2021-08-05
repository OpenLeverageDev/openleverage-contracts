// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.3;

import "./PriceOracleInterface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./IUniswapV2Pair.sol";
import "./IUniswapV2Factory.sol";

contract PriceOracleV2 is PriceOracleInterface {
    using SafeMath for uint256;
    uint8 private constant priceDecimals = 10;
    uint128 private constant priceScale = 10 ** 10;

    IUniswapV2Factory public immutable uniswapFactory;
    constructor (IUniswapV2Factory _uniswapFactory) {
        uniswapFactory = _uniswapFactory;
    }

    function getPrice(address desToken, address quoteToken) external override view returns (uint256, uint8){
        IUniswapV2Pair pair = IUniswapV2Pair(uniswapFactory.getPair(desToken, quoteToken));
        if (address(pair) == address(0)) {
            return (0, priceDecimals);
        }
        (uint256 token0Reserves, uint256 token1Reserves,) = IUniswapV2Pair(pair).getReserves();
        if (desToken == pair.token0()) {
            return (token1Reserves.mul(priceScale).div(token0Reserves), priceDecimals);
        }
        return (token0Reserves.mul(priceScale).div(token1Reserves), priceDecimals);

    }

}
