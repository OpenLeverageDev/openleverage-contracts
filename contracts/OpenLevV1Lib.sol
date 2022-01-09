pragma solidity 0.7.6;

import "./OpenLevInterface.sol";

library OpenLevV1Lib {
   function setCalculateConfigInternal(
        uint16 defaultFeesRate,
        uint8 insuranceRatio,
        uint16 defaultMarginLimit,
        uint16 priceDiffientRatio,
        uint16 updatePriceDiscount,
        uint16 feesDiscount,
        uint128 feesDiscountThreshold,
        uint16 penaltyRatio,
        uint8 maxLiquidationPriceDiffientRatio,
        uint16 twapDuration,
        OpenLevStorage.CalculateConfig storage calculateConfig
        ) external {
        require(defaultFeesRate < 10000 && insuranceRatio < 100 && defaultMarginLimit > 0 && updatePriceDiscount <= 100
        && feesDiscount <= 100 && penaltyRatio < 10000 && twapDuration > 0, 'PRI');
        calculateConfig.defaultFeesRate = defaultFeesRate;
        calculateConfig.insuranceRatio = insuranceRatio;
        calculateConfig.defaultMarginLimit = defaultMarginLimit;
        calculateConfig.priceDiffientRatio = priceDiffientRatio;
        calculateConfig.updatePriceDiscount = updatePriceDiscount;
        calculateConfig.feesDiscount = feesDiscount;
        calculateConfig.feesDiscountThreshold = feesDiscountThreshold;
        calculateConfig.penaltyRatio = penaltyRatio;
        calculateConfig.maxLiquidationPriceDiffientRatio = maxLiquidationPriceDiffientRatio;
        calculateConfig.twapDuration = twapDuration;
    }

    function setAddressConfigInternal(
        address controller,
        DexAggregatorInterface dexAggregator,
        OpenLevStorage.AddressConfig storage addressConfig
        ) external {
        require(controller != address(0) && address(dexAggregator) != address(0), 'CD0');
        addressConfig.controller = controller;
        addressConfig.dexAggregator = dexAggregator;
    }

    function setMarketConfigInternal(
        uint16 feesRate, 
        uint16 marginLimit, 
        uint16 priceDiffientRatio, 
        uint32[] memory dexs,
        Types.Market storage market
    ) external {
        require(feesRate < 10000 && marginLimit > 0 && dexs.length > 0, 'PRI');
        market.feesRate = feesRate;
        market.marginLimit = marginLimit;
        market.dexs = dexs;
        market.priceDiffientRatio = priceDiffientRatio;
    }
}