// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./MockERC20.sol";
import "../dex/UniV2Dex.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

contract MockUniswapV2Pair {
    using SafeMath for uint256;

    uint public _price0CumulativeLast;
    uint public _price1CumulativeLast;

    address internal _token0;
    address internal _token1;
    uint112 public _reserve0;
    uint112 public _reserve1;
    uint32 public _blockTimestampLast;

    constructor(address tokenA,
        address tokenB,
        uint112 reserve0,
        uint112 reserve1)
    {
        require(tokenA != tokenB);
        require(reserve0 != 0);
        require(reserve1 != 0);

        //        if (tokenA < tokenB) {
        _token0 = tokenA;
        _token1 = tokenB;
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        //        } else {
        //            _token1 = tokenA;
        //            _token0 = tokenB;
        //            _reserve1 = reserve0;
        //            _reserve0 = reserve1;
        //        }

        MockERC20(_token0).mint(address(this), _reserve0);
        MockERC20(_token1).mint(address(this), _reserve1);
        _blockTimestampLast = uint32(block.timestamp.mod(2 ** 32));
    }

    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external {
        if (amount0Out > 0) {
            MockERC20(_token0).transfer(to, amount0Out);
        }
        if (amount1Out > 0) {
            MockERC20(_token1).transfer(to, amount1Out);
        }
        if (data.length > 0) {
            IUniswapV2Callee(to).uniswapV2Call(msg.sender, amount0Out, amount1Out, data);
        }
        _reserve0 = uint112(MockERC20(_token0).balanceOf(address(this)));
        _reserve1 = uint112(MockERC20(_token1).balanceOf(address(this)));
    }


    function setPrice(address tokenA, address tokenB, uint price) external {
        tokenB;
        if (_token0 == tokenA) {
            _reserve0 = 1000000 * 1e18 * 1;
            _reserve1 = 1000000 * 1e18 * uint112(price) / 100;
        }
        if (_token1 == tokenA) {
            _reserve1 = 1000000 * 1e18 * 1;
            _reserve0 = 1000000 * 1e18 * uint112(price) / 100;
        }
    }

    function getReserves() external view
    returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast){
        return (_reserve0, _reserve1, _blockTimestampLast);
    }

    function price0CumulativeLast() external view returns (uint){
        return _price0CumulativeLast;
    }

    function price1CumulativeLast() external view returns (uint){
        return _price1CumulativeLast;
    }

    function token0() external view returns (address){
        return _token0;
    }

    function token1() external view returns (address){
        return _token1;
    }

    function setPrice0CumulativeLast(uint _price) external {
        _price0CumulativeLast = _price;
    }

    function setPrice1CumulativeLast(uint _price) external {
        _price1CumulativeLast = _price;
    }

}
