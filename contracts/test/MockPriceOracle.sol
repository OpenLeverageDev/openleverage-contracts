// SPDX-License-Identifier: MIT

pragma solidity 0.7.3;

import "../dex/PriceOracleInterface.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract MockPriceOracle is PriceOracleInterface {
    using SafeMath for uint256;

    mapping(address => mapping(address => uint256)) public prices; //desToken => quoteToken =>price
    uint8 private constant priceDecimals = 8;

    function getPrice(address desToken, address quoteToken) external override view returns (uint256, uint8){
        return (prices[desToken][quoteToken], priceDecimals);
    }

    function setPrice(address desToken, address quoteToken, uint256 price) external {
        prices[desToken][quoteToken] = price;
    }

}
