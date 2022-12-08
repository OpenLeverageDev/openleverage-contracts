pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
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
        mapping(uint8 => bool) storage _supportDexs,
        mapping(uint16 => mapping(address => mapping(uint => uint24))) storage taxes
    ) external {
        require(marketId < 65535, "TMP");
        address token0 = pool0.underlying();
        address token1 = pool1.underlying();
        uint8 dex = dexData.toDex();
        require(_supportDexs[dex] && msg.sender == address(addressConfig.controller) && marginLimit >= config.defaultMarginLimit && marginLimit < 100000, "UDX");

        {
            uint24[] memory taxRates = dexData.toTransferFeeRates();
            require(taxRates[0] < 200000 && taxRates[1] < 200000 && taxRates[2] < 200000 && taxRates[3] < 200000 && taxRates[4] < 200000 && taxRates[5] < 200000, "WTR");
            taxes[marketId][token0][0] = taxRates[0];
            taxes[marketId][token1][0] = taxRates[1];
            taxes[marketId][token0][1] = taxRates[2];
            taxes[marketId][token1][1] = taxRates[3];
            taxes[marketId][token0][2] = taxRates[4];
            taxes[marketId][token1][2] = taxRates[5];
        }

        // Approve the max number for pools
        safeApprove(IERC20(token0), address(pool0), uint256(- 1));
        safeApprove(IERC20(token1), address(pool1), uint256(- 1));
        //Create Market
        uint32[] memory dexs = new uint32[](1);
        dexs[0] = dexData.toDexDetail();
        markets[marketId] = Types.Market(pool0, pool1, token0, token1, marginLimit, config.defaultFeesRate, config.priceDiffientRatio, address(0), 0, 0, dexs);
        // Init price oracle
        if (dexData.isUniV2Class()) {
            updatePriceInternal(token0, token1, dexData);
        } else if (dex == DexData.DEX_UNIV3) {
            addressConfig.dexAggregator.updateV3Observation(token0, token1, dexData);
        }
    }



    struct MarketWithoutDexs {// Market info
        LPoolInterface pool0;
        LPoolInterface pool1;
        address token0;
        address token1;
        uint16 marginLimit;
    }

    function marginRatio(
        uint16 marketId,
        address owner,
        bool longToken,
        bytes memory dexData
    ) external view returns (uint current, uint cAvg, uint hAvg, uint32 limit){
        address tokenToLong;
        MarketWithoutDexs  memory market;
        (market.pool0, market.pool1, market.token0, market.token1, market.marginLimit,,,,,) = (OpenLevStorage(address(this))).markets(marketId);
        tokenToLong = longToken ? market.token1 : market.token0;
        limit = market.marginLimit;
        (,uint amount,,) = OpenLevStorage(address(this)).activeTrades(owner, marketId, longToken);
        amount = shareToAmount(
            amount,
            OpenLevStorage(address(this)).totalHelds(tokenToLong),
            balanceOf(IERC20(tokenToLong))
        );

        (current, cAvg, hAvg,,) =
        marginRatioPrivate(
            owner,
            amount,
            tokenToLong,
            longToken ? market.token0 : market.token1,
            longToken ? market.pool0 : market.pool1,
            true,
            dexData
        );
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

    function updatePrice(address token0, address token1, bytes memory dexData) external returns (bool){
        return updatePriceInternal(token0, token1, dexData);
    }


    function updatePrice(Types.Market storage market, bytes memory dexData) external {
        bool updateResult = updatePriceInternal(market.token0, market.token1, dexData);
        if (updateResult) {
            //Discount
            market.priceUpdater = msg.sender;
        }
    }

    function flashSell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, bytes memory data, DexAggregatorInterface dexAggregator) external returns (uint buyAmount){
        if (sellAmount > 0) {
            safeApprove(IERC20(sellToken), address(dexAggregator), sellAmount);
            buyAmount = dexAggregator.sell(buyToken, sellToken, sellAmount, minBuyAmount, data);
        }
    }

    function flashBuy(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount, bytes memory data,
        DexAggregatorInterface dexAggregator,
        uint24 buyTax,
        uint24 sellTax) external returns (uint sellAmount){
        if (buyAmount > 0) {
            safeApprove(IERC20(sellToken), address(dexAggregator), maxSellAmount);
            sellAmount = dexAggregator.buy(buyToken, sellToken, buyTax, sellTax, buyAmount, maxSellAmount, data);
        }
    }

    function transferIn(address from, IERC20 token, address weth, uint amount) external returns (uint) {
        if (address(token) == weth) {
            IWETH(weth).deposit{value : msg.value}();
            return msg.value;
        } else {
            return token.safeTransferFrom(from, address(this), amount);
        }
    }

    function doTransferOut(address to, IERC20 token, address weth, uint amount) external {
        if (address(token) == weth) {
            IWETH(weth).withdraw(amount);
            (bool success,) = to.call{value : amount}("");
            require(success);
        } else {
            token.safeTransfer(to, amount);
        }
    }


    function feeAndInsurance(
        address trader,
        uint tradeSize,
        address token,
        address xOLE,
        uint totalHeld,
        uint reserve,
        Types.Market storage market,
        mapping(address => uint) storage totalHelds,
        OpenLevStorage.CalculateConfig storage calculateConfig
    ) external returns (uint newFees) {
        uint defaultFees = tradeSize.mul(market.feesRate).div(10000);
        newFees = defaultFees;
        // if trader update price, then should enjoy trading discount.
        if (market.priceUpdater == trader) {
            newFees = newFees.sub(defaultFees.mul(calculateConfig.updatePriceDiscount).div(100));
        }
        uint newInsurance = newFees.mul(calculateConfig.insuranceRatio).div(100);
        IERC20(token).safeTransfer(xOLE, newFees.sub(newInsurance));

        newInsurance = OpenLevV1Lib.amountToShare(newInsurance, totalHeld, reserve);
        if (token == market.token1) {
            market.pool1Insurance = market.pool1Insurance.add(newInsurance);
        } else {
            market.pool0Insurance = market.pool0Insurance.add(newInsurance);
        }

        totalHelds[token] = totalHelds[token].add(newInsurance);
        return newFees;
    }

    function reduceInsurance(
        uint totalRepayment,
        uint remaining,
        bool longToken,
        address token,
        uint reserve,
        Types.Market storage market,
        mapping(address => uint
        ) storage totalHelds) external returns (uint maxCanRepayAmount) {
        uint needed = totalRepayment.sub(remaining);
        needed = amountToShare(needed, totalHelds[token], reserve);
        maxCanRepayAmount = totalRepayment;
        if (longToken) {
            if (market.pool0Insurance >= needed) {
                market.pool0Insurance = market.pool0Insurance - needed;
                totalHelds[token] = totalHelds[token].sub(needed);
            } else {
                maxCanRepayAmount = shareToAmount(market.pool0Insurance, totalHelds[token], reserve);
                maxCanRepayAmount = maxCanRepayAmount.add(remaining);
                totalHelds[token] = totalHelds[token].sub(market.pool0Insurance);
                market.pool0Insurance = 0;
            }
        } else {
            if (market.pool1Insurance >= needed) {
                market.pool1Insurance = market.pool1Insurance - needed;
                totalHelds[token] = totalHelds[token].sub(needed);
            } else {
                maxCanRepayAmount = shareToAmount(market.pool1Insurance, totalHelds[token], reserve);
                maxCanRepayAmount = maxCanRepayAmount.add(remaining);
                totalHelds[token] = totalHelds[token].sub(market.pool1Insurance);
                market.pool1Insurance = 0;
            }
        }
    }

    function moveInsurance(Types.Market storage market, uint8 poolIndex, address to, uint amount, mapping(address => uint) storage totalHelds) external {
        address token = poolIndex == 0 ? market.token0 : market.token1;
        if (poolIndex == 0) {
            market.pool0Insurance = market.pool0Insurance.sub(amount);
        } else {
            market.pool1Insurance = market.pool1Insurance.sub(amount);
        }
        uint256 totalHeld = totalHelds[token];
        totalHelds[token] = totalHeld.sub(amount);
        (IERC20(token)).safeTransfer(to, shareToAmount(amount, totalHeld, balanceOf(IERC20(token))));
    }


    function verifyTrade(Types.MarketVars memory vars, bool longToken, bool depositToken, uint deposit, uint borrow,
        bytes memory dexData, OpenLevStorage.AddressConfig storage addressConfig, Types.Trade storage trade, bool convertWeth) external view {
        //verify if deposit token allowed
        address depositTokenAddr = depositToken == longToken ? address(vars.buyToken) : address(vars.sellToken);

        //verify minimal deposit > absolute value 0.0001
        uint decimals = ERC20(depositTokenAddr).decimals();
        uint minimalDeposit = decimals > 4 ? 10 ** (decimals - 4) : 1;
        uint actualDeposit = depositTokenAddr == addressConfig.wETH && convertWeth ? msg.value : deposit;
        require(actualDeposit > minimalDeposit, "DTS");
        require(isInSupportDex(vars.dexs, dexData.toDexDetail()), "DNS");

        // New trade
        if (trade.lastBlockNum == 0) {
            require(borrow > 0, "BB0");
            return;
        } else {
            // For new trade, these checks are not needed
            require(depositToken == trade.depositToken && trade.lastBlockNum != uint128(block.number), " DTS");
        }
    }

    function setCalculateConfig(
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

    function setMarketConfig(
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

        uint borrowed = isOpen ? borrowStored(borrowPool, ratioVars.owner) : borrowCurrent(borrowPool, ratioVars.owner);
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


    function borrowCurrent(LPoolInterface pool, address trader) internal view returns (uint256) {
        return pool.borrowBalanceCurrent(trader);
    }

    function borrowStored(LPoolInterface pool, address trader) internal view returns (uint256) {
        return pool.borrowBalanceStored(trader);
    }

    function repay(LPoolInterface pool, address trader, uint amount) internal {
        pool.repayBorrowBehalf(trader, amount);
    }


    function balanceOf(IERC20 token) internal view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function safeApprove(IERC20 token, address spender, uint256 amount) internal {
        token.safeApprove(spender, amount);
    }

    function amountToShare(uint amount, uint totalShare, uint reserve) internal pure returns (uint share){
        share = totalShare > 0 && reserve > 0 ? totalShare.mul(amount) / reserve : amount;
    }

    function shareToAmount(uint share, uint totalShare, uint reserve) internal pure returns (uint amount){
        if (totalShare > 0 && reserve > 0) {
            amount = reserve.mul(share) / totalShare;
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

    function updatePriceInternal(address token0, address token1, bytes memory dexData) internal returns (bool){
        (DexAggregatorInterface dexAggregator,,,) = OpenLevStorage(address(this)).addressConfig();
        (,,,,,,,,,uint16 twapDuration) = OpenLevStorage(address(this)).calculateConfig();
        return dexAggregator.updatePriceOracle(token0, token1, twapDuration, dexData);
    }

    function toMarketVar(bool longToken, bool open, Types.Market storage market) internal view returns (Types.MarketVars memory) {
        uint token0Bal = balanceOf(IERC20(market.token0));
        uint token1Bal = balanceOf(IERC20(market.token1));

        return open == longToken ?
        Types.MarketVars(
            market.pool1,
            market.pool0,
            IERC20(market.token1),
            IERC20(market.token0),
            token1Bal,
            token0Bal,
            market.pool1Insurance,
            market.pool0Insurance,
            market.marginLimit,
            market.priceDiffientRatio,
            market.dexs) :
        Types.MarketVars(
            market.pool0,
            market.pool1,
            IERC20(market.token0),
            IERC20(market.token1),
            token0Bal,
            token1Bal,
            market.pool0Insurance,
            market.pool1Insurance,
            market.marginLimit,
            market.priceDiffientRatio,
            market.dexs);
    }
}