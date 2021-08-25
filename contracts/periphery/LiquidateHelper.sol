// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "../Types.sol";
import "../dex/DexAggregatorInterface.sol";

contract LiquidateHelper {
    using SafeMath for uint;

    constructor ()
    {

    }
    struct Vars {
        uint128 current;
        uint32 marketLimit;
    }
    //～27000 gas cost one
    function batchQuery(IOpenLev openLev, address[] calldata owners, uint16[] calldata marketIds, bool[] calldata longTokens, bytes calldata dexData) external view returns (Vars[] memory results){

        results = new Vars[](owners.length);
        DexAggregatorInterface dexAggregator = openLev.dexAggregator();
        for (uint i = 0; i < owners.length; i++) {
            Types.Trade memory trade = openLev.activeTrades(owners[i], marketIds[i], longTokens[i]);
            if (trade.held == 0) {
                results[i] = Vars(0, 0);
                continue;
            }
            Types.MarketVars memory vars;
            {
                Types.Market memory market = openLev.markets(marketIds[i]);
                vars.buyPool = longTokens[i] ? market.pool1 : market.pool0;
                vars.sellPool = longTokens[i] ? market.pool0 : market.pool1;
                vars.buyToken = IERC20(vars.buyPool.underlying());
                vars.sellToken = IERC20(vars.sellPool.underlying());
                vars.marginLimit = market.marginLimit;
            }
            uint borrowed = vars.sellPool.borrowBalanceCurrent(owners[i]);
            //Previous block price
            (uint previousTokenPrice, uint8 previousTokenDecimals,) = dexAggregator.getAvgPrice(address(vars.buyToken), address(vars.sellToken), 1, dexData);
            //current block price
            (uint currentTokenPrice, ) = dexAggregator.getPrice(address(vars.buyToken), address(vars.sellToken),  dexData);
            //isopen=true get smaller price, else get bigger price
            uint heldTokenPrice =previousTokenPrice < currentTokenPrice ? currentTokenPrice : previousTokenPrice;
            uint marketValueCurrent = trade.held.mul(heldTokenPrice).div(10 ** uint(previousTokenDecimals));
            if (marketValueCurrent >= borrowed) {
                results[i] = Vars((uint128)(marketValueCurrent.sub(borrowed).mul(10000).div(borrowed)), vars.marginLimit);
            } else {
                Vars(0, vars.marginLimit);
            }
        }
        return results;
    }

}

interface IOpenLev {

    function activeTrades(address owner, uint16 marketId, bool longToken) external view returns (Types.Trade memory);

    function dexAggregator() external view returns (DexAggregatorInterface);

    function markets(uint16 marketId) external view returns (Types.Market memory);
}
