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

/**
  * @title OpenLevV1
  * @author OpenLeverage
  */
contract OpenLevV1 is DelegateInterface, OpenLevInterface, OpenLevStorage, Adminable, ReentrancyGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using Address for address;
    using DexData for bytes;

    constructor ()
    {
    }

    function initialize(
        address _controller,
        address _treasury,
        DexAggregatorInterface _dexAggregator,
        address[] memory depositTokens
    ) public {
        require(msg.sender == admin, "Not admin");
        treasury = _treasury;
        controller = _controller;
        dexAggregator = _dexAggregator;
        _setAllowedDepositTokens(depositTokens, true);
    }

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint32 marginLimit
    ) external override returns (uint16) {
        require(msg.sender == address(controller), "Creating market is only allowed by controller");
        require(marginLimit >= defaultMarginLimit, "Margin ratio is lower then the default limit");
        require(marginLimit < 100000, "Highest margin ratio is 1000%");
        uint16 marketId = numPairs;
        markets[marketId] = Types.Market(pool0, pool1, marginLimit, defaultFeesRate, 0, 0);
        // todo fix the temporary approve
        IERC20(pool0.underlying()).approve(address(pool0), uint256(- 1));
        IERC20(pool1.underlying()).approve(address(pool1), uint256(- 1));
        numPairs ++;
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
    ) external override nonReentrant onlyUniV3(dexData) {
        //controller
        (OpenLevControllerInterface(controller)).marginTradeAllowed(marketId);

        //check depositToken allowed
        address depositTokenAddr = depositToken ? markets[marketId].pool1.underlying() : markets[marketId].pool0.underlying();
        require(allowedDepositTokens[depositTokenAddr], "Deposit token unAllowed");

        Types.MarketVars memory vars = toMarketVar(marketId, longToken, true);
        uint minimalDeposit = depositToken != longToken ? 10 ** (ERC20(address(vars.sellToken)).decimals() - 4)
        : 10 ** (ERC20(address(vars.buyToken)).decimals() - 4);
        // 0.0001
        require(deposit > minimalDeposit, "Deposit smaller than minimal amount");
        require(vars.sellPool.availableForBorrow() >= borrow, "Insufficient balance to borrow");

        Types.TradeVars memory tv;
        if (depositToken != longToken) {
            tv.depositErc20 = vars.sellToken;
            tv.depositErc20.safeTransferFrom(msg.sender, address(this), deposit);
            tv.fees = feesAndInsurance(deposit.add(borrow), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = tv.depositAfterFees.add(borrow);
            require(borrow == 0 || deposit.mul(10000).div(borrow) > vars.marginRatio, "Margin ratio limit not met");
        } else {
            (tv.currentPrice, tv.priceDecimals) = dexAggregator.getPrice(address(vars.sellToken), address(vars.buyToken), dexData);
            tv.borrowValue = borrow.mul(tv.currentPrice).div(10 ** uint(tv.priceDecimals));
            tv.depositErc20 = vars.buyToken;
            tv.depositErc20.safeTransferFrom(msg.sender, address(this), deposit);
            tv.fees = feesAndInsurance(deposit.add(tv.borrowValue), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = borrow;
            require(borrow == 0 || deposit.mul(10000).div(tv.borrowValue) > vars.marginRatio, "Margin ratio limit not met");
        }

        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        require(trade.lastBlockNum != block.number, "Trade can't be handled twice in same block");
        trade.lastBlockNum = block.number;

        if (trade.held == 0) {
            require(borrow > 0, "Borrow nothing is not allowed for new trade");
            trade.depositToken = depositToken;
        } else {
            require(depositToken == trade.depositToken, "Deposit token can't change");
        }

        // Borrow
        vars.sellPool.borrowBehalf(msg.sender, borrow);

        // Trade in exchange
        if (tv.tradeSize > 0) {
            tv.newHeld = flashSell(address(vars.buyToken), address(vars.sellToken), tv.tradeSize, minBuyAmount, dexData);
        }

        if (depositToken == longToken) {
            tv.newHeld = tv.newHeld.add(tv.depositAfterFees);
        }

        // Record trade
        if (trade.held == 0) {
            trade.deposited = tv.depositAfterFees;
            trade.held = tv.newHeld;
        } else {
            trade.deposited = trade.deposited.add(tv.depositAfterFees);
            trade.held = trade.held.add(tv.newHeld);
        }
        //Check position healthy
        require(isPositionHealthy(msg.sender, marketId, longToken, true, dexData), "Positon not healthy");
        (tv.currentPrice, tv.priceDecimals) = dexAggregator.getPrice(address(vars.buyToken), address(vars.sellToken), dexData);
        emit MarginTrade(msg.sender, marketId, longToken, depositToken, deposit, borrow, tv.newHeld, tv.fees, tv.currentPrice, tv.priceDecimals);
    }

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minAmount, bytes memory dexData) external override nonReentrant onlyUniV3(dexData) {
        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        require(trade.lastBlockNum != block.number, "Trade can't be handled twice in same block");
        require(trade.held != 0, "Invalid MarketId or TradeId or LongToken");
        require(closeAmount <= trade.held, "Close amount exceed held amount");

        trade.lastBlockNum = block.number;

        Types.MarketVars memory marketVars = toMarketVar(marketId, longToken, false);
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
            uint remaining = flashSell(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.closeAmountAfterFees, minAmount, dexData);
            require(remaining >= closeTradeVars.repayAmount, 'Liquidate Only');
            marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
            closeTradeVars.depositReturn = remaining.sub(closeTradeVars.repayAmount);
            marketVars.buyToken.safeTransfer(msg.sender, closeTradeVars.depositReturn);

        } else {// trade.depositToken == longToken
            // univ3 can't cal buy amount on chain,so get from dexdata
            uint canBuyAmount = dexData.toDex() == DexData.DEX_UNIV3 ? dexData.toCanBuyAmount() : calBuyAmount(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.closeAmountAfterFees, dexData);
            //maybe blow up
            if (closeTradeVars.repayAmount > canBuyAmount) {
                uint remaining = flashSell(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.closeAmountAfterFees, minAmount, dexData);
                require(remaining >= closeTradeVars.repayAmount, "Liquidate Only");
                marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
                //buy back deposit token
                closeTradeVars.depositReturn = flashSell(address(marketVars.sellToken), address(marketVars.buyToken), remaining.sub(closeTradeVars.repayAmount), 0, dexData);
                marketVars.sellToken.safeTransfer(msg.sender, closeTradeVars.depositReturn);
            }
            //normal
            else {
                uint sellAmount = flashBuy(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.repayAmount, closeTradeVars.closeAmountAfterFees, dexData);
                marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
                closeTradeVars.depositReturn = closeTradeVars.closeAmountAfterFees.sub(sellAmount);
                marketVars.sellToken.safeTransfer(msg.sender, closeTradeVars.depositReturn);
            }
        }

        if (!closeTradeVars.isPartialClose) {
            delete activeTrades[msg.sender][closeTradeVars.marketId][closeTradeVars.longToken];
        }

        (closeTradeVars.settlePrice, closeTradeVars.priceDecimals) = dexAggregator.getPrice(address(marketVars.buyToken), address(marketVars.sellToken), dexData);
        emit TradeClosed(msg.sender, closeTradeVars.marketId, closeTradeVars.longToken, closeAmount, closeTradeVars.depositDecrease, closeTradeVars.depositReturn, closeTradeVars.fees, closeTradeVars.settlePrice, closeTradeVars.priceDecimals);
    }


    function liquidate(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override nonReentrant onlyUniV3(dexData) {
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        //controller
        (OpenLevControllerInterface(controller)).liquidateAllowed(marketId, msg.sender, trade.held, dexData);

        require(trade.lastBlockNum != block.number, "Trade can't be handled twice in same block");
        require(!isPositionHealthy(owner, marketId, longToken, false, dexData), "Position is Healthy");
        Types.MarketVars memory closeVars = toMarketVar(marketId, longToken, false);
        Types.LiquidateVars memory liquidateVars;
        liquidateVars.marketId = marketId;
        liquidateVars.longToken = longToken;
        liquidateVars.fees = feesAndInsurance(trade.held, address(closeVars.sellToken), liquidateVars.marketId);
        liquidateVars.borrowed = closeVars.buyPool.borrowBalanceCurrent(owner);
        liquidateVars.isSellAllHeld = true;
        liquidateVars.depositDecrease = trade.deposited;
        // Check need to sell all held,base on longToken=depositToken
        if (longToken == trade.depositToken) {
            // univ3 can't cal buy amount on chain,so get from dexdata
            liquidateVars.maxBuyAmount = dexData.toDex() == DexData.DEX_UNIV3 ? dexData.toCanBuyAmount() : calBuyAmount(address(closeVars.buyToken), address(closeVars.sellToken), trade.held.sub(liquidateVars.fees), dexData);
            // Enough to repay
            if (liquidateVars.maxBuyAmount > liquidateVars.borrowed) {
                liquidateVars.isSellAllHeld = false;
            }
        }
        // need't to sell all held
        if (!liquidateVars.isSellAllHeld) {
            liquidateVars.sellAmount = flashBuy(address(closeVars.buyToken), address(closeVars.sellToken), liquidateVars.borrowed, trade.held.sub(liquidateVars.fees), dexData);
            closeVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
            liquidateVars.depositReturn = trade.held.sub(liquidateVars.fees).sub(liquidateVars.sellAmount);
            closeVars.sellToken.safeTransfer(owner, liquidateVars.depositReturn);
        } else {
            //swap with the max liquidity pool
            dexData = DexData.UNIV3_FEE0;
            liquidateVars.remaining = flashSell(address(closeVars.buyToken), address(closeVars.sellToken), trade.held.sub(liquidateVars.fees), 0, dexData);
            // can repay
            if (liquidateVars.remaining > liquidateVars.borrowed) {
                closeVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
                // buy back depositToken
                if (longToken == trade.depositToken) {
                    liquidateVars.depositReturn = flashSell(address(closeVars.sellToken), address(closeVars.buyToken), liquidateVars.remaining.sub(liquidateVars.borrowed), 0, dexData);
                    closeVars.sellToken.safeTransfer(owner, liquidateVars.depositReturn);
                } else {
                    liquidateVars.depositReturn = liquidateVars.remaining.sub(liquidateVars.borrowed);
                    closeVars.buyToken.safeTransfer(owner, liquidateVars.depositReturn);
                }
            } else {// remaining < repayment
                uint finalRepayAmount = reduceInsurance(liquidateVars.borrowed, liquidateVars.remaining, liquidateVars.marketId, liquidateVars.longToken);
                liquidateVars.outstandingAmount = liquidateVars.borrowed.sub(finalRepayAmount);
                closeVars.buyPool.repayBorrowBehalf(owner, finalRepayAmount);
            }
        }

        (liquidateVars.settlePrice, liquidateVars.priceDecimals) = dexAggregator.getPrice(address(closeVars.buyToken), address(closeVars.sellToken), dexData);
        emit Liquidation(owner, liquidateVars.marketId, longToken, trade.held, liquidateVars.outstandingAmount, msg.sender, liquidateVars.depositDecrease, liquidateVars.depositReturn, liquidateVars.settlePrice, liquidateVars.priceDecimals);
        delete activeTrades[owner][marketId][longToken];
    }

    function marginRatio(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override onlyUniV3(dexData) view returns (uint current, uint32 marketLimit) {
        (current, marketLimit) = marginRatioInternal(owner, marketId, longToken, false, dexData);
    }

    function marginRatioInternal(address owner, uint16 marketId, bool longToken, bool isOpen, bytes memory dexData)
    internal view returns (uint current, uint32 marketLimit)
    {
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        require(trade.held != 0, "Invalid marketId or TradeId");
        uint256 multiplier = 10000;
        Types.MarketVars memory vars = toMarketVar(marketId, longToken, true);
        uint borrowed = vars.sellPool.borrowBalanceCurrent(owner);
        if (borrowed == 0) {
            return (uint(- 1), vars.marginRatio);
        }
        //Previous block price
        (uint previousTokenPrice, uint8 previousTokenDecimals) = dexAggregator.getAvgPrice(address(vars.buyToken), address(vars.sellToken), 1, dexData);
        //current block price
        (uint currentTokenPrice, uint8 currentTokenDecimals) = dexAggregator.getPrice(address(vars.buyToken), address(vars.sellToken), dexData);
        require(previousTokenDecimals == currentTokenDecimals, 'Different price decimals');

        //isopen=true get smaller price, else get bigger price
        uint heldTokenPrice = isOpen ? (previousTokenPrice < currentTokenPrice ? previousTokenPrice : currentTokenPrice) : (previousTokenPrice < currentTokenPrice ? currentTokenPrice : previousTokenPrice);
        uint marketValueCurrent = trade.held.mul(heldTokenPrice).div(10 ** uint(previousTokenDecimals));
        //marginRatio=(marketValueCurrent-borrowed)/borrowed
        if (marketValueCurrent >= borrowed) {
            return (marketValueCurrent.sub(borrowed).mul(multiplier).div(borrowed), vars.marginRatio);
        } else {
            return (0, vars.marginRatio);
        }
    }

    function isPositionHealthy(address owner, uint16 marketId, bool longToken, bool isOpen, bytes memory dexData) internal view returns (bool)
    {
        (uint current,uint32 limit) = marginRatioInternal(owner, marketId, longToken, isOpen, dexData);
        return current > limit;
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

        return vars;
    }


    function feesAndInsurance(uint tradeSize, address token, uint16 marketId) internal returns (uint) {
        Types.Market storage market = markets[marketId];
        uint fees = tradeSize.mul(market.feesRate).div(10000);
        uint newInsurance = fees.mul(insuranceRatio).div(100);

        IERC20(token).transfer(treasury, fees.sub(newInsurance));
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

    function setDefaultFeesRate(uint newRate) external override onlyAdmin() {
        uint oldFeesRate = defaultFeesRate;
        defaultFeesRate = newRate;
        emit NewDefalutFeesRate(oldFeesRate, defaultFeesRate);
    }

    function setMarketFeesRate(uint16 marketId, uint newRate) external override onlyAdmin() {
        Types.Market storage market = markets[marketId];
        uint oldFeesRate = market.feesRate;
        market.feesRate = newRate;
        emit NewDefalutFeesRate(oldFeesRate, market.feesRate);
    }

    function setInsuranceRatio(uint8 newRatio) external override onlyAdmin() {
        uint8 oldRatio = insuranceRatio;
        insuranceRatio = newRatio;
        emit NewInsuranceRatio(oldRatio, insuranceRatio);
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
        _setAllowedDepositTokens(tokens, allowed);
    }

    function _setAllowedDepositTokens(address[] memory tokens, bool allowed) internal {
        for (uint i = 0; i < tokens.length; i++) {
            allowedDepositTokens[tokens[i]] = allowed;
        }
        emit ChangeAllowedDepositTokens(tokens, allowed);
    }
    modifier onlyUniV3(bytes memory dexData) {
        require(dexData.toDex() == DexData.DEX_UNIV3, "Only Supported UniV3");
        _;
    }
}

interface OpenLevControllerInterface {
    function liquidateAllowed(uint marketId, address liquidator, uint liquidateAmount, bytes memory dexData) external;

    function marginTradeAllowed(uint marketId) external;

}
