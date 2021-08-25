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

    uint32 private constant twapDuration = 28;//28s

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
        addressConfig.controller = _controller;
        addressConfig.dexAggregator = _dexAggregator;
        addressConfig.wETH = _wETH;
        addressConfig.xOLE = _xOLE;
        setAllowedDepositTokensInternal(depositTokens, true);
        calculateConfig.defaultFeesRate = 30;
        calculateConfig.insuranceRatio = 33;
        calculateConfig.defaultMarginLimit = 3000;
        calculateConfig.priceDiffientRatio = 10;
        calculateConfig.updatePriceDiscount = 25;
        calculateConfig.feesDiscount = 25;
        calculateConfig.feesDiscountThreshold = 30 * (10 ** 18);

    }

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint16 marginLimit,
        bytes memory dexData
    ) external override returns (uint16) {
        uint8 dex = dexData.toDex();
        CalculateConfig memory config = calculateConfig;
        require(isSupportDex(dex), "Unsupported Dex");
        require(msg.sender == address(addressConfig.controller), "Not controller");
        require(marginLimit >= config.defaultMarginLimit, "Limit is lower");
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
        markets[marketId] = Types.Market(pool0, pool1, token0, token1, marginLimit, config.defaultFeesRate, config.priceDiffientRatio, config.priceDiffientRatio, address(0), 0, 0, dexs);
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
            tv.fees = feesAndInsurance(deposit.add(borrow), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = tv.depositAfterFees.add(borrow);
            require(borrow == 0 || deposit.mul(10000).div(borrow) > vars.marginLimit, "Margin ratio limit not met");
        } else {
            (uint currentPrice, uint8 priceDecimals) = addressConfig.dexAggregator.getPrice(address(vars.sellToken), address(vars.buyToken), dexData);
            tv.borrowValue = borrow.mul(currentPrice).div(10 ** uint(priceDecimals));
            tv.depositErc20 = vars.buyToken;
            deposit = transferIn(msg.sender, tv.depositErc20, deposit);
            tv.fees = feesAndInsurance(deposit.add(tv.borrowValue), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = borrow;
            require(borrow == 0 || deposit.mul(10000).div(tv.borrowValue) > vars.marginLimit, "Margin ratio limit not met");
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
        verifyCloseAfter(marketId, address(marketVars.buyToken), address(marketVars.sellToken), dexData);
        emit TradeClosed(msg.sender, closeTradeVars.marketId, closeTradeVars.longToken, closeAmount, closeTradeVars.depositDecrease, closeTradeVars.depositReturn, closeTradeVars.fees,
            closeTradeVars.sellAmount, closeTradeVars.receiveAmount, dexData.toDexDetail());
    }


    function liquidate(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override nonReentrant onlySupportDex(dexData) {
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        Types.MarketVars memory marketVars = toMarketVar(marketId, longToken, false);
        //verify
        verifyLiquidateBefore(marketId, trade, marketVars, dexData);
        //controller
        (ControllerInterface(addressConfig.controller)).liquidateAllowed(marketId, msg.sender, trade.held, dexData);
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
        verifyLiquidateAfter(marketId, address(marketVars.buyToken), address(marketVars.sellToken), dexData);

        emit Liquidation(owner, liquidateVars.marketId, longToken, trade.held, liquidateVars.outstandingAmount, msg.sender, liquidateVars.depositDecrease, liquidateVars.depositReturn, liquidateVars.sellAmount, liquidateVars.receiveAmount, liquidateVars.dexDetail);
        delete activeTrades[owner][marketId][longToken];
    }

    function marginRatio(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override onlySupportDex(dexData) view returns (uint current, uint avg, uint32 limit) {
        (current, avg, limit) = marginRatioInternal(owner, marketId, longToken, false, dexData);
    }

    function marginRatioInternal(address owner, uint16 marketId, bool longToken, bool isOpen, bytes memory dexData)
    internal view returns (uint, uint, uint32)
    {
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        Types.MarketVars memory vars = toMarketVar(marketId, longToken, true);
        uint16 multiplier = 10000;
        uint borrowed = isOpen ? vars.sellPool.borrowBalanceStored(owner) : vars.sellPool.borrowBalanceCurrent(owner);
        if (borrowed == 0) {
            return (10000, 10000, vars.marginLimit);
        }
        (uint price, uint avgPrice, uint8 decimals,) = addressConfig.dexAggregator.getPriceAndAvgPrice(address(vars.buyToken), address(vars.sellToken), twapDuration, dexData);
        //marginRatio=(marketValue-borrowed)/borrowed
        uint marketValue = trade.held.mul(price).div(10 ** uint(decimals));
        uint current = marketValue >= borrowed ? marketValue.sub(borrowed).mul(multiplier).div(borrowed) : 0;
        marketValue = trade.held.mul(avgPrice).div(10 ** uint(decimals));
        uint avg = marketValue >= borrowed ? marketValue.sub(borrowed).mul(multiplier).div(borrowed) : 0;
        return (current, avg, vars.marginLimit);
    }

    function updatePrice(uint16 marketId, bool isOpen, bytes memory dexData) external override {
        Types.Market memory market = markets[marketId];
        require(!isOpen || shouldUpdatePriceInternal(marketId, market.token1, market.token0, isOpen, dexData), "Needn't update price");
        updatePriceInternal(marketId, market.token0, market.token1, dexData, isOpen);
    }

    function shouldUpdatePrice(uint16 marketId, bool isOpen, bytes memory dexData) external override view returns (bool){
        Types.Market memory market = markets[marketId];
        return shouldUpdatePriceInternal(marketId, market.token1, market.token0, isOpen, dexData);
    }

    function getMarketSupportDexs(uint16 marketId) external override view returns (uint32[] memory){
        return markets[marketId].dexs;
    }

    function updatePriceInternal(uint16 marketId, address token0, address token1, bytes memory dexData, bool record) internal {
        bool updateResult = addressConfig.dexAggregator.updatePriceOracle(token0, token1, twapDuration, dexData);
        if (record && updateResult) {
            markets[marketId].priceUpdator = tx.origin;
        }
    }

    function shouldUpdatePriceInternal(uint16 marketId, address token0, address token1, bool isOpen, bytes memory dexData) internal view returns (bool){
        // Shh - currently unused
        isOpen;
        (uint price, uint cAvgPrice, uint hAvgPrice,,) = addressConfig.dexAggregator.getPriceCAvgPriceHAvgPrice(token0, token1, twapDuration, dexData);
        //Not initialized yet
        if (price == 0 || cAvgPrice == 0 || hAvgPrice == 0) {
            return true;
        }
        //price difference
        uint one = 100;
        uint cDifferencePriceRatio = cAvgPrice.mul(one).div(price);
        uint hDifferencePriceRatio = hAvgPrice.mul(one).div(price);
        Types.Market memory market = markets[marketId];
        if (hDifferencePriceRatio >= (one.add(market.priceDiffientRatio1)) || hDifferencePriceRatio <= (one.sub(market.priceDiffientRatio1))) {
            return true;
        }
        if (cDifferencePriceRatio >= (one.add(market.priceDiffientRatio2)) || cDifferencePriceRatio <= (one.sub(market.priceDiffientRatio2))) {
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
        return vars;
    }


    function feesAndInsurance(uint tradeSize, address token, uint16 marketId) internal returns (uint) {
        Types.Market storage market = markets[marketId];
        uint defaultFees = tradeSize.mul(market.feesRate).div(10000);
        uint newFees = defaultFees;
        CalculateConfig memory config = calculateConfig;
        // if trader holds more xOLE, then should enjoy trading discount.
        if (XOLE(addressConfig.xOLE).balanceOf(msg.sender, 0) > config.feesDiscountThreshold) {
            newFees = defaultFees.sub(defaultFees.mul(config.feesDiscount).div(100));
        }
        // if trader update price, then should enjoy trading discount.
        if (market.priceUpdator == msg.sender) {
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

    function setCalculateConfig(uint16 defaultFeesRate,
        uint8 insuranceRatio,
        uint16 defaultMarginLimit,
        uint16 priceDiffientRatio,
        uint16 updatePriceDiscount,
        uint16 feesDiscount,
        uint128 feesDiscountThreshold) external override onlyAdmin() {
        calculateConfig.defaultFeesRate = defaultFeesRate;
        calculateConfig.insuranceRatio = insuranceRatio;
        calculateConfig.defaultMarginLimit = defaultMarginLimit;
        calculateConfig.priceDiffientRatio = priceDiffientRatio;
        calculateConfig.updatePriceDiscount = updatePriceDiscount;
        calculateConfig.feesDiscount = feesDiscount;
        calculateConfig.feesDiscountThreshold = feesDiscountThreshold;
        emit NewCalculateConfig(defaultFeesRate, insuranceRatio, defaultMarginLimit, priceDiffientRatio, updatePriceDiscount, feesDiscount, feesDiscountThreshold);
    }

    function setAddressConfig(address controller,
        DexAggregatorInterface dexAggregator) external override {
        addressConfig.controller = controller;
        addressConfig.dexAggregator = dexAggregator;
        emit NewAddressConfig(controller, address(dexAggregator));
    }

    function setMarketConfig(uint16 marketId, uint16 feesRate, uint16 marginLimit, uint32[] memory dexs) external override onlyAdmin() {
        Types.Market storage market = markets[marketId];
        market.feesRate = feesRate;
        market.marginLimit = marginLimit;
        market.dexs = dexs;
        emit NewMarketConfig(marketId, feesRate, marginLimit, dexs);
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
        //update price
        if (borrow != 0) {
            require(!shouldUpdatePriceInternal(marketId, address(vars.buyToken), address(vars.sellToken), true, dexData), 'Update price firstly');
        }

        //verify if deposit token allowed
        address depositTokenAddr = depositToken == longToken ? address(vars.buyToken) : address(vars.sellToken);
        require(allowedDepositTokens[depositTokenAddr], "UnAllowed deposit token");

        //verify minimal deposit > absolute value 0.0001
        uint minimalDeposit = 10 ** (ERC20(depositTokenAddr).decimals() - 4);
        uint actualDeposit = depositTokenAddr == addressConfig.wETH ? msg.value : deposit;
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
            updatePriceInternal(marketId, token0, token1, dexData, false);
        }
    }

    function verifyCloseBefore(Types.Trade memory trade, Types.MarketVars memory vars, uint closeAmount, bytes memory dexData) internal view {
        require(trade.lastBlockNum != block.number, "Same block");
        require(trade.held != 0, "Held is 0");
        require(closeAmount <= trade.held, "Close > held");
        require(isInSupportDex(vars.dexs, dexData.toDexDetail()), 'Dex not support');
    }

    function verifyCloseAfter(uint16 marketId, address token0, address token1, bytes memory dexData) internal {
        if (dexData.isUniV2Class()) {
            updatePriceInternal(marketId, token0, token1, dexData, false);
        }
    }

    function verifyLiquidateBefore(uint16 marketId, Types.Trade memory trade, Types.MarketVars memory vars, bytes memory dexData) internal view {
        require(trade.held != 0, "Held is 0");
        require(trade.lastBlockNum != block.number, "Same block");
        require(isInSupportDex(vars.dexs, dexData.toDexDetail()), 'Dex not support');
        require(!shouldUpdatePriceInternal(marketId, address(vars.sellToken), address(vars.buyToken), false, dexData), 'Update price firstly');
    }

    function verifyLiquidateAfter(uint16 marketId, address token0, address token1, bytes memory dexData) internal {
        if (dexData.isUniV2Class()) {
            updatePriceInternal(marketId, token0, token1, dexData, false);
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

