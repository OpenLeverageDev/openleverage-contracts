// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "../dex/DexAggregatorInterface.sol";

contract BatchQueryHelper {

    constructor ()
    {
    }

    struct PriceVars {
        uint256 price;
        uint8 decimal;
    }

    function getPrices(DexAggregatorInterface dexAgg, address[] calldata token0s, address[] calldata token1s, bytes[] calldata dexDatas) external view returns (PriceVars[] memory results){
        results = new PriceVars[](token0s.length);
        for (uint i = 0; i < token0s.length; i++) {
            PriceVars memory item;
            (item.price, item.decimal) = dexAgg.getPrice(token0s[i], token1s[i], dexDatas[i]);
            results[i] = item;
        }
        return results;
    }


}
