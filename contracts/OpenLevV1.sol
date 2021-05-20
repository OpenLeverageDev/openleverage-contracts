// SPDX-License-Identifier: MIT
pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OpenLevInterface.sol";
import "./Types.sol";
import "./DexCaller.sol";
import "./dex/PriceOracleInterface.sol";
import "./Adminable.sol";
import "./DelegateInterface.sol";
import "./Referral.sol";

/**
  * @title OpenLevV1
  * @author OpenLeverage
  */
contract OpenLevV1 is DelegateInterface, OpenLevInterface, OpenLevStorage, Adminable, DexCaller, ReentrancyGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;
    using Address for address;

    constructor ()
    {
    }

    function initialize(
        address _controller,
        address _treasury,
        PriceOracleInterface _priceOracle,
        IUniswapV2Factory _uniswapFactory,
        ReferralInterface _referral
    ) public {
        require(msg.sender == admin, "Not admin");
        treasury = _treasury;
        priceOracle = _priceOracle;
        controller = _controller;
        uniswapFactory = _uniswapFactory;
        referral = _referral;
    }

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint32 marginRatio
    ) external override returns (uint16) {
        require(msg.sender == address(controller), "Creating market is only allowed by controller");
        require(marginRatio >= defaultMarginRatio, "Margin ratio is lower then the default limit");
        require(marginRatio < 100000, "Highest margin ratio is 1000%");
        uint16 marketId = numPairs;
        markets[marketId] = Types.Market(pool0, pool1, marginRatio, 0, 0);
        // todo fix the temporary approve
        IERC20(pool0.underlying()).approve(address(pool0), uint256(- 1));
        IERC20(pool1.underlying()).approve(address(pool1), uint256(- 1));
        numPairs ++;
        return marketId;
    }

    function token0(uint16 marketId) external view override returns (address) {
        return markets[marketId].pool0.underlying();
    }

    function token1(uint16 marketId) external view override returns (address) {
        return markets[marketId].pool1.underlying();
    }

    function pool1Available(uint16 marketId) external override view returns (uint) {
        return markets[marketId].pool1.availableForBorrow();
    }

    function pool0Available(uint16 marketId) external override view returns (uint) {
        return markets[marketId].pool0.availableForBorrow();
    }

    function marginTrade(
        uint16 marketId,
        bool longToken,
        bool depositToken,
        uint deposit,
        uint borrow,
        uint minBuyAmount,
        address referrer
    ) external override nonReentrant {

        require(msg.sender != referrer, "Trader referrer same addr");

        Types.MarketVars memory vars = toMarketVar(marketId, longToken, true);

        uint minimalDeposit = depositToken != longToken ? 10 ** (ERC20(vars.sellPool.underlying()).decimals() - 4)
        : 10 ** (ERC20(vars.buyPool.underlying()).decimals() - 4);
        // 0.0001

        require(deposit > minimalDeposit, "Deposit smaller than minimal amount");
        require(vars.sellPool.availableForBorrow() >= borrow, "Insufficient balance to borrow");

        Types.TradeVars memory tv;

        if (depositToken != longToken) {
            tv.depositErc20 = vars.sellToken;
            tv.depositErc20.safeTransferFrom(msg.sender, address(this), deposit);
            tv.fees = feesAndInsurance(deposit.add(borrow), address(tv.depositErc20), marketId, referrer);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = tv.depositAfterFees.add(borrow);
            require(borrow == 0 || deposit.mul(10000).div(borrow) > vars.marginRatio, "Margin ratio limit not met");
        } else {
            (uint currentPrice, uint8 decimals) = priceOracle.getPrice(address(vars.sellToken), address(vars.buyToken));
            uint borrowValue = borrow.mul(currentPrice).div(10 ** uint(decimals));
            tv.depositErc20 = vars.buyToken;
            tv.depositErc20.safeTransferFrom(msg.sender, address(this), deposit);
            tv.fees = feesAndInsurance(deposit.add(borrowValue), address(tv.depositErc20), marketId, referrer);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = borrow;
            require(borrow == 0 || deposit.mul(10000).div(borrowValue) > vars.marginRatio, "Margin ratio limit not met");
        }

        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        require(trade.lastBlockNum != block.number, "Trade can't be handled twice in same block");
        trade.lastBlockNum = block.number;
        //        require(trade.liqBlockNum == 0, "Trade must not in liquidating state");
        //reset liquidate status
        if (trade.liqMarker != address(0)) {
            trade.liqMarker = address(0);
            trade.liqBlockNum = 0;
        }
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
            tv.newHeld = flashSell(address(vars.buyToken), address(vars.sellToken), tv.tradeSize, minBuyAmount);
        }

        (uint settlePrice, uint8 buyTokenDecimals) = priceOracle.getPrice(address(vars.buyToken), address(vars.sellToken));

        if (depositToken == longToken) {
            tv.newHeld = tv.newHeld.add(tv.depositAfterFees);
        }

        // Record trade
        if (trade.held == 0) {
            trade.deposited = tv.depositAfterFees;
            trade.held = tv.newHeld;
            trade.marketValueOpen = depositToken != longToken ? tv.depositAfterFees.add(borrow) : tv.newHeld.mul(settlePrice).div(10 ** uint(buyTokenDecimals));
            trade.depositFixedValue = depositToken != longToken ? tv.depositAfterFees : tv.depositAfterFees.mul(settlePrice).div(10 ** uint(buyTokenDecimals));
        } else {
            trade.deposited = trade.deposited.add(tv.depositAfterFees);
            trade.held = trade.held.add(tv.newHeld);

            trade.marketValueOpen = depositToken != longToken ? tv.depositAfterFees.add(borrow).add(trade.marketValueOpen)
            : tv.newHeld.mul(settlePrice).div(10 ** buyTokenDecimals).add(trade.marketValueOpen);

            trade.depositFixedValue = depositToken != longToken ? tv.depositAfterFees.add(trade.depositFixedValue)
            : tv.depositAfterFees.mul(settlePrice).div(10 ** buyTokenDecimals).add(trade.depositFixedValue);
        }

        emit MarginTrade(msg.sender, marketId, longToken, depositToken, deposit, borrow, tv.newHeld, tv.fees, settlePrice, buyTokenDecimals);
    }

    function closeTrade(uint16 marketId, bool longToken, uint closeAmount, uint minAmount) external override nonReentrant {
        // close trade on exchange
        (uint current, uint limit) = marginRatioInternal(msg.sender, marketId, longToken, 0);
        require(current > limit, "Margin ratio is lower than limit, liquidation only");

        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        require(trade.lastBlockNum != block.number, "Trade can't be handled twice in same block");
        trade.lastBlockNum = block.number;
        require(trade.held != 0, "Invalid MarketId or TradeId or LongToken");
        require(closeAmount <= trade.held, "Close amount exceed held amount");

        uint closeRatio = closeAmount.mul(10000).div(trade.held);
        Types.MarketVars memory vars = toMarketVar(marketId, longToken, false);
        uint fees = feesAndInsurance(closeAmount, address(vars.sellToken), marketId, address(0));

        // repay the loan
        uint repayAmount = vars.buyPool.borrowBalanceCurrent(msg.sender);
        if (trade.depositToken != longToken) {
            uint remaining = flashSell(vars.buyPool.underlying(), vars.sellPool.underlying(), closeAmount.sub(fees), minAmount);
            if (closeAmount != trade.held) {//partial close
                repayAmount = repayAmount.mul(closeRatio).div(10000);
                vars.buyPool.repayBorrowBehalf(msg.sender, repayAmount);
                uint repayDeposit = remaining.sub(repayAmount);
                trade.deposited = trade.deposited.sub(repayDeposit);
                vars.buyToken.safeTransfer(msg.sender, repayDeposit);
            } else {// full close
                if (remaining >= repayAmount) {
                    vars.buyPool.repayBorrowBehalf(msg.sender, repayAmount);
                    vars.buyToken.safeTransfer(msg.sender, remaining.sub(repayAmount));
                } else {
                    // add insurance
                    repayAmount = remaining;
                    vars.buyPool.repayBorrowBehalf(msg.sender, repayAmount);
                }
            }
        } else {// trade.depositToken == longToken
            if (closeAmount != trade.held) {//partial close
                repayAmount = repayAmount.mul(closeRatio).div(10000);
                uint sellAmount = flashBuy(vars.buyPool.underlying(), vars.sellPool.underlying(), repayAmount, closeAmount);
                vars.buyPool.repayBorrowBehalf(msg.sender, repayAmount);
                uint repayDeposit = closeAmount.sub(sellAmount).sub(fees);
                trade.deposited = trade.deposited.sub(repayDeposit);
                vars.sellToken.safeTransfer(msg.sender, repayDeposit);
            } else {// full close
                uint sellAmount = flashBuy(vars.buyPool.underlying(), vars.sellPool.underlying(), repayAmount, closeAmount);
                vars.buyPool.repayBorrowBehalf(msg.sender, repayAmount);
                if (closeAmount > sellAmount) {
                    vars.sellToken.safeTransfer(msg.sender, closeAmount.sub(sellAmount).sub(fees));
                }
            }
        }

        if (trade.held.sub(closeAmount) == 0) {
            delete activeTrades[msg.sender][marketId][longToken];
        } else {
            trade.held = trade.held.sub(closeAmount);
            uint remainRatio = 10000 - closeRatio;
            trade.marketValueOpen = trade.marketValueOpen.mul(remainRatio).div(10000);
            trade.depositFixedValue = trade.depositFixedValue.mul(remainRatio).div(10000);
        }

        (uint settlePrice, uint8 priceDecimals) = priceOracle.getPrice(address(vars.buyToken), address(vars.sellToken));

        emit TradeClosed(msg.sender, marketId, longToken, closeAmount, settlePrice, priceDecimals);
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
        vars.marginRatio = market.marginRatio;

        return vars;
    }

    function getActiveTrade(address owner, uint16 marketId, bool longToken) external override view returns (Types.Trade memory) {
        return activeTrades[owner][marketId][longToken];
    }

    function marginRatio(address owner, uint16 marketId, bool longToken) external override view returns (uint current, uint32 marketLimit) {
        return marginRatioInternal(owner, marketId, longToken, 0);
    }

    function marginRatioInternal(address owner, uint16 marketId, bool longToken, uint closeAmount)
    internal view returns (uint current, uint32 marketLimit)
    {
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        require(trade.held != 0, "Invalid marketId or TradeId");
        require(closeAmount <= trade.held, "Close amount exceed held amount");

        Types.MarketVars memory vars = toMarketVar(marketId, longToken, true);
        uint borrowed = vars.sellPool.borrowBalanceCurrent(owner);
        (uint buyTokenPrice, uint8 buyTokenDecimals) = priceOracle.getPrice(address(vars.buyToken), address(vars.sellToken));
        uint marketValueCurrent = trade.held.sub(closeAmount).mul(buyTokenPrice).div(10 ** uint(buyTokenDecimals));

        if (trade.marketValueOpen > marketValueCurrent) {// losing
            uint pnl = trade.marketValueOpen.sub(marketValueCurrent);
            if (trade.depositFixedValue >= pnl) {
                return (trade.depositFixedValue.sub(pnl).mul(10000).div(borrowed), vars.marginRatio);
            } else {
                return (0, vars.marginRatio);
            }
        } else {// gaining
            uint pnl = marketValueCurrent.sub(trade.marketValueOpen);
            return (trade.depositFixedValue.add(pnl).mul(10000).div(borrowed), vars.marginRatio);
        }
    }

    function liqMarker(address owner, uint16 marketId, bool longToken) external override onlyMarginRatioLessThanLimit(owner, marketId, longToken) {
        Types.Trade storage trade = activeTrades[owner][marketId][longToken];
        require(trade.lastBlockNum != block.number, "Trade can't be handled twice in same block");
        trade.lastBlockNum = block.number;
        require(trade.liqMarker == address(0), "Trade's already been marked liquidating");
        trade.liqMarker = msg.sender;
        trade.liqBlockNum = block.number;

        Types.MarketVars memory vars = toMarketVar(marketId, longToken, false);
        (uint256 price, uint8 priceDecimals) = priceOracle.getPrice(address(vars.buyToken), address(vars.sellToken));

        emit LiquidationMarker(owner, marketId, longToken, msg.sender, price, priceDecimals);
    }

    function liqMarkerReset(address owner, uint16 marketId, bool longToken) external override {
        Types.Trade storage trade = activeTrades[owner][marketId][longToken];
        require(trade.lastBlockNum != block.number, "Trade can't be handled twice in same block");
        trade.lastBlockNum = block.number;
        require(trade.liqMarker != address(0), "Trade's not marked liquidating");

        (uint current, uint limit) = marginRatioInternal(owner, marketId, longToken, 0);
        require(current >= limit, "Current ratio is less than limit");
        address liqMarkerPrior = trade.liqMarker;
        trade.liqMarker = address(0);
        trade.liqBlockNum = 0;

        Types.MarketVars memory vars = toMarketVar(marketId, longToken, false);
        (uint256 price, uint8 priceDecimals) = priceOracle.getPrice(address(vars.buyToken), address(vars.sellToken));

        emit LiquidationMarkerReset(owner, marketId, longToken, liqMarkerPrior, msg.sender, price, priceDecimals);
    }

    function liquidate(address owner, uint16 marketId, bool longToken) external override onlyMarginRatioLessThanLimit(owner, marketId, longToken) nonReentrant {
        Types.LiquidateVars memory liquidateVars;
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        require(trade.lastBlockNum != block.number, "Trade can't be handled twice in same block");
        trade.lastBlockNum = block.number;
        Types.MarketVars memory closeVars = toMarketVar(marketId, longToken, false);
        Types.Market storage market = markets[marketId];
        require(trade.liqMarker != address(0), "Trade should've been marked");
        require(trade.liqBlockNum != block.number, "Should not be marked and liq in same block");
        require(trade.held != 0, "Invalid MarketId or TradeId or LongToken");

        (liquidateVars.settlePrice, liquidateVars.priceDecimals) = priceOracle.getPrice(address(closeVars.buyToken), address(closeVars.sellToken));

        liquidateVars.fees = feesAndInsurance(trade.held, address(closeVars.sellToken), marketId, address(0));
        liquidateVars.remaining = flashSell(closeVars.buyPool.underlying(), closeVars.sellPool.underlying(), trade.held.sub(liquidateVars.fees), 0);

        // repay the loan
        if (liquidateVars.remaining > liquidateVars.borrowed) {
            closeVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
            closeVars.buyToken.safeTransfer(owner, liquidateVars.remaining.sub(liquidateVars.borrowed));
        } else if (liquidateVars.remaining == liquidateVars.borrowed) {
            closeVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
        } else {// remaining < repayment
            uint needed = liquidateVars.borrowed.sub(liquidateVars.remaining);
            if (longToken) {
                if (market.pool0Insurance >= needed) {
                    market.pool0Insurance = market.pool0Insurance.sub(needed);
                } else {
                    market.pool0Insurance = 0;
                    liquidateVars.borrowed = liquidateVars.borrowed.sub(needed.sub(market.pool0Insurance));
                }
            } else {
                if (market.pool1Insurance >= needed) {
                    market.pool1Insurance = market.pool1Insurance.sub(needed);
                } else {
                    market.pool1Insurance = 0;
                    liquidateVars.borrowed = liquidateVars.borrowed.sub(needed.sub(market.pool1Insurance));
                }
            }
            closeVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
        }

        //controller
        (OpenLevControllerInterface(controller)).liquidateAllowed(marketId, trade.liqMarker, msg.sender, trade.held);
        emit Liquidation(owner, marketId, longToken, trade.held, trade.liqMarker, msg.sender, liquidateVars.settlePrice, liquidateVars.priceDecimals);
        delete activeTrades[owner][marketId][longToken];
    }

    function feesAndInsurance(uint tradeSize, address token, uint16 marketId, address referrer) internal returns (uint) {
        Types.Market storage market = markets[marketId];
        uint fees = tradeSize.mul(feesRate).div(10000);
        uint newInsurance = fees.mul(insuranceRatio).div(100);
        uint referralReward = 0;
        if (address(referral) != address(0)) {
            referralReward = referral.calReferralReward(msg.sender, referrer, fees, token);
            if (referralReward != 0) {
                IERC20(token).transfer(address(referral), referralReward);
            }
        }
        IERC20(token).transfer(treasury, fees.sub(newInsurance).sub(referralReward));
        if (token == market.pool1.underlying()) {
            market.pool1Insurance = market.pool1Insurance.add(newInsurance);
        } else {
            market.pool0Insurance = market.pool0Insurance.add(newInsurance);
        }
        return fees;
    }

    /*** Admin Functions ***/

    function setDefaultMarginRatio(uint32 newRatio) external override onlyAdmin() {
        uint32 oldRatio = defaultMarginRatio;
        defaultMarginRatio = newRatio;
        emit NewDefaultMarginRatio(oldRatio, newRatio);
    }

    function setMarketMarginLimit(uint16 marketId, uint32 newRatio) external override onlyAdmin() {
        uint32 oldRatio = markets[marketId].marginRatio;
        markets[marketId].marginRatio = newRatio;
        emit NewMarketMarginLimit(marketId, oldRatio, newRatio);
    }

    function setFeesRate(uint newRate) external override onlyAdmin() {
        uint oldFeesRate = feesRate;
        feesRate = newRate;
        emit NewFeesRate(oldFeesRate, feesRate);
    }

    function setInsuranceRatio(uint8 newRatio) external override onlyAdmin() {
        insuranceRatio = newRatio;
    }

    function setController(address newController) external override onlyAdmin() {
        controller = newController;
    }

    function setPriceOracle(PriceOracleInterface newPriceOracle) external override onlyAdmin() {
        priceOracle = newPriceOracle;
    }

    function setUniswapFactory(IUniswapV2Factory _uniswapFactory) external override onlyAdmin() {
        uniswapFactory = _uniswapFactory;
    }

    function setReferral(ReferralInterface _referral) external override onlyAdmin() {
        referral = _referral;
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

    modifier onlyMarginRatioLessThanLimit(address owner, uint16 marketId, bool longToken) {
        (uint current, uint limit) = marginRatioInternal(owner, marketId, longToken, 0);
        require(current < limit, "Current ratio is higher than limit");
        _;
    }

}

interface OpenLevControllerInterface {
    function liquidateAllowed(uint marketId, address liqMarker, address liquidator, uint liquidateAmount) external;
}
