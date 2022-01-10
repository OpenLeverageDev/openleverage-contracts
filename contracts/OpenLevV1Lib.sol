pragma solidity 0.7.6;

import "./OpenLevInterface.sol";
import "./Adminable.sol";
import "./XOLEInterface.sol";
import "./IWETH.sol";

pragma experimental ABIEncoderV2;


library OpenLevV1Lib {
    using SafeMath for uint;
    using TransferHelper for IERC20;
    using DexData for bytes;

    struct PricesVar {
        uint current;
        uint cAvg;
        uint hAvg;
        uint price;
        uint cAvgPrice;
    }

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint16 marginLimit,
        bytes memory dexData,
        uint16 marketId,
        mapping(uint16 => Types.Market) storage markets,
        OpenLevStorage.CalculateConfig storage config,
        OpenLevStorage.AddressConfig storage addressConfig,
        mapping(uint8 => bool) storage _supportDexs
    ) external {
        uint8 dex = dexData.toDex();
        require(isSupportDex(_supportDexs, dex) && msg.sender == address(addressConfig.controller) && marginLimit >= config.defaultMarginLimit && marginLimit < 100000, "UDX");
        address token0 = pool0.underlying();
        address token1 = pool1.underlying();
        // Approve the max number for pools
        IERC20(token0).safeApprove(address(pool0), uint256(- 1));
        IERC20(token1).safeApprove(address(pool1), uint256(- 1));
        //Create Market
        uint32[] memory dexs = new uint32[](1);
        dexs[0] = dexData.toDexDetail();
        markets[marketId] = Types.Market(pool0, pool1, token0, token1, marginLimit, config.defaultFeesRate, config.priceDiffientRatio, address(0), 0, 0, dexs);
        // Init price oracle
        if (dexData.isUniV2Class()) {
            OpenLevV1Lib.updatePriceInternal(token0, token1, dexData);
        } else if (dex == DexData.DEX_UNIV3) {
            addressConfig.dexAggregator.updateV3Observation(token0, token1, dexData);
        }
    }

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

    function marginRatio(
        address owner,
        uint held,
        address heldToken,
        address sellToken,
        LPoolInterface borrowPool,
        bool isOpen,
        bytes memory dexData
    ) external view returns (uint, uint, uint, uint, uint){
        return marginRatioPrivate(owner, held, heldToken, sellToken, borrowPool, isOpen, dexData);
    }

    function marginRatioPrivate(
        address owner,
        uint held,
        address heldToken,
        address sellToken,
        LPoolInterface borrowPool,
        bool isOpen,
        bytes memory dexData
    ) private view returns (uint, uint, uint, uint, uint){
        Types.MarginRatioVars memory ratioVars;
        ratioVars.held = held;
        ratioVars.dexData = dexData;
        ratioVars.heldToken = heldToken;
        ratioVars.sellToken = sellToken;
        ratioVars.owner = owner;
        ratioVars.multiplier = 10000;

        (DexAggregatorInterface dexAggregator,,,) = OpenLevStorage(address(this)).addressConfig();
        (,,,,,,,,,uint16 twapDuration) = OpenLevStorage(address(this)).calculateConfig();

        uint borrowed = isOpen ? borrowPool.borrowBalanceStored(ratioVars.owner) : borrowPool.borrowBalanceCurrent(ratioVars.owner);
        if (borrowed == 0) {
            return (ratioVars.multiplier, ratioVars.multiplier, ratioVars.multiplier, ratioVars.multiplier, ratioVars.multiplier);
        }
        (ratioVars.price, ratioVars.cAvgPrice, ratioVars.hAvgPrice, ratioVars.decimals, ratioVars.lastUpdateTime) = dexAggregator.getPriceCAvgPriceHAvgPrice(ratioVars.heldToken, ratioVars.sellToken, twapDuration, ratioVars.dexData);
        //Ignore hAvgPrice
        if (block.timestamp > ratioVars.lastUpdateTime.add(twapDuration)) {
            ratioVars.hAvgPrice = ratioVars.cAvgPrice;
        }
        //marginRatio=(marketValue-borrowed)/borrowed
        uint marketValue = ratioVars.held.mul(ratioVars.price).div(10 ** uint(ratioVars.decimals));
        uint current = marketValue >= borrowed ? marketValue.sub(borrowed).mul(ratioVars.multiplier).div(borrowed) : 0;
        marketValue = ratioVars.held.mul(ratioVars.cAvgPrice).div(10 ** uint(ratioVars.decimals));
        uint cAvg = marketValue >= borrowed ? marketValue.sub(borrowed).mul(ratioVars.multiplier).div(borrowed) : 0;
        marketValue = ratioVars.held.mul(ratioVars.hAvgPrice).div(10 ** uint(ratioVars.decimals));
        uint hAvg = marketValue >= borrowed ? marketValue.sub(borrowed).mul(ratioVars.multiplier).div(borrowed) : 0;
        return (current, cAvg, hAvg, ratioVars.price, ratioVars.cAvgPrice);
    }

    function isPositionHealthy(
        address owner,
        bool isOpen,
        uint amount,
        Types.MarketVars memory vars,
        bytes memory dexData
    ) external view returns (bool){
        PricesVar memory prices;
        (prices.current, prices.cAvg, prices.hAvg, prices.price, prices.cAvgPrice) = marginRatioPrivate(owner,
            amount,
            isOpen ? address(vars.buyToken) : address(vars.sellToken),
            isOpen ? address(vars.sellToken) : address(vars.buyToken),
            isOpen ? vars.sellPool : vars.buyPool,
            isOpen,
            dexData
        );

        (,,,,,,,,uint8 maxLiquidationPriceDiffientRatio,) = OpenLevStorage(address(this)).calculateConfig();
        if (isOpen) {
            return prices.current >= vars.marginLimit && prices.cAvg >= vars.marginLimit && prices.hAvg >= vars.marginLimit;
        } else {
            // Avoid flash loan
            if (prices.price < prices.cAvgPrice) {
                uint differencePriceRatio = prices.cAvgPrice.mul(100).div(prices.price);
                require(differencePriceRatio - 100 < maxLiquidationPriceDiffientRatio, 'MPT');
            }
            return prices.current >= vars.marginLimit || prices.cAvg >= vars.marginLimit || prices.hAvg >= vars.marginLimit;
        }
    }

    function moveInsurance(uint8 poolIndex, address to, uint amount, Types.Market storage market) external {
        if (poolIndex == 0) {
            market.pool0Insurance = market.pool0Insurance.sub(amount);
            (IERC20(market.token0)).safeTransfer(to, amount);
            return;
        }
        market.pool1Insurance = market.pool1Insurance.sub(amount);
        (IERC20(market.token1)).safeTransfer(to, amount);
    }

    function updatePriceInternal(address token0, address token1, bytes memory dexData) internal returns (bool){
        (DexAggregatorInterface dexAggregator,,,) = OpenLevStorage(address(this)).addressConfig();
        (,,,,,,,,,uint16 twapDuration) = OpenLevStorage(address(this)).calculateConfig();
        return dexAggregator.updatePriceOracle(token0, token1, twapDuration, dexData);
    }

    function shouldUpdatePriceInternal(DexAggregatorInterface dexAggregator, uint16 twapDuration, uint16 priceDiffientRatio, address token0, address token1, bytes memory dexData) private view returns (bool){
        if (!dexData.isUniV2Class()) {
            return false;
        }
        (, uint cAvgPrice, uint hAvgPrice,, uint lastUpdateTime) = dexAggregator.getPriceCAvgPriceHAvgPrice(token0, token1, twapDuration, dexData);
        if (block.timestamp < lastUpdateTime.add(twapDuration)) {
            return false;
        }
        //Not initialized yet
        if (cAvgPrice == 0 || hAvgPrice == 0) {
            return true;
        }
        //price difference
        uint one = 100;
        uint differencePriceRatio = cAvgPrice.mul(one).div(hAvgPrice);
        if (differencePriceRatio >= (one.add(priceDiffientRatio)) || differencePriceRatio <= (one.sub(priceDiffientRatio))) {
            return true;
        }
        return false;
    }

    function updatePrice(uint16 marketId, Types.Market storage market, OpenLevStorage.AddressConfig storage addressConfig,
        OpenLevStorage.CalculateConfig storage calculateConfig, bytes memory dexData) external {
        bool shouldUpdate = shouldUpdatePriceInternal(addressConfig.dexAggregator, calculateConfig.twapDuration, market.priceDiffientRatio, market.token1, market.token0, dexData);
        bool updateResult = updatePriceInternal(market.token0, market.token1, dexData);
        if (updateResult) {
            //Discount
            market.priceUpdater = tx.origin;
            //Reward OLE
            if (shouldUpdate) {
                (ControllerInterface(addressConfig.controller)).updatePriceAllowed(marketId);
            }
        }
    }

    function reduceInsurance(
        uint totalRepayment,
        uint remaining,
        bool longToken,
        Types.Market storage market
    ) external returns (uint maxCanRepayAmount) {
        uint needed = totalRepayment.sub(remaining);
        maxCanRepayAmount = totalRepayment;
        if (longToken) {
            if (market.pool0Insurance >= needed) {
                market.pool0Insurance = market.pool0Insurance - needed;
            } else {
                maxCanRepayAmount = market.pool0Insurance.add(remaining);
                market.pool0Insurance = 0;
            }
        } else {
            if (market.pool1Insurance >= needed) {
                market.pool1Insurance = market.pool1Insurance - needed;
            } else {
                maxCanRepayAmount = market.pool1Insurance.add(remaining);
                market.pool1Insurance = 0;
            }
        }
    }


    function feesAndInsurance(Types.Market storage market, OpenLevStorage.CalculateConfig storage config, address xole, address trader, uint tradeSize, address token) external returns (uint) {
        uint balanceBefore = IERC20(token).balanceOf(address(this));
        uint defaultFees = tradeSize.mul(market.feesRate).div(10000);
        uint newFees = defaultFees;
        // if trader holds more xOLE, then should enjoy trading discount.
        if (XOLEInterface(xole).balanceOf(trader) > config.feesDiscountThreshold) {
            newFees = defaultFees.sub(defaultFees.mul(config.feesDiscount).div(100));
        }
        // if trader update price, then should enjoy trading discount.
        if (market.priceUpdater == trader) {
            newFees = newFees.sub(defaultFees.mul(config.updatePriceDiscount).div(100));
        }
        uint newInsurance = newFees.mul(config.insuranceRatio).div(100);

        IERC20(token).safeTransfer(xole, newFees.sub(newInsurance));
        if (token == market.token1) {
            market.pool1Insurance = market.pool1Insurance.add(newInsurance);
        } else {
            market.pool0Insurance = market.pool0Insurance.add(newInsurance);
        }
        return newFees;
    }

    function transferIn(address from, IERC20 token, address weth, uint amount) external returns (uint) {
        uint balanceBefore = token.balanceOf(address(this));
        if (address(token) == weth) {
            IWETH(weth).deposit{value : msg.value}();
        } else {
            token.safeTransferFrom(from, address(this), amount);
        }
        // Calculate the amount that was *actually* transferred
        uint balanceAfter = token.balanceOf(address(this));
        return balanceAfter.sub(balanceBefore);
    }

    function doTransferOut(address to, IERC20 token, address weth, uint amount) external {
        if (address(token) == weth) {
            IWETH(weth).withdraw(amount);
            payable(to).transfer(amount);
        } else {
            token.safeTransfer(to, amount);
        }
    }

    function isInSupportDex(uint32[] memory dexs, uint32 dex) internal pure returns (bool supported){
        for (uint i = 0; i < dexs.length; i++) {
            if (dexs[i] == 0) {
                break;
            }
            if (dexs[i] == dex) {
                supported = true;
                break;
            }
        }
    }

    function isSupportDex(mapping(uint8 => bool) storage _supportDexs, uint8 dex) internal view returns (bool){
        return _supportDexs[dex];
    }

}