// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OpenLevInterface.sol";
import "./Types.sol";
import "./Adminable.sol";
import "./DelegateInterface.sol";
import "./lib/DexData.sol";
import "./ControllerInterface.sol";
import "./IWETH.sol";
import "./XOLEInterface.sol";
import "./Types.sol";

/**
  * @title OpenLevV1
  * @author OpenLeverage
  */
contract OpenLevV1 is DelegateInterface, OpenLevInterface, OpenLevStorage, Adminable, ReentrancyGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using DexData for bytes;

    constructor ()
    {
    }

    function initialize(
        address _controller,
        DexAggregatorInterface _dexAggregator,
        address[] memory depositTokens,
        address _wETH,
        address _xOLE
    ) public {
        require(msg.sender == admin, "NAD");
        addressConfig.controller = _controller;
        addressConfig.dexAggregator = _dexAggregator;
        addressConfig.wETH = _wETH;
        addressConfig.xOLE = _xOLE;
        setAllowedDepositTokensInternal(depositTokens, true);
        setCalculateConfigInternal(30, 33, 3000, 5, 25, 25, 30e18, 300, 10, 60);
    }

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint16 marginLimit,
        bytes memory dexData
    ) external override returns (uint16) {
        uint8 dex = dexData.toDex();
        CalculateConfig memory config = calculateConfig;
        require(isSupportDex(dex), "UDX");
        require(msg.sender == address(addressConfig.controller), "NCN");
        require(marginLimit >= config.defaultMarginLimit, "LLR");
        require(marginLimit < 100000, "LIH");
        address token0 = pool0.underlying();
        address token1 = pool1.underlying();
        // Approve the max number for pools
        IERC20(token0).approve(address(pool0), uint256(- 1));
        IERC20(token1).approve(address(pool1), uint256(- 1));
        //Create Market
        uint16 marketId = numPairs;
        uint32[] memory dexs = new uint32[](1);
        dexs[0] = dexData.toDexDetail();
        markets[marketId] = Types.Market(pool0, pool1, token0, token1, marginLimit, config.defaultFeesRate, config.priceDiffientRatio, address(0), 0, 0, dexs);
        numPairs ++;
        // Init price oracle
        if (dexData.isUniV2Class()) {
            updatePriceInternal(marketId, token0, token1, dexData, false);
        } else if (dex == DexData.DEX_UNIV3) {
            addressConfig.dexAggregator.updateV3Observation(token0, token1, dexData);
        }
        return marketId;
    }

    function marginTrade(
        uint16 marketId,
        bool longToken,
        bool depositToken,
        uint deposit,
        uint borrow,
        uint minBuyAmount,
        bytes memory dexData
    ) external payable override nonReentrant onlySupportDex(dexData) {
        // Check if the market is enabled for trading
        Types.MarketVars memory vars = toMarketVar(marketId, longToken, true);
        verifyTrade(vars, marketId, longToken, depositToken, deposit, borrow, dexData);
        (ControllerInterface(addressConfig.controller)).marginTradeAllowed(marketId);
        Types.TradeVars memory tv;
        tv.dexDetail = dexData.toDexDetail();
        // if deposit token is NOT the same as the long token
        if (depositToken != longToken) {
            tv.depositErc20 = vars.sellToken;
            deposit = transferIn(msg.sender, tv.depositErc20, deposit);
            tv.fees = feesAndInsurance(msg.sender, deposit.add(borrow), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = tv.depositAfterFees.add(borrow);
            require(borrow == 0 || deposit.mul(10000).div(borrow) > vars.marginLimit, "MAM");
        } else {
            if (borrow > 0) {
                (uint currentPrice, uint8 priceDecimals) = addressConfig.dexAggregator.getPrice(address(vars.sellToken), address(vars.buyToken), dexData);
                tv.borrowValue = borrow.mul(currentPrice).div(10 ** uint(priceDecimals));
            }
            tv.depositErc20 = vars.buyToken;
            deposit = transferIn(msg.sender, tv.depositErc20, deposit);
            tv.fees = feesAndInsurance(msg.sender, deposit.add(tv.borrowValue), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = borrow;
            require(borrow == 0 || deposit.mul(10000).div(tv.borrowValue) > vars.marginLimit, "MAM");
        }

        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        trade.lastBlockNum = uint128(block.number);
        trade.depositToken = depositToken;
        // Borrow
        if (borrow > 0) {
            vars.sellPool.borrowBehalf(msg.sender, borrow);
        }
        // Trade in exchange
        if (tv.tradeSize > 0) {
            tv.newHeld = flashSell(address(vars.buyToken), address(vars.sellToken), tv.tradeSize, minBuyAmount, dexData);
            tv.token0Price = longToken ? tv.newHeld.mul(1e18).div(tv.tradeSize) : tv.tradeSize.mul(1e18).div(tv.newHeld);
        }

        if (depositToken == longToken) {
            tv.newHeld = tv.newHeld.add(tv.depositAfterFees);
        }
        trade.deposited = trade.deposited.add(tv.depositAfterFees);
        trade.held = trade.held.add(tv.newHeld);
        //verify
        verifyOpenAfter(marketId, trade.held, vars, dexData);
        emit MarginTrade(msg.sender, marketId, longToken, depositToken, deposit, borrow, tv.newHeld, tv.fees, tv.token0Price, tv.dexDetail);
    }

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minOrMaxAmount, bytes memory dexData) external override nonReentrant onlySupportDex(dexData) {
        //verify
        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        Types.MarketVars memory marketVars = toMarketVar(marketId, longToken, false);
        //verify
        verifyCloseBefore(trade, marketVars, closeAmount, dexData);
        trade.lastBlockNum = uint128(block.number);
        Types.CloseTradeVars memory closeTradeVars;
        closeTradeVars.marketId = marketId;
        closeTradeVars.longToken = longToken;
        closeTradeVars.depositToken = trade.depositToken;
        closeTradeVars.closeRatio = closeAmount.mul(1e18).div(trade.held);
        closeTradeVars.isPartialClose = closeAmount != trade.held ? true : false;
        closeTradeVars.fees = feesAndInsurance(msg.sender, closeAmount, address(marketVars.sellToken), closeTradeVars.marketId);
        closeTradeVars.closeAmountAfterFees = closeAmount.sub(closeTradeVars.fees);
        closeTradeVars.repayAmount = marketVars.buyPool.borrowBalanceCurrent(msg.sender);
        closeTradeVars.dexDetail = dexData.toDexDetail();
        //partial close
        if (closeTradeVars.isPartialClose) {
            closeTradeVars.repayAmount = closeTradeVars.repayAmount.mul(closeTradeVars.closeRatio).div(1e18);
            trade.held = trade.held.sub(closeAmount);
            closeTradeVars.depositDecrease = trade.deposited.mul(closeTradeVars.closeRatio).div(1e18);
            trade.deposited = trade.deposited.sub(closeTradeVars.depositDecrease);
        } else {
            closeTradeVars.depositDecrease = trade.deposited;
        }
        if (closeTradeVars.depositToken != closeTradeVars.longToken) {
            closeTradeVars.receiveAmount = flashSell(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.closeAmountAfterFees, minOrMaxAmount, dexData);
            require(closeTradeVars.receiveAmount >= closeTradeVars.repayAmount, 'LON');
            closeTradeVars.sellAmount = closeTradeVars.closeAmountAfterFees;
            marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
            closeTradeVars.depositReturn = closeTradeVars.receiveAmount.sub(closeTradeVars.repayAmount);
            doTransferOut(msg.sender, marketVars.buyToken, closeTradeVars.depositReturn);
        } else {
            closeTradeVars.sellAmount = flashBuy(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.repayAmount, closeTradeVars.closeAmountAfterFees, dexData);
            require(minOrMaxAmount >= closeTradeVars.sellAmount, 'BLM');
            closeTradeVars.receiveAmount = closeTradeVars.repayAmount;
            marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
            closeTradeVars.depositReturn = closeTradeVars.closeAmountAfterFees.sub(closeTradeVars.sellAmount);
            doTransferOut(msg.sender, marketVars.sellToken, closeTradeVars.depositReturn);
        }
        if (!closeTradeVars.isPartialClose) {
            delete activeTrades[msg.sender][closeTradeVars.marketId][closeTradeVars.longToken];
        }
        closeTradeVars.token0Price = longToken ? closeTradeVars.sellAmount.mul(1e18).div(closeTradeVars.receiveAmount) : closeTradeVars.receiveAmount.mul(1e18).div(closeTradeVars.sellAmount);
        //verify
        verifyCloseAfter(marketId, address(marketVars.buyToken), address(marketVars.sellToken), dexData);
        emit TradeClosed(msg.sender, closeTradeVars.marketId, closeTradeVars.longToken, closeTradeVars.depositToken, closeAmount, closeTradeVars.depositDecrease, closeTradeVars.depositReturn, closeTradeVars.fees,
            closeTradeVars.token0Price, closeTradeVars.dexDetail);
    }


    function liquidate(address owner, uint16 marketId, bool longToken, uint minOrMaxAmount, bytes memory dexData) external override nonReentrant onlySupportDex(dexData) {
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        Types.MarketVars memory marketVars = toMarketVar(marketId, longToken, false);
        //verify
        verifyCloseOrLiquidateBefore(trade.held, trade.lastBlockNum, marketVars.dexs, dexData.toDexDetail());
        //controller
        (ControllerInterface(addressConfig.controller)).liquidateAllowed(marketId, msg.sender, trade.held, dexData);
        require(!isPositionHealthy(owner, false, trade.held, marketVars, dexData), "PIH");
        Types.LiquidateVars memory liquidateVars;
        liquidateVars.dexDetail = dexData.toDexDetail();
        liquidateVars.marketId = marketId;
        liquidateVars.longToken = longToken;
        liquidateVars.fees = feesAndInsurance(owner, trade.held, address(marketVars.sellToken), liquidateVars.marketId);
        liquidateVars.borrowed = marketVars.buyPool.borrowBalanceCurrent(owner);
        liquidateVars.isSellAllHeld = true;
        liquidateVars.depositDecrease = trade.deposited;
        //penalty
        liquidateVars.penalty = trade.held.mul(calculateConfig.penaltyRatio).div(10000);
        if (liquidateVars.penalty > 0) {
            doTransferOut(msg.sender, marketVars.sellToken, liquidateVars.penalty);
        }
        liquidateVars.remainHeldAfterFees = trade.held.sub(liquidateVars.fees).sub(liquidateVars.penalty);
        // Check need to sell all held,base on longToken=depositToken
        if (longToken == trade.depositToken) {
            // uniV3 can't cal buy amount on chain,so get from dexdata
            if (dexData.toDex() == DexData.DEX_UNIV3) {
                liquidateVars.isSellAllHeld = dexData.toUniV3QuoteFlag();
            } else {
                liquidateVars.isSellAllHeld = calBuyAmount(address(marketVars.buyToken), address(marketVars.sellToken), liquidateVars.remainHeldAfterFees, dexData) > liquidateVars.borrowed ? false : true;
            }
        }
        // need't to sell all held
        if (!liquidateVars.isSellAllHeld) {
            liquidateVars.sellAmount = flashBuy(address(marketVars.buyToken), address(marketVars.sellToken), liquidateVars.borrowed, liquidateVars.remainHeldAfterFees, dexData);
            require(minOrMaxAmount >= liquidateVars.sellAmount, 'BLM');
            liquidateVars.receiveAmount = liquidateVars.borrowed;
            marketVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
            liquidateVars.depositReturn = liquidateVars.remainHeldAfterFees.sub(liquidateVars.sellAmount);
            doTransferOut(owner, marketVars.sellToken, liquidateVars.depositReturn);
        } else {
            liquidateVars.sellAmount = liquidateVars.remainHeldAfterFees;
            liquidateVars.receiveAmount = flashSell(address(marketVars.buyToken), address(marketVars.sellToken), liquidateVars.sellAmount, minOrMaxAmount, dexData);
            // can repay
            if (liquidateVars.receiveAmount > liquidateVars.borrowed) {
                marketVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
                // buy back depositToken
                if (longToken == trade.depositToken) {
                    liquidateVars.depositReturn = flashSell(address(marketVars.sellToken), address(marketVars.buyToken), liquidateVars.receiveAmount - liquidateVars.borrowed, 0, dexData);
                    doTransferOut(owner, marketVars.sellToken, liquidateVars.depositReturn);
                } else {
                    liquidateVars.depositReturn = liquidateVars.receiveAmount - liquidateVars.borrowed;
                    doTransferOut(owner, marketVars.buyToken, liquidateVars.depositReturn);
                }
            } else {
                uint finalRepayAmount = reduceInsurance(liquidateVars.borrowed, liquidateVars.receiveAmount, liquidateVars.marketId, liquidateVars.longToken);
                liquidateVars.outstandingAmount = liquidateVars.borrowed.sub(finalRepayAmount);
                marketVars.buyPool.repayBorrowEndByOpenLev(owner, finalRepayAmount);
            }
        }
        liquidateVars.token0Price = longToken ? liquidateVars.sellAmount.mul(1e18).div(liquidateVars.receiveAmount) : liquidateVars.receiveAmount.mul(1e18).div(liquidateVars.sellAmount);

        //verify
        verifyLiquidateAfter(marketId, address(marketVars.buyToken), address(marketVars.sellToken), dexData);

        emit Liquidation(owner, liquidateVars.marketId, longToken, trade.depositToken, trade.held, liquidateVars.outstandingAmount, msg.sender,
            liquidateVars.depositDecrease, liquidateVars.depositReturn, liquidateVars.fees, liquidateVars.token0Price, liquidateVars.penalty, liquidateVars.dexDetail);
        delete activeTrades[owner][marketId][longToken];
    }

    function marginRatio(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override onlySupportDex(dexData) view returns (uint current, uint cAvg, uint hAvg, uint32 limit) {
        Types.MarketVars memory vars = toMarketVar(marketId, longToken, false);
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        Types.MarginRatioVars memory ratioVars;
        ratioVars.held = trade.held;
        ratioVars.dexData = dexData;
        ratioVars.owner = owner;
        limit = vars.marginLimit;
        (current, cAvg, hAvg,,) = marginRatioInternal(ratioVars.owner, ratioVars.held, address(vars.sellToken), address(vars.buyToken), vars.buyPool, false, ratioVars.dexData);
    }

    function marginRatioInternal(address owner, uint held, address heldToken, address sellToken, LPoolInterface borrowPool, bool isOpen, bytes memory dexData)
    internal view returns (uint, uint, uint, uint, uint)
    {
        Types.MarginRatioVars memory ratioVars;
        ratioVars.held = held;
        ratioVars.dexData = dexData;
        ratioVars.heldToken = heldToken;
        ratioVars.sellToken = sellToken;
        ratioVars.owner = owner;
        ratioVars.multiplier = 10000;
        uint borrowed = isOpen ? borrowPool.borrowBalanceStored(ratioVars.owner) : borrowPool.borrowBalanceCurrent(ratioVars.owner);
        if (borrowed == 0) {
            return (ratioVars.multiplier, ratioVars.multiplier, ratioVars.multiplier, ratioVars.multiplier, ratioVars.multiplier);
        }
        (uint price, uint cAvgPrice, uint hAvgPrice, uint8 decimals,uint lastUpdateTime) = addressConfig.dexAggregator.getPriceCAvgPriceHAvgPrice(ratioVars.heldToken, ratioVars.sellToken, calculateConfig.twapDuration, ratioVars.dexData);
        //Ignore hAvgPrice
        if (block.timestamp > lastUpdateTime.add(calculateConfig.twapDuration)) {
            hAvgPrice = cAvgPrice;
        }
        //marginRatio=(marketValue-borrowed)/borrowed
        uint marketValue = ratioVars.held.mul(price).div(10 ** uint(decimals));
        uint current = marketValue >= borrowed ? marketValue.sub(borrowed).mul(ratioVars.multiplier).div(borrowed) : 0;
        marketValue = ratioVars.held.mul(cAvgPrice).div(10 ** uint(decimals));
        uint cAvg = marketValue >= borrowed ? marketValue.sub(borrowed).mul(ratioVars.multiplier).div(borrowed) : 0;
        marketValue = ratioVars.held.mul(hAvgPrice).div(10 ** uint(decimals));
        uint hAvg = marketValue >= borrowed ? marketValue.sub(borrowed).mul(ratioVars.multiplier).div(borrowed) : 0;
        return (current, cAvg, hAvg, price, cAvgPrice);
    }

    function updatePrice(uint16 marketId, bool rewards, bytes memory dexData) external override {
        Types.Market memory market = markets[marketId];
        require(!rewards || shouldUpdatePriceInternal(market.priceDiffientRatio, market.token1, market.token0, dexData), "NUP");
        updatePriceInternal(marketId, market.token0, market.token1, dexData, rewards);
    }

    function shouldUpdatePrice(uint16 marketId, bytes memory dexData) external override view returns (bool){
        Types.Market memory market = markets[marketId];
        return shouldUpdatePriceInternal(market.priceDiffientRatio, market.token1, market.token0, dexData);
    }

    function getMarketSupportDexs(uint16 marketId) external override view returns (uint32[] memory){
        return markets[marketId].dexs;
    }

    function getCalculateConfig() external override view returns (OpenLevStorage.CalculateConfig memory){
        return calculateConfig;
    }

    function updatePriceInternal(uint16 marketId, address token0, address token1, bytes memory dexData, bool rewards) internal {
        bool updateResult = addressConfig.dexAggregator.updatePriceOracle(token0, token1, calculateConfig.twapDuration, dexData);
        if (rewards && updateResult) {
            markets[marketId].priceUpdater = tx.origin;
            (ControllerInterface(addressConfig.controller)).updatePriceAllowed(marketId);
        }
    }

    function shouldUpdatePriceInternal(uint16 priceDiffientRatio, address token0, address token1, bytes memory dexData) internal view returns (bool){
        if (!dexData.isUniV2Class()) {
            return false;
        }
        (, uint cAvgPrice, uint hAvgPrice,,uint lastUpdateTime) = addressConfig.dexAggregator.getPriceCAvgPriceHAvgPrice(token0, token1, calculateConfig.twapDuration, dexData);
        if (block.timestamp < lastUpdateTime.add(calculateConfig.twapDuration)) {
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

    function isPositionHealthy(address owner, bool isOpen, uint held, Types.MarketVars memory vars, bytes memory dexData) internal view returns (bool)
    {
        (uint current, uint cAvg,uint hAvg,uint price,uint cAvgPrice) = marginRatioInternal(owner,
            held,
            isOpen ? address(vars.buyToken) : address(vars.sellToken),
            isOpen ? address(vars.sellToken) : address(vars.buyToken),
            isOpen ? vars.sellPool : vars.buyPool,
            isOpen, dexData);
        if (isOpen) {
            return current >= vars.marginLimit && cAvg >= vars.marginLimit && hAvg >= vars.marginLimit;
        } else {
            // Avoid flash loan
            if (price < cAvgPrice) {
                uint differencePriceRatio = cAvgPrice.mul(100).div(price);
                require(differencePriceRatio - 100 < calculateConfig.maxLiquidationPriceDiffientRatio, 'MPT');
            }
            return current >= vars.marginLimit || cAvg >= vars.marginLimit || hAvg >= vars.marginLimit;
        }
    }

    function reduceInsurance(uint totalRepayment, uint remaining, uint16 marketId, bool longToken) internal returns (uint) {
        uint maxCanRepayAmount = totalRepayment;
        Types.Market storage market = markets[marketId];
        uint needed = totalRepayment.sub(remaining);
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
        return maxCanRepayAmount;
    }

    function toMarketVar(uint16 marketId, bool longToken, bool open) internal view returns (Types.MarketVars memory) {
        Types.MarketVars memory vars;
        Types.Market memory market = markets[marketId];
        if (open == longToken) {
            vars.buyPool = market.pool1;
            vars.buyToken = IERC20(market.token1);
            vars.buyPoolInsurance = market.pool1Insurance;
            vars.sellPool = market.pool0;
            vars.sellToken = IERC20(market.token0);
            vars.sellPoolInsurance = market.pool0Insurance;
        } else {
            vars.buyPool = market.pool0;
            vars.buyToken = IERC20(market.token0);
            vars.buyPoolInsurance = market.pool0Insurance;
            vars.sellPool = market.pool1;
            vars.sellToken = IERC20(market.token1);
            vars.sellPoolInsurance = market.pool1Insurance;
        }
        vars.marginLimit = market.marginLimit;
        vars.dexs = market.dexs;
        vars.priceDiffientRatio = market.priceDiffientRatio;
        return vars;
    }


    function feesAndInsurance(address trader, uint tradeSize, address token, uint16 marketId) internal returns (uint) {
        Types.Market storage market = markets[marketId];
        uint defaultFees = tradeSize.mul(market.feesRate).div(10000);
        uint newFees = defaultFees;
        CalculateConfig memory config = calculateConfig;
        // if trader holds more xOLE, then should enjoy trading discount.
        if (XOLEInterface(addressConfig.xOLE).balanceOf(trader, 0) > config.feesDiscountThreshold) {
            newFees = defaultFees.sub(defaultFees.mul(config.feesDiscount).div(100));
        }
        // if trader update price, then should enjoy trading discount.
        if (market.priceUpdater == trader) {
            newFees = newFees.sub(defaultFees.mul(config.updatePriceDiscount).div(100));
        }
        uint newInsurance = newFees.mul(config.insuranceRatio).div(100);

        IERC20(token).transfer(addressConfig.xOLE, newFees.sub(newInsurance));
        if (token == market.token1) {
            market.pool1Insurance = market.pool1Insurance.add(newInsurance);
        } else {
            market.pool0Insurance = market.pool0Insurance.add(newInsurance);
        }
        return newFees;
    }

    function flashSell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, bytes memory data) internal returns (uint){
        DexAggregatorInterface dexAggregator = addressConfig.dexAggregator;
        IERC20(sellToken).approve(address(dexAggregator), sellAmount);
        uint buyAmount = dexAggregator.sell(buyToken, sellToken, sellAmount, minBuyAmount, data);
        return buyAmount;
    }

    function flashBuy(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount, bytes memory data) internal returns (uint){
        DexAggregatorInterface dexAggregator = addressConfig.dexAggregator;
        IERC20(sellToken).approve(address(dexAggregator), maxSellAmount);
        return dexAggregator.buy(buyToken, sellToken, buyAmount, maxSellAmount, data);
    }

    function calBuyAmount(address buyToken, address sellToken, uint sellAmount, bytes memory data) internal view returns (uint){
        return addressConfig.dexAggregator.calBuyAmount(buyToken, sellToken, sellAmount, data);
    }

    function transferIn(address from, IERC20 token, uint amount) internal returns (uint) {
        uint balanceBefore = token.balanceOf(address(this));
        if (address(token) == addressConfig.wETH) {
            IWETH(address(token)).deposit{value : msg.value}();
        } else {
            token.safeTransferFrom(from, address(this), amount);
        }
        // Calculate the amount that was *actually* transferred
        uint balanceAfter = token.balanceOf(address(this));
        return balanceAfter.sub(balanceBefore);
    }

    function doTransferOut(address to, IERC20 token, uint amount) internal {
        if (address(token) == addressConfig.wETH) {
            IWETH(address(token)).withdraw(amount);
            payable(to).transfer(amount);
        } else {
            token.safeTransfer(to, amount);
        }
    }
    /*** Admin Functions ***/
    function setCalculateConfigInternal(uint16 defaultFeesRate,
        uint8 insuranceRatio,
        uint16 defaultMarginLimit,
        uint16 priceDiffientRatio,
        uint16 updatePriceDiscount,
        uint16 feesDiscount,
        uint128 feesDiscountThreshold,
        uint16 penaltyRatio,
        uint8 maxLiquidationPriceDiffientRatio,
        uint16 twapDuration) internal {
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
        emit NewCalculateConfig(defaultFeesRate, insuranceRatio, defaultMarginLimit, priceDiffientRatio, updatePriceDiscount,
            feesDiscount, feesDiscountThreshold, penaltyRatio, maxLiquidationPriceDiffientRatio, twapDuration);
    }

    function setCalculateConfig(uint16 defaultFeesRate,
        uint8 insuranceRatio,
        uint16 defaultMarginLimit,
        uint16 priceDiffientRatio,
        uint16 updatePriceDiscount,
        uint16 feesDiscount,
        uint128 feesDiscountThreshold,
        uint16 penaltyRatio,
        uint8 maxLiquidationPriceDiffientRatio,
        uint16 twapDuration) external override onlyAdmin() {
        setCalculateConfigInternal(defaultFeesRate, insuranceRatio, defaultMarginLimit, priceDiffientRatio, updatePriceDiscount,
            feesDiscount, feesDiscountThreshold, penaltyRatio, maxLiquidationPriceDiffientRatio, twapDuration);
    }


    function setAddressConfig(address controller,
        DexAggregatorInterface dexAggregator) external override {
        require(controller != address(0) && address(dexAggregator) != address(0), 'CD0');
        addressConfig.controller = controller;
        addressConfig.dexAggregator = dexAggregator;
        emit NewAddressConfig(controller, address(dexAggregator));
    }

    function setMarketConfig(uint16 marketId, uint16 feesRate, uint16 marginLimit, uint16 priceDiffientRatio, uint32[] memory dexs) external override onlyAdmin() {
        require(feesRate < 10000 && marginLimit > 0 && dexs.length > 0, 'PRI');
        Types.Market storage market = markets[marketId];
        market.feesRate = feesRate;
        market.marginLimit = marginLimit;
        market.dexs = dexs;
        market.priceDiffientRatio = priceDiffientRatio;
        emit NewMarketConfig(marketId, feesRate, marginLimit, priceDiffientRatio, dexs);
    }

    function moveInsurance(uint16 marketId, uint8 poolIndex, address to, uint amount) external override nonReentrant() onlyAdmin() {
        Types.Market storage market = markets[marketId];
        if (poolIndex == 0) {
            market.pool0Insurance = market.pool0Insurance.sub(amount);
            (IERC20(market.token0)).safeTransfer(to, amount);
            return;
        }
        market.pool1Insurance = market.pool1Insurance.sub(amount);
        (IERC20(market.token1)).safeTransfer(to, amount);
    }

    function setAllowedDepositTokens(address[] memory tokens, bool allowed) external override onlyAdmin() {
        setAllowedDepositTokensInternal(tokens, allowed);
    }

    function setAllowedDepositTokensInternal(address[] memory tokens, bool allowed) internal {
        for (uint i = 0; i < tokens.length; i++) {
            allowedDepositTokens[tokens[i]] = allowed;
        }
        emit ChangeAllowedDepositTokens(tokens, allowed);
    }


    function verifyTrade(Types.MarketVars memory vars, uint16 marketId, bool longToken, bool depositToken, uint deposit, uint borrow, bytes memory dexData) internal view {
        //verify if deposit token allowed
        address depositTokenAddr = depositToken == longToken ? address(vars.buyToken) : address(vars.sellToken);
        require(allowedDepositTokens[depositTokenAddr], "UDT");

        //verify minimal deposit > absolute value 0.0001
        uint minimalDeposit = 10 ** (ERC20(depositTokenAddr).decimals() - 4);
        uint actualDeposit = depositTokenAddr == addressConfig.wETH ? msg.value : deposit;
        require(actualDeposit > minimalDeposit, "DTS");

        Types.Trade memory trade = activeTrades[msg.sender][marketId][longToken];
        // New trade
        if (trade.lastBlockNum == 0) {
            require(borrow > 0, "BB0");
            return;
        } else {
            // For new trade, these checks are not needed
            require(depositToken == trade.depositToken, "DTS");
            require(trade.lastBlockNum != uint128(block.number), "SBK");
            require(isInSupportDex(vars.dexs, dexData.toDexDetail()), "DNS");
        }
    }

    function verifyOpenAfter(uint16 marketId, uint held, Types.MarketVars memory vars, bytes memory dexData) internal {
        require(isPositionHealthy(msg.sender, true, held, vars, dexData), "PNH");
        if (dexData.isUniV2Class()) {
            updatePriceInternal(marketId, address(vars.buyToken), address(vars.sellToken), dexData, false);
        }
    }

    function verifyCloseBefore(Types.Trade memory trade, Types.MarketVars memory vars, uint closeAmount, bytes memory dexData) internal view {
        verifyCloseOrLiquidateBefore(trade.held, trade.lastBlockNum, vars.dexs, dexData.toDexDetail());
        require(closeAmount <= trade.held, "CBH");
    }

    function verifyCloseAfter(uint16 marketId, address token0, address token1, bytes memory dexData) internal {
        if (dexData.isUniV2Class()) {
            updatePriceInternal(marketId, token0, token1, dexData, false);
        }
    }

    function verifyCloseOrLiquidateBefore(uint held, uint lastBlockNumber, uint32[] memory dexs, uint32 dex) internal view {
        require(held != 0, "HI0");
        require(lastBlockNumber != block.number, "SBK");
        require(isInSupportDex(dexs, dex), "DNS");
    }

    function verifyLiquidateAfter(uint16 marketId, address token0, address token1, bytes memory dexData) internal {
        if (dexData.isUniV2Class()) {
            updatePriceInternal(marketId, token0, token1, dexData, false);
        }
    }

    function isSupportDex(uint8 dex) internal pure returns (bool){
        return dex == DexData.DEX_UNIV3 || dex == DexData.DEX_UNIV2;
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
    modifier onlySupportDex(bytes memory dexData) {
        require(isSupportDex(dexData.toDex()), "UDX");
        _;
    }
}

