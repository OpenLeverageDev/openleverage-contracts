// SPDX-License-Identifier: MIT

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "../DexCaller.sol";

contract MockDexCaller is DexCaller {

    constructor (IUniswapV2Factory _uniswapFactory){
        uniswapFactory = _uniswapFactory;
    }

    function swapSell(address buyToken, address sellToken, uint sellAmount) public {
        flashSell(buyToken, sellToken, sellAmount, 0);
    }

    function swapBuy(address buyToken, address sellToken, uint buyAmount) public {
        flashBuy(buyToken, sellToken, buyAmount, uint(- 1));
    }

    function swapLimit(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount) public {
        flashSell(buyToken, sellToken, sellAmount, minBuyAmount);
    }

    function swapBuyLimit(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount) public {
        flashBuy(buyToken, sellToken, buyAmount, maxSellAmount);
    }

}
