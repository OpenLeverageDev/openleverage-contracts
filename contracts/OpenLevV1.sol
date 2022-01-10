// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./OpenLevInterface.sol";
import "./Types.sol";
import "./Adminable.sol";
import "./DelegateInterface.sol";
import "./ControllerInterface.sol";
import "./IWETH.sol";
import "./XOLEInterface.sol";
import "./Types.sol";
import "./OpenLevV1Lib.sol";

/**
  * @title OpenLevV1
  * @author OpenLeverage
  */
contract OpenLevV1 is DelegateInterface, Adminable, ReentrancyGuard, OpenLevInterface, OpenLevStorage {
    using SafeMath for uint;
    using TransferHelper for IERC20;
    using DexData for bytes;

    constructor ()
    {
    }

    function initialize(
        address _controller,
        DexAggregatorInterface _dexAggregator,
        address[] memory depositTokens,
        address _wETH,
        address _xOLE,
        uint8[] memory _supportDexs
    ) public {
        require(msg.sender == admin, "NAD");
        addressConfig.controller = _controller;
        addressConfig.dexAggregator = _dexAggregator;
        addressConfig.wETH = _wETH;
        addressConfig.xOLE = _xOLE;
        for (uint i = 0; i < _supportDexs.length; i++) {
            supportDexs[_supportDexs[i]] = true;
        }
        OpenLevV1Lib.setCalculateConfigInternal(22, 33, 2500, 5, 25, 25, 5000e18, 500, 5, 60, calculateConfig);
    }

    function addMarket(
        LPoolInterface pool0,
        LPoolInterface pool1,
        uint16 marginLimit,
        bytes memory dexData
    ) external override returns (uint16) {
        uint16 marketId = numPairs;
        OpenLevV1Lib.addMarket(pool0, pool1, marginLimit, dexData, marketId, markets, calculateConfig, addressConfig, supportDexs);
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
    ) external payable override nonReentrant onlySupportDex(dexData) {
        // Check if the market is enabled for trading
        Types.MarketVars memory vars = toMarketVar(longToken, true, markets[marketId]);
        verifyTrade(vars, marketId, longToken, depositToken, deposit, borrow, dexData);
        (ControllerInterface(addressConfig.controller)).marginTradeAllowed(marketId);

        if (dexData.isUniV2Class()) {
            OpenLevV1Lib.updatePriceInternal(address(vars.buyToken), address(vars.sellToken), dexData);
        }
        uint balance = vars.buyToken.balanceOf(address(this));

        // Borrow
        uint borrowed;
        if (borrow > 0) {
            borrowed = vars.sellPool.borrowBehalf(msg.sender, borrow);
        }

        Types.TradeVars memory tv;
        tv.dexDetail = dexData.toDexDetail();
        // if deposit token is NOT the same as the long token
        if (depositToken != longToken) {
            tv.depositErc20 = vars.sellToken;
            deposit = transferIn(msg.sender, tv.depositErc20, deposit);
            tv.fees = feesAndInsurance(msg.sender, deposit.add(borrowed), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = tv.depositAfterFees.add(borrowed);
            require(borrow == 0 || deposit.mul(10000).div(borrowed) > vars.marginLimit, "MAM");
        } else {
            if (borrow > 0) {
                (uint currentPrice, uint8 priceDecimals) = addressConfig.dexAggregator.getPrice(address(vars.sellToken), address(vars.buyToken), dexData);
                tv.borrowValue = borrowed.mul(currentPrice).div(10 ** uint(priceDecimals));
            }
            tv.depositErc20 = vars.buyToken;
            deposit = transferIn(msg.sender, tv.depositErc20, deposit);
            tv.fees = feesAndInsurance(msg.sender, deposit.add(tv.borrowValue), address(tv.depositErc20), marketId);
            tv.depositAfterFees = deposit.sub(tv.fees);
            tv.tradeSize = borrowed;
            require(borrow == 0 || deposit.mul(10000).div(tv.borrowValue) > vars.marginLimit, "MAM");
        }

        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        trade.lastBlockNum = uint128(block.number);
        trade.depositToken = depositToken;

        // Trade in exchange
        if (tv.tradeSize > 0) {
            tv.newHeld = flashSell(address(vars.buyToken), address(vars.sellToken), tv.tradeSize, minBuyAmount, dexData);
            tv.token0Price = longToken ? tv.newHeld.mul(1e18).div(tv.tradeSize) : tv.tradeSize.mul(1e18).div(tv.newHeld);
        }

        if (depositToken == longToken) {
            tv.newHeld = tv.newHeld.add(tv.depositAfterFees);
        }

        // saving shares not token amount of the pool
        tv.newHeld = totalHelds[address(vars.buyToken)] > 0 ? totalHelds[address(vars.buyToken)].mul(tv.newHeld) / balance : tv.newHeld;
        trade.deposited = trade.deposited.add(tv.depositAfterFees);
        trade.held = trade.held.add(tv.newHeld);
        totalHelds[address(vars.buyToken)] = totalHelds[address(vars.buyToken)].add(tv.newHeld);

        //verify
        balance = vars.buyToken.balanceOf(address(this));
        require(OpenLevV1Lib.isPositionHealthy(
                msg.sender,
                true,
                trade.held.mul(balance) / totalHelds[address(vars.buyToken)],
                vars,
                dexData
            ), "PNH");

        emit MarginTrade(msg.sender, marketId, longToken, depositToken, deposit, borrow, tv.newHeld, tv.fees, tv.token0Price, tv.dexDetail);
    }

    function closeTrade(uint16 marketId, bool longToken, uint closeHeld, uint minOrMaxAmount, bytes memory dexData) external override nonReentrant onlySupportDex(dexData) {
        // revert("debug");
        Types.Trade storage trade = activeTrades[msg.sender][marketId][longToken];
        Types.MarketVars memory marketVars = toMarketVar(longToken, false, markets[marketId]);
        //verify
        uint closeAmount = closeHeld.mul(marketVars.sellToken.balanceOf(address(this))) / totalHelds[address(marketVars.sellToken)];
        verifyCloseBefore(trade, marketVars, closeAmount, dexData);
        trade.lastBlockNum = uint128(block.number);
        Types.CloseTradeVars memory closeTradeVars;
        closeTradeVars.closeRatio = closeHeld.mul(1e18).div(trade.held);
        closeTradeVars.isPartialClose = closeHeld != trade.held ? true : false;
        closeTradeVars.fees = feesAndInsurance(msg.sender, closeAmount, address(marketVars.sellToken), marketId);
        closeTradeVars.closeAmountAfterFees = closeAmount.sub(closeTradeVars.fees);
        closeTradeVars.repayAmount = marketVars.buyPool.borrowBalanceCurrent(msg.sender);
        closeTradeVars.dexDetail = dexData.toDexDetail();

        //partial close
        if (closeTradeVars.isPartialClose) {
            closeTradeVars.repayAmount = closeTradeVars.repayAmount.mul(closeTradeVars.closeRatio).div(1e18);
            trade.held = trade.held.sub(closeHeld);
            closeTradeVars.depositDecrease = trade.deposited.mul(closeTradeVars.closeRatio).div(1e18);
            trade.deposited = trade.deposited.sub(closeTradeVars.depositDecrease);
        } else {
            closeTradeVars.depositDecrease = trade.deposited;
        }

        totalHelds[address(marketVars.sellToken)] = totalHelds[address(marketVars.sellToken)].sub(closeHeld);
        uint24[] memory transferFeeRates = dexData.toTransferFeeRates();

        if (trade.depositToken != longToken) {
            closeTradeVars.receiveAmount = flashSell(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.closeAmountAfterFees, minOrMaxAmount, dexData);
            uint repayAmount = DexData.toAmountBeforeTax(closeTradeVars.repayAmount, transferFeeRates[0]);
            require(closeTradeVars.receiveAmount >= repayAmount, 'LON');
            closeTradeVars.sellAmount = closeTradeVars.closeAmountAfterFees;
            marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
            closeTradeVars.depositReturn = closeTradeVars.receiveAmount.sub(closeTradeVars.repayAmount);
            doTransferOut(msg.sender, marketVars.buyToken, closeTradeVars.depositReturn);
        } else {
            uint repayAmount = DexData.toAmountBeforeTax(closeTradeVars.repayAmount, transferFeeRates[0]);
            repayAmount = DexData.toAmountBeforeTax(closeTradeVars.repayAmount, transferFeeRates[0]);
            closeTradeVars.sellAmount = flashBuy(address(marketVars.buyToken), address(marketVars.sellToken), closeTradeVars.repayAmount, closeTradeVars.closeAmountAfterFees, dexData);
            require(minOrMaxAmount >= closeTradeVars.sellAmount, 'BLM');
            closeTradeVars.receiveAmount = closeTradeVars.repayAmount;
            marketVars.buyPool.repayBorrowBehalf(msg.sender, closeTradeVars.repayAmount);
            closeTradeVars.depositReturn = closeTradeVars.closeAmountAfterFees.sub(closeTradeVars.sellAmount);
            doTransferOut(msg.sender, marketVars.sellToken, closeTradeVars.depositReturn);
        }
        if (!closeTradeVars.isPartialClose) {
            delete activeTrades[msg.sender][marketId][longToken];
        }
        closeTradeVars.token0Price = longToken ? closeTradeVars.sellAmount.mul(1e18).div(closeTradeVars.receiveAmount) : closeTradeVars.receiveAmount.mul(1e18).div(closeTradeVars.sellAmount);
        if (dexData.isUniV2Class()) {
            OpenLevV1Lib.updatePriceInternal(address(marketVars.buyToken), address(marketVars.sellToken), dexData);
        }
        emit TradeClosed(msg.sender, marketId, longToken, trade.depositToken, closeAmount, closeTradeVars.depositDecrease, closeTradeVars.depositReturn, closeTradeVars.fees,
            closeTradeVars.token0Price, closeTradeVars.dexDetail);
    }

    function liquidate(address owner, uint16 marketId, bool longToken, uint minBuy, uint maxSell, bytes memory dexData) external override nonReentrant onlySupportDex(dexData) {
        Types.Trade memory trade = activeTrades[owner][marketId][longToken];
        Types.MarketVars memory marketVars = toMarketVar(longToken, false, markets[marketId]);
        if (dexData.isUniV2Class()) {
            OpenLevV1Lib.updatePriceInternal(address(marketVars.buyToken), address(marketVars.sellToken), dexData);
        }

        uint balanceBefore = IERC20(marketVars.sellToken).balanceOf(address(this));

        Types.LiquidateVars memory liquidateVars;
        {
            uint closeAmount = trade.held.mul(balanceBefore) / totalHelds[address(marketVars.sellToken)];
            //verify
            verifyCloseOrLiquidateBefore(closeAmount, trade.lastBlockNum, marketVars.dexs, dexData.toDexDetail());
            //controller
            (ControllerInterface(addressConfig.controller)).liquidateAllowed(marketId, msg.sender, closeAmount, dexData);
            require(!OpenLevV1Lib.isPositionHealthy(owner, false, closeAmount, marketVars, dexData), "PIH");

            liquidateVars.dexDetail = dexData.toDexDetail();
            liquidateVars.remainAmountAfterFees = closeAmount.mul(marketVars.sellToken.balanceOf(address(this))).div(totalHelds[address(marketVars.sellToken)]);
            liquidateVars.fees = feesAndInsurance(owner, closeAmount, address(marketVars.sellToken), marketId);
            liquidateVars.borrowed = marketVars.buyPool.borrowBalanceCurrent(owner);
            //penalty
            liquidateVars.penalty = closeAmount.mul(calculateConfig.penaltyRatio).div(10000);
            if (liquidateVars.penalty > 0) {
                doTransferOut(msg.sender, marketVars.sellToken, liquidateVars.penalty);
            }

            liquidateVars.remainAmountAfterFees = liquidateVars.remainAmountAfterFees.sub(liquidateVars.fees).sub(liquidateVars.penalty);
        }

        {
            bool buySuccess;
            bytes memory sellAmountData;

            if (longToken == trade.depositToken) {
                if (maxSell < liquidateVars.remainAmountAfterFees) {
                    marketVars.sellToken.safeApprove(address(addressConfig.dexAggregator), liquidateVars.remainAmountAfterFees);
                    (buySuccess, sellAmountData) = address(addressConfig.dexAggregator).call(
                        abi.encodeWithSignature("buy(address,address,uint,uint,bytes)", address(marketVars.buyToken), address(marketVars.sellToken), liquidateVars.borrowed, liquidateVars.remainAmountAfterFees, dexData)
                    );
                } else {
                    marketVars.sellToken.safeApprove(address(addressConfig.dexAggregator), maxSell);
                    (buySuccess, sellAmountData) = address(addressConfig.dexAggregator).call(
                        abi.encodeWithSignature("buy(address,address,uint,uint,bytes)", address(marketVars.buyToken), address(marketVars.sellToken), liquidateVars.borrowed, maxSell, dexData)
                    );
                }
            }

            if (buySuccess) {
                {
                    uint temp;
                    assembly {
                        temp := mload(add(sellAmountData, add(0x20, 32)))
                    }
                    liquidateVars.sellAmount = temp;

                    uint closeAmount = trade.held.mul(balanceBefore) / totalHelds[address(marketVars.sellToken)];
                    uint boughtAmount = marketVars.buyToken.balanceOf(address(this)).sub(balanceBefore);
                    require(closeAmount.sub(liquidateVars.borrowed).mul(boughtAmount).div(liquidateVars.sellAmount).div(liquidateVars.sellAmount) <= marketVars.marginLimit, "PH");

                    liquidateVars.receiveAmount = liquidateVars.borrowed;
                }
                marketVars.buyPool.repayBorrowBehalf(owner, liquidateVars.borrowed);
                liquidateVars.depositReturn = liquidateVars.remainAmountAfterFees.sub(liquidateVars.sellAmount);
                doTransferOut(owner, marketVars.sellToken, liquidateVars.depositReturn);
            } else {
                liquidateVars.sellAmount = liquidateVars.remainAmountAfterFees;
                liquidateVars.receiveAmount = flashSell(address(marketVars.buyToken), address(marketVars.sellToken), liquidateVars.sellAmount, minBuy, dexData);
                require(liquidateVars.receiveAmount < liquidateVars.borrowed, "SB");
                uint finalRepayAmount = reduceInsurance(liquidateVars.borrowed, liquidateVars.receiveAmount, marketId, longToken);
                liquidateVars.outstandingAmount = liquidateVars.borrowed.sub(finalRepayAmount);
                marketVars.buyPool.repayBorrowEndByOpenLev(owner, finalRepayAmount);

                // doTransferOut(owner, marketVars.buyToken, liquidateVars.depositReturn);
            }
        }

        liquidateVars.token0Price = longToken ? liquidateVars.sellAmount.mul(1e18).div(liquidateVars.receiveAmount) : liquidateVars.receiveAmount.mul(1e18).div(liquidateVars.sellAmount);

        emit Liquidation(owner, marketId, longToken, trade.depositToken, trade.held, liquidateVars.outstandingAmount, msg.sender,
            trade.deposited, liquidateVars.depositReturn, liquidateVars.fees, liquidateVars.token0Price, liquidateVars.penalty, liquidateVars.dexDetail);

        totalHelds[address(marketVars.sellToken)] = totalHelds[address(marketVars.sellToken)].sub(trade.held);
        delete activeTrades[owner][marketId][longToken];
    }

    function toMarketVar(bool longToken, bool open, Types.Market storage market) internal view returns (Types.MarketVars memory) {
        return open == longToken ?
        Types.MarketVars(
            market.pool1,
            market.pool0,
            IERC20(market.token1),
            IERC20(market.token0),
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
            market.pool0Insurance,
            market.pool1Insurance,
            market.marginLimit,
            market.priceDiffientRatio,
            market.dexs);
    }

    function marginRatio(address owner, uint16 marketId, bool longToken, bytes memory dexData) external override onlySupportDex(dexData) view returns (uint current, uint cAvg, uint hAvg, uint32 limit) {
        Types.MarketVars memory vars = toMarketVar(longToken, false, markets[marketId]);
        limit = vars.marginLimit;
        (current, cAvg, hAvg,,) =
        OpenLevV1Lib.marginRatio(
            owner,
            activeTrades[owner][marketId][longToken].held,
            address(vars.sellToken),
            address(vars.buyToken),
            vars.buyPool,
            false,
            dexData
        );
    }

    function updatePrice(uint16 marketId, bytes memory dexData) external override {
        OpenLevV1Lib.updatePrice(marketId, markets[marketId], addressConfig, calculateConfig, dexData);
    }

    function getMarketSupportDexs(uint16 marketId) external override view returns (uint32[] memory){
        return markets[marketId].dexs;
    }

    function reduceInsurance(uint totalRepayment, uint remaining, uint16 marketId, bool longToken) internal returns (uint) {
        return OpenLevV1Lib.reduceInsurance(totalRepayment, remaining, longToken, markets[marketId]);
    }


    function feesAndInsurance(address trader, uint tradeSize, address token, uint16 marketId) internal returns (uint) {
        return OpenLevV1Lib.feesAndInsurance(markets[marketId], calculateConfig, addressConfig.xOLE, trader, tradeSize, token);
    }

    function flashSell(address buyToken, address sellToken, uint sellAmount, uint minBuyAmount, bytes memory data) internal returns (uint){
        DexAggregatorInterface dexAggregator = addressConfig.dexAggregator;
        IERC20(sellToken).safeApprove(address(dexAggregator), sellAmount);
        uint buyAmount = dexAggregator.sell(buyToken, sellToken, sellAmount, minBuyAmount, data);
        return buyAmount;
    }

    function flashBuy(address buyToken, address sellToken, uint buyAmount, uint maxSellAmount, bytes memory data) internal returns (uint){
        DexAggregatorInterface dexAggregator = addressConfig.dexAggregator;
        IERC20(sellToken).safeApprove(address(dexAggregator), maxSellAmount);
        return dexAggregator.buy(buyToken, sellToken, buyAmount, maxSellAmount, data);
    }

    function calBuyAmount(address buyToken, address sellToken, uint sellAmount, bytes memory data) internal view returns (uint){
        return addressConfig.dexAggregator.calBuyAmount(buyToken, sellToken, sellAmount, data);
    }

    function transferIn(address from, IERC20 token, uint amount) internal returns (uint) {
        return OpenLevV1Lib.transferIn(from, token, addressConfig.wETH, amount);
    }

    function doTransferOut(address to, IERC20 token, uint amount) internal {
        OpenLevV1Lib.doTransferOut(to, token, addressConfig.wETH, amount);
    }

    /*** Admin Functions ***/
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
        OpenLevV1Lib.setCalculateConfigInternal(defaultFeesRate, insuranceRatio, defaultMarginLimit, priceDiffientRatio, updatePriceDiscount,
            feesDiscount, feesDiscountThreshold, penaltyRatio, maxLiquidationPriceDiffientRatio, twapDuration, calculateConfig);
        emit NewCalculateConfig(defaultFeesRate, insuranceRatio, defaultMarginLimit, priceDiffientRatio, updatePriceDiscount, feesDiscount, feesDiscountThreshold, penaltyRatio, maxLiquidationPriceDiffientRatio, twapDuration);
    }

    function setAddressConfig(address controller, DexAggregatorInterface dexAggregator) external override onlyAdmin() {
        OpenLevV1Lib.setAddressConfigInternal(controller, dexAggregator, addressConfig);
        emit NewAddressConfig(controller, address(dexAggregator));
    }

    function setMarketConfig(uint16 marketId, uint16 feesRate, uint16 marginLimit, uint16 priceDiffientRatio, uint32[] memory dexs) external override onlyAdmin() {
        OpenLevV1Lib.setMarketConfigInternal(feesRate, marginLimit, priceDiffientRatio, dexs, markets[marketId]);
        emit NewMarketConfig(marketId, feesRate, marginLimit, priceDiffientRatio, dexs);
    }

    function moveInsurance(uint16 marketId, uint8 poolIndex, address to, uint amount) external override nonReentrant() onlyAdmin() {
        OpenLevV1Lib.moveInsurance(poolIndex, to, amount, markets[marketId]);
    }

    function setSupportDex(uint8 dex, bool support) public override onlyAdmin() {
        supportDexs[dex] = support;
    }

    function verifyTrade(Types.MarketVars memory vars, uint16 marketId, bool longToken, bool depositToken, uint deposit, uint borrow, bytes memory dexData) internal view {
        //verify if deposit token allowed
        address depositTokenAddr = depositToken == longToken ? address(vars.buyToken) : address(vars.sellToken);

        //verify minimal deposit > absolute value 0.0001
        uint decimals = ERC20(depositTokenAddr).decimals();
        uint minimalDeposit = decimals > 4 ? 10 ** (decimals - 4) : 1;
        uint actualDeposit = depositTokenAddr == addressConfig.wETH ? msg.value : deposit;
        require(actualDeposit > minimalDeposit, "DTS");

        Types.Trade memory trade = activeTrades[msg.sender][marketId][longToken];
        // New trade
        if (trade.lastBlockNum == 0) {
            require(borrow > 0, "BB0");
            return;
        } else {
            // For new trade, these checks are not needed
            require(depositToken == trade.depositToken && trade.lastBlockNum != uint128(block.number) && OpenLevV1Lib.isInSupportDex(vars.dexs, dexData.toDexDetail()), "DNS");
        }
    }

    function verifyCloseBefore(Types.Trade memory trade, Types.MarketVars memory vars, uint closeHeld, bytes memory dexData) internal view {
        verifyCloseOrLiquidateBefore(trade.held, trade.lastBlockNum, vars.dexs, dexData.toDexDetail());
        require(closeHeld <= trade.held, "CBH");
    }

    function verifyCloseOrLiquidateBefore(uint held, uint lastBlockNumber, uint32[] memory dexs, uint32 dex) internal view {
        require(held != 0 && lastBlockNumber != block.number && OpenLevV1Lib.isInSupportDex(dexs, dex), "HI0");
    }

    modifier onlySupportDex(bytes memory dexData) {
        require(OpenLevV1Lib.isSupportDex(supportDexs, dexData.toDex()), "UDX");
        _;
    }
}
