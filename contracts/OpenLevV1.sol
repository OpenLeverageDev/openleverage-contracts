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
import "./XOLE.sol";

/**
  * @title OpenLevV1
  * @author OpenLeverage
  */
contract OpenLevV1 is DelegateInterface, OpenLevInterface, OpenLevStorage, Adminable, ReentrancyGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using DexData for bytes;

    uint32 private constant twapDuration = 25;//25s

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
        require(msg.sender == admin, "Not admin");
        controller = _controller;
        dexAggregator = _dexAggregator;
        setAllowedDepositTokensInternal(depositTokens, true);
        wETH = _wETH;
        xOLE = _xOLE;
    }

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint32 marginLimit,
        bytes memory dexData
    ) external override returns (uint16) {
        uint8 dex = dexData.toDex();
        require(isSupportDex(dex), "Unsupported Dex");
        require(msg.sender == address(controller), "Not controller");
        require(marginLimit >= defaultMarginLimit, "Limit is lower");
        require(marginLimit < 100000, "Limit is higher");
        // todo fix the temporary approve
        address token0 = pool0.underlying();
        address token1 = pool1.underlying();
        // Approve the max number for pools
        IERC20(token0).approve(address(pool0), uint256(- 1));
        IERC20(token1).approve(address(pool1), uint256(- 1));
        //Create Market
        uint16 marketId = numPairs;
        uint32[] memory dexs = new uint32[](16);
        dexs[0] = dexData.toDexDetail();
        markets[marketId] = Types.Market(pool0, pool1, marginLimit, defaultFeesRate, 0, 0, dexs);
        numPairs ++;
        // Init price oracle
        if (dexData.isUniV2Class()) {
            dexAggregator.updatePriceOracle(token0, token1, dexData);
        } else if (dex == DexData.DEX_UNIV3) {
            dexAggregator.updateV3Observation(token0, token1, dexData);
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
        (ControllerInterface(controller)).marginTradeAllowed(marketId);
        Types.TradeVars memory tv;
        tv.dexDetail = dexData.toDexDetail();
        // if deposit token is NOT the same as the long token
        if (depositToken != longToken) {
            tv.depositErc20 = vars.sellToken;
            deposit = transferIn(msg.sender, tv.depositErc20, deposit);
            tv.fees = feesAndInsurance(deposit.add(borrow), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = tv.depositAfterFees.add(borrow);
            require(borrow == 0 || deposit.mul(10000).div(borrow) > vars.marginRatio, "Margin ratio limit not met");
        } else {
            (uint currentPrice, uint8 priceDecimals) = dexAggregator.getPrice(address(vars.sellToken), address(vars.buyToken), dexData);
            tv.borrowValue = borrow.mul(currentPrice).div(10 ** uint(priceDecimals));
            tv.depositErc20 = vars.buyToken;
            deposit = transferIn(msg.sender, tv.depositErc20, deposit);
            tv.fees = feesAndInsurance(deposit.add(tv.borrowValue), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = borrow;
            require(borrow == 0 || deposit.mul(10000).div(tv.borrowValue) > vars.marginRatio, "Margin ratio limit not met");
        }

        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        trade.lastBlockNum = uint128(block.number);
        trade.depositToken = depositToken;
        // Borrow
        vars.sellPool.borrowBehalf(msg.sender, borrow);
        // Trade in exchange
        if (tv.tradeSize > 0) {
            tv.newHeld = flashSell(address(vars.buyToken), address(vars.sellToken), tv.tradeSize, minBuyAmount, dexData);
            tv.receiveAmount = tv.newHeld;
        }

        if (depositToken == longToken) {
            tv.newHeld = tv.newHeld.add(tv.depositAfterFees);
        }
        trade.deposited = trade.deposited.add(tv.depositAfterFees);
        trade.held = trade.held.add(tv.newHeld);
        //verify
        verifyOpenAfter(marketId, longToken, address(vars.buyToken), address(vars.sellToken), dexData);
        emit MarginTrade(msg.sender, marketId, longToken, depositToken, deposit, borrow, tv.newHeld, tv.fees, tv.tradeSize, tv.receiveAmount, tv.dexDetail);
    }

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minAmount, bytes memory dexData) external override nonReentrant onlySupportDex(dexData) {
        //verify
        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        Types.MarketVars memory marketVars = toMarketVar(marketId, longToken, false);
        //verify
        verifyCloseBefore(trade, marketVars, closeAmount, dexData);
        trade.lastBlockNum = uint128(block.number);
        Types.CloseTradeVars memory closeTradeVars;
        closeTradeVars.marketId = marketId;
        closeTradeVars.longToken = longToken;
        closeTradeVars.closeRatio = closeAmount.mul(10000).div(trade.held);
        closeTradeVars.isPartialClose = closeAmount != trade.held ? true : false;
        closeTradeVars.fees = feesAndInsurance(closeAmount, address(marketVars.sellToken), closeTradeVars.marketId);
        closeTradeVars.closeAmountAfterFees = closeAmount.sub(closeTradeVars.fees);
        closeTradeVars.repayAmount = marketVars.buyPool.borrowBalanceCurrent(msg.sender);
        //partial close
        if (closeTradeVars.isPartialClose) {
            closeTradeVars.repayAmount = closeTradeVars.repayAmount.mul(closeTradeVars.closeRatio).div(10000);
            trade.held = trade.held.sub(closeAmount);
            closeTradeVars.depositDecrease = trade.deposited.mul(closeTradeVars.closeRatio).div(10000);
            trade.deposited = trade.deposited.sub(closeTradeVars.depositDecrease);
        } else {
            closeTradeVars.depositDecrease = trade.deposited;
        }
        if (trade.depositToken != closeTradeVars.longToken) {
            closeTradeVars.receiveAmount = flashSell(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.closeAmountAfterFees, minAmount, dexData);
            closeTradeVars.sellAmount = closeTradeVars.closeAmountAfterFees;
            require(closeTradeVars.receiveAmount >= closeTradeVars.repayAmount, 'Liquidate Only');
            marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
            closeTradeVars.depositReturn = closeTradeVars.receiveAmount.sub(closeTradeVars.repayAmount);
            doTransferOut(msg.sender, marketVars.buyToken, closeTradeVars.depositReturn);
        } else {// trade.depositToken == longToken
            bool isSellAllHeld;
            // uniV3 can't cal buy amount on chain,so get from dexdata
            if (dexData.toDex() == DexData.DEX_UNIV3) {
                isSellAllHeld = dexData.toUniV3QuoteFlag();
            } else {
                isSellAllHeld = calBuyAmount(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.closeAmountAfterFees, dexData) > closeTradeVars.repayAmount ? false : true;
            }
            //maybe can't repay all
            if (isSellAllHeld) {
                closeTradeVars.receiveAmount = flashSell(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.closeAmountAfterFees, minAmount, dexData);
                closeTradeVars.sellAmount = closeTradeVars.closeAmountAfterFees;
                require(closeTradeVars.receiveAmount >= closeTradeVars.repayAmount, "Liquidate Only");
                marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
                //buy back deposit token
                closeTradeVars.depositReturn = flashSell(address(marketVars.sellToken), address(marketVars.buyToken), closeTradeVars.receiveAmount.sub(closeTradeVars.repayAmount), 0, dexData);
                doTransferOut(msg.sender, marketVars.sellToken, closeTradeVars.depositReturn);
            }
            //normal
            else {
                closeTradeVars.sellAmount = flashBuy(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.repayAmount, closeTradeVars.closeAmountAfterFees, dexData);
                closeTradeVars.receiveAmount = closeTradeVars.repayAmount;
                marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
                closeTradeVars.depositReturn = closeTradeVars.closeAmountAfterFees.sub(closeTradeVars.sellAmount);
                doTransferOut(msg.sender, marketVars.sellToken, closeTradeVars.depositReturn);
            }
        }
        if (!closeTradeVars.isPartialClose) {
            delete activeTrades[msg.sender][closeTradeVars.marketId][closeTradeVars.longToken];
        }
        //verify
        verifyCloseAfter(address(marketVars.buyToken), address(marketVars.sellToken), dexData);
        emit TradeClosed(msg.sender, closeTradeVars.marketId, closeTradeVars.longToken, closeAmount, closeTradeVars.depositDecrease, closeTradeVars.depositReturn, closeTradeVars.fees,
            closeTradeVars.sellAmount, closeTradeVars.receiveAmount, dexData.toDexDetail());
    }


    function liquidate(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override nonReentrant onlySupportDex(dexData) {
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        Types.MarketVars memory marketVars = toMarketVar(marketId, longToken, false);
        //verify
        verifyLiquidateBefore(trade, marketVars, dexData);
        //controller
        (ControllerInterface(controller)).liquidateAllowed(marketId, msg.sender, trade.held, dexData);
        require(!isPositionHealthy(owner, marketId, longToken, false, dexData), "Position is Healthy");
        Types.LiquidateVars memory liquidateVars;
        liquidateVars.dexDetail = dexData.toDexDetail();
        liquidateVars.marketId = marketId;
        liquidateVars.longToken = longToken;
        liquidateVars.fees = feesAndInsurance(trade.held, address(marketVars.sellToken), liquidateVars.marketId);
        liquidateVars.borrowed = marketVars.buyPool.borrowBalanceCurrent(owner);
        liquidateVars.isSellAllHeld = true;
        liquidateVars.depositDecrease = trade.deposited;
        // Check need to sell all held,base on longToken=depositToken
        if (longToken == trade.depositToken) {
            // uniV3 can't cal buy amount on chain,so get from dexdata
            if (dexData.toDex() == DexData.DEX_UNIV3) {
                liquidateVars.isSellAllHeld = dexData.toUniV3QuoteFlag();
            } else {
                liquidateVars.isSellAllHeld = calBuyAmount(address(marketVars.buyToken), address(marketVars.sellToken), trade.held.sub(liquidateVars.fees), dexData) > liquidateVars.borrowed ? false : true;
            }
        }
        // need't to sell all held
        if (!liquidateVars.isSellAllHeld) {
            liquidateVars.sellAmount = flashBuy(address(marketVars.buyToken), address(marketVars.sellToken), liquidateVars.borrowed, trade.held.sub(liquidateVars.fees), dexData);
            liquidateVars.receiveAmount = liquidateVars.borrowed;
            marketVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
            liquidateVars.depositReturn = trade.held.sub(liquidateVars.fees).sub(liquidateVars.sellAmount);
            doTransferOut(owner, marketVars.sellToken, liquidateVars.depositReturn);
        } else {
            liquidateVars.sellAmount = trade.held.sub(liquidateVars.fees);
            liquidateVars.receiveAmount = flashSell(address(marketVars.buyToken), address(marketVars.sellToken), liquidateVars.sellAmount, 0, dexData);
            // can repay
            if (liquidateVars.receiveAmount > liquidateVars.borrowed) {
                marketVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
                // buy back depositToken
                if (longToken == trade.depositToken) {
                    liquidateVars.depositReturn = flashSell(address(marketVars.sellToken), address(marketVars.buyToken), liquidateVars.receiveAmount.sub(liquidateVars.borrowed), 0, dexData);
                    doTransferOut(owner, marketVars.sellToken, liquidateVars.depositReturn);

                } else {
                    liquidateVars.depositReturn = liquidateVars.receiveAmount.sub(liquidateVars.borrowed);
                    doTransferOut(owner, marketVars.buyToken, liquidateVars.depositReturn);
                }
            } else {
                uint finalRepayAmount = reduceInsurance(liquidateVars.borrowed, liquidateVars.receiveAmount, liquidateVars.marketId, liquidateVars.longToken);
                liquidateVars.outstandingAmount = liquidateVars.borrowed.sub(finalRepayAmount);
                marketVars.buyPool.repayBorrowEndByOpenLev(owner, finalRepayAmount);
            }
        }

        //verify
        verifyLiquidateAfter(address(marketVars.buyToken), address(marketVars.sellToken), dexData);

        emit Liquidation(owner, liquidateVars.marketId, longToken, trade.held, liquidateVars.outstandingAmount, msg.sender, liquidateVars.depositDecrease, liquidateVars.depositReturn, liquidateVars.sellAmount, liquidateVars.receiveAmount, liquidateVars.dexDetail);
        delete activeTrades[owner][marketId][longToken];
    }

    function marginRatio(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override onlySupportDex(dexData) view returns (uint current, uint avg, uint32 limit) {
        (current, avg, limit) = marginRatioInternal(owner, marketId, longToken, false, dexData);
    }

    function marginRatioInternal(address owner, uint16 marketId, bool longToken, bool isOpen, bytes memory dexData)
    internal view returns (uint current, uint avg, uint32 limit)
    {
        // Shh - currently unused
        isOpen;
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        uint256 multiplier = 10000;
        Types.MarketVars memory vars = toMarketVar(marketId, longToken, true);
        limit = vars.marginRatio;
        current = uint(- 1);
        avg = uint(- 1);
        uint borrowed = vars.sellPool.borrowBalanceCurrent(owner);
        if (borrowed != 0) {
            (uint price, uint avgPrice, uint8 decimals,) = dexAggregator.getPriceAndAvgPrice(address(vars.buyToken), address(vars.sellToken), twapDuration, dexData);
            //marginRatio=(marketValue-borrowed)/borrowed
            uint marketValueCurrent = trade.held.mul(price).div(10 ** uint(decimals));
            if (marketValueCurrent >= borrowed) {
                current = marketValueCurrent.sub(borrowed).mul(multiplier).div(borrowed);
            } else {
                current = 0;
            }
            uint marketValueAvg = trade.held.mul(avgPrice).div(10 ** uint(decimals));
            if (marketValueAvg >= borrowed) {
                avg = marketValueAvg.sub(borrowed).mul(multiplier).div(borrowed);
            } else {
                avg = 0;
            }
        }

    }

    function shouldUpdatePrice(uint16 marketId, bool isOpen, bytes memory dexData) external override view returns (bool){
        Types.Market memory market = markets[marketId];
        return shouldUpdatePriceInternal(market.pool1.underlying(), market.pool0.underlying(), isOpen, dexData);
    }

    function getMarketSupportDexs(uint16 marketId) external override view returns (uint32[] memory){
        return markets[marketId].dexs;
    }

    function shouldUpdatePriceInternal(address token0, address token1, bool isOpen, bytes memory dexData) internal view returns (bool){
        // Shh - currently unused
        isOpen;
        (uint price, uint cAvgPrice, uint hAvgPrice,,) = dexAggregator.getPriceCAvgPriceHAvgPrice(token0, token1, twapDuration, dexData);
        //Not initialized yet
        if (price == 0 || cAvgPrice == 0 || hAvgPrice == 0) {
            return true;
        }
        //price difference
        uint one = 100;
        uint cDifferencePriceRatio = cAvgPrice.mul(one).div(price);
        uint hDifferencePriceRatio = hAvgPrice.mul(one).div(cAvgPrice);

        if (cDifferencePriceRatio >= (one.add(priceDiffientRatio)) || cDifferencePriceRatio <= (one.sub(priceDiffientRatio))) {
            return true;
        }
        if (hDifferencePriceRatio >= (one.add(priceDiffientRatio)) || hDifferencePriceRatio <= (one.sub(priceDiffientRatio))) {
            return true;
        }
        return false;
    }

    function isPositionHealthy(address owner, uint16 marketId, bool longToken, bool isOpen, bytes memory dexData) internal view returns (bool)
    {
        (uint current, uint avg, uint32 limit) = marginRatioInternal(owner, marketId, longToken, isOpen, dexData);
        if (isOpen) {
            return current >= limit && avg >= limit;
        } else {
            return current >= limit || avg >= limit;
        }
    }

    function reduceInsurance(uint totalRepayment, uint remaining, uint16 marketId, bool longToken) internal returns (uint) {
        uint maxCanRepayAmount = totalRepayment;
        Types.Market storage market = markets[marketId];
        uint needed = totalRepayment.sub(remaining);
        if (longToken) {
            if (market.pool0Insurance >= needed) {
                market.pool0Insurance = market.pool0Insurance.sub(needed);
            } else {
                market.pool0Insurance = 0;
                maxCanRepayAmount = market.pool0Insurance.add(remaining);
            }
        } else {
            if (market.pool1Insurance >= needed) {
                market.pool1Insurance = market.pool1Insurance.sub(needed);
            } else {
                market.pool1Insurance = 0;
                maxCanRepayAmount = market.pool1Insurance.add(remaining);
            }
        }
        return maxCanRepayAmount;
    }

    function toMarketVar(uint16 marketId, bool longToken, bool open) internal view returns (Types.MarketVars memory) {
        Types.MarketVars memory vars;
        Types.Market memory market = markets[marketId];

        if (open) {
            vars.buyPool = longToken ? market.pool1 : market.pool0;
            vars.sellPool = longToken ? market.pool0 : market.pool1;
        } else {
            vars.buyPool = longToken ? market.pool0 : market.pool1;
            vars.sellPool = longToken ? market.pool1 : market.pool0;
        }
        vars.buyPoolInsurance = longToken ? market.pool0Insurance : market.pool1Insurance;
        vars.sellPoolInsurance = longToken ? market.pool1Insurance : market.pool0Insurance;

        vars.buyToken = IERC20(vars.buyPool.underlying());
        vars.sellToken = IERC20(vars.sellPool.underlying());
        vars.marginRatio = market.marginLimit;
        vars.dexs = market.dexs;
        return vars;
    }


    function feesAndInsurance(uint tradeSize, address token, uint16 marketId) internal returns (uint) {
        Types.Market storage market = markets[marketId];
        uint fees = tradeSize.mul(market.feesRate).div(10000);
        // if trader holds more xOLE, then should enjoy trading discount.
        if (XOLE(xOLE).balanceOf(msg.sender, 0) > feesDiscountThreshold) {
            fees = fees.sub(fees.mul(feesDiscount).div(10000));
        }
        uint newInsurance = fees.mul(insuranceRatio).div(100);

        IERC20(token).transfer(xOLE, fees.sub(newInsurance));
        if (token == market.pool1.underlying()) {
            market.pool1Insurance = market.pool1Insurance.add(newInsurance);
        } else {
            market.pool0Insurance = market.pool0Insurance.add(newInsurance);
        }
        return fees;
    }

    function flashSell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, bytes memory data) internal returns (uint){
        IERC20(sellToken).approve(address(dexAggregator), sellAmount);
        uint buyAmount = dexAggregator.sell(buyToken, sellToken, sellAmount, minBuyAmount, data);
        return buyAmount;
    }

    function flashBuy(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount, bytes memory data) internal returns (uint){
        IERC20(sellToken).approve(address(dexAggregator), maxSellAmount);
        return dexAggregator.buy(buyToken, sellToken, buyAmount, maxSellAmount, data);
    }

    function calBuyAmount(address buyToken, address sellToken, uint sellAmount, bytes memory data) internal view returns (uint){
        return dexAggregator.calBuyAmount(buyToken, sellToken, sellAmount, data);
    }

    function transferIn(address from, IERC20 token, uint amount) internal returns (uint) {
        uint balanceBefore = token.balanceOf(address(this));
        if (address(token) == wETH) {
            IWETH(address(token)).deposit{value : msg.value}();
        } else {
            token.safeTransferFrom(from, address(this), amount);
        }
        // Calculate the amount that was *actually* transferred
        uint balanceAfter = token.balanceOf(address(this));
        return balanceAfter.sub(balanceBefore);
    }

    function doTransferOut(address to, IERC20 token, uint amount) internal {
        if (address(token) == wETH) {
            IWETH(address(token)).withdraw(amount);
            payable(to).transfer(amount);
        } else {
            token.safeTransfer(to, amount);
        }
    }

    /*** Admin Functions ***/

    function setDefaultMarginLimit(uint32 newRatio) external override onlyAdmin() {
        uint32 oldRatio = defaultMarginLimit;
        defaultMarginLimit = newRatio;
        emit NewDefaultMarginLimit(oldRatio, newRatio);
    }

    function setMarketMarginLimit(uint16 marketId, uint32 newRatio) external override onlyAdmin() {
        uint32 oldRatio = markets[marketId].marginLimit;
        markets[marketId].marginLimit = newRatio;
        emit NewMarketMarginLimit(marketId, oldRatio, newRatio);
    }

    function setDefaultFeesRate(uint16 newRate) external override onlyAdmin() {
        uint16 oldFeesRate = defaultFeesRate;
        defaultFeesRate = newRate;
        emit NewDefalutFeesRate(oldFeesRate, defaultFeesRate);
    }

    function setMarketFeesRate(uint16 marketId, uint16 newRate) external override onlyAdmin() {
        Types.Market storage market = markets[marketId];
        uint16 oldFeesRate = market.feesRate;
        market.feesRate = newRate;
        emit NewMarketFeesRate(marketId, oldFeesRate, market.feesRate);
    }

    function setInsuranceRatio(uint8 newRatio) external override onlyAdmin() {
        uint8 oldRatio = insuranceRatio;
        insuranceRatio = newRatio;
        emit NewInsuranceRatio(oldRatio, insuranceRatio);
    }

    function setFeesDiscountThreshold(uint newThreshold) external override onlyAdmin() {
        feesDiscountThreshold = newThreshold;
    }

    function setFeesDiscount(uint newDiscount) external override onlyAdmin() {
        feesDiscount = newDiscount;
    }

    function setController(address newController) external override onlyAdmin() {
        address oldController = controller;
        controller = newController;
        emit NewController(oldController, controller);
    }

    function setDexAggregator(DexAggregatorInterface _dexAggregator) external override onlyAdmin() {
        DexAggregatorInterface oldDexAggregator = dexAggregator;
        dexAggregator = _dexAggregator;
        emit NewDexAggregator(oldDexAggregator, dexAggregator);
    }


    function moveInsurance(uint16 marketId, uint8 poolIndex, address to, uint amount) external override nonReentrant() onlyAdmin() {
        Types.Market storage market = markets[marketId];
        if (poolIndex == 0) {
            market.pool0Insurance = market.pool0Insurance.sub(amount);
            (IERC20(market.pool0.underlying())).safeTransfer(to, amount);
            return;
        }
        market.pool1Insurance = market.pool1Insurance.sub(amount);
        (IERC20(market.pool1.underlying())).safeTransfer(to, amount);
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

    function setPriceDiffientRatio(uint16 newPriceDiffientRatio) external override onlyAdmin() {
        require(newPriceDiffientRatio <= 100, 'Overflow');
        uint16 oldPriceDiffientRatio = priceDiffientRatio;
        priceDiffientRatio = newPriceDiffientRatio;
        emit NewPriceDiffientRatio(oldPriceDiffientRatio, priceDiffientRatio);
    }

    function setMarketDexs(uint16 marketId, uint32[] memory dexs) external override onlyAdmin() {
        for (uint i = 0; i < dexs.length; i++) {
            require(isSupportDex(getDexUint8(dexs[i])), 'Unsupported dex');
        }
        uint32[] memory oldDex = markets[marketId].dexs;
        markets[marketId].dexs = dexs;
        emit NewMarketDex(marketId, oldDex, dexs);
    }

    function verifyTrade(Types.MarketVars memory vars, uint16 marketId, bool longToken, bool depositToken, uint deposit, uint borrow, bytes memory dexData) internal view {
        //update price
        if (borrow != 0) {
            require(!shouldUpdatePriceInternal(address(vars.buyToken), address(vars.sellToken), true, dexData), 'Update price firstly');
        }

        //verify if deposit token allowed
        address depositTokenAddr = depositToken == longToken ? address(vars.buyToken) : address(vars.sellToken);
        require(allowedDepositTokens[depositTokenAddr], "UnAllowed deposit token");

        //verify minimal deposit > absolute value 0.0001
        uint minimalDeposit = 10 ** (ERC20(depositTokenAddr).decimals() - 4);
        uint actualDeposit = depositTokenAddr == wETH ? msg.value : deposit;
        require(actualDeposit > minimalDeposit, "Deposit too small");

        Types.Trade memory trade = activeTrades[msg.sender][marketId][longToken];
        // New trade
        if (trade.lastBlockNum == 0) {
            require(borrow > 0, "Borrow 0");
            return;
        } else {
            // For new trade, these checks are not needed
            require(depositToken == trade.depositToken, "Deposit token not same");
            require(trade.lastBlockNum != uint128(block.number), 'Same block');
            require(isInSupportDex(vars.dexs, dexData.toDexDetail()), 'Dex not support');
        }
    }

    function verifyOpenAfter(uint16 marketId, bool longToken, address token0, address token1, bytes memory dexData) internal {
        require(isPositionHealthy(msg.sender, marketId, longToken, true, dexData), "Position not healthy");
        if (dexData.isUniV2Class()) {
            dexAggregator.updatePriceOracle(token0, token1, dexData);
        }
    }

    function verifyCloseBefore(Types.Trade memory trade, Types.MarketVars memory vars, uint closeAmount, bytes memory dexData) internal view {
        require(trade.lastBlockNum != block.number, "Same block");
        require(trade.held != 0, "Held is 0");
        require(closeAmount <= trade.held, "Close > held");
        require(isInSupportDex(vars.dexs, dexData.toDexDetail()), 'Dex not support');
    }

    function verifyCloseAfter(address token0, address token1, bytes memory dexData) internal {
        if (dexData.isUniV2Class()) {
            dexAggregator.updatePriceOracle(token0, token1, dexData);
        }
    }

    function verifyLiquidateBefore(Types.Trade memory trade, Types.MarketVars memory vars, bytes memory dexData) internal view {
        require(trade.held != 0, "Held is 0");
        require(trade.lastBlockNum != block.number, "Same block");
        require(isInSupportDex(vars.dexs, dexData.toDexDetail()), 'Dex not support');
        require(!shouldUpdatePriceInternal(address(vars.sellToken), address(vars.buyToken), false, dexData), 'Update price firstly');
    }

    function verifyLiquidateAfter(address token0, address token1, bytes memory dexData) internal {
        if (dexData.isUniV2Class()) {
            dexAggregator.updatePriceOracle(token0, token1, dexData);
        }
    }

    function getDexUint8(uint32 dexData) internal pure returns (uint8){
        return uint8(dexData >= 2 ** 24 ? dexData >> 24 : dexData);
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
        require(isSupportDex(dexData.toDex()), "Unsupported dex");
        _;
    }
}

