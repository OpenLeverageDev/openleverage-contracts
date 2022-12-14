const utils = require("./utils/OpenLevUtil");
const {
    Uni2DexData,
    assertThrows,
    getCall1inchData,
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocksAndTime, toBN} = require("./utils/EtheUtil");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");
const TestToken = artifacts.require("MockERC20");
const m = require('mocha-logger');
const OpenLevV1Lib = artifacts.require("OpenLevV1Lib")
const Mock1inchRouter = artifacts.require("Mock1inchRouter");
const LPool = artifacts.require("LPool");


contract("1inch router", async accounts => {

    let admin = accounts[0];
    let trader = accounts[1];
    let dev = accounts[2];
    let openLev;
    let token0;
    let token1;
    let pool0;
    let pool1;
    let controller;
    let pairId = 0;
    let router;
    let weth;
    let deposit = utils.toWei(1);
    let borrow = utils.toWei(1);

    beforeEach(async () => {
        // create contract
        controller = await utils.createController(admin);
        let ole = await TestToken.new('OpenLevERC20', 'OLE');
        token0 = await TestToken.new('TokenA', 'TKA');
        token1 = await TestToken.new('TokenB', 'TKB');
        weth = await utils.createWETH();
        let uniswapFactory = await utils.createUniswapV2Factory();
        await utils.createUniswapV2Pool(uniswapFactory, token0, token1);
        let dexAgg = await utils.createEthDexAgg(uniswapFactory.address, "0x0000000000000000000000000000000000000000", admin);
        xole = await utils.createXOLE(ole.address, admin, dev, dexAgg.address);
        openLevV1Lib = await OpenLevV1Lib.new();
        await OpenLevV1.link("OpenLevV1Lib", openLevV1Lib.address);
        let delegatee = await OpenLevV1.new();
        openLev = await OpenLevDelegator.new(controller.address, dexAgg.address, [token0.address, token1.address], weth.address, xole.address, [1, 2, 21], admin, delegatee.address);
        openLev = await OpenLevV1.at(openLev.address);
        await openLev.setCalculateConfig(30, 33, 3000, 5, 25, 25, (30e18) + '', 300, 10, 60);
        await controller.setOpenLev(openLev.address);
        await controller.setLPoolImplementation((await utils.createLPoolImpl()).address);
        await controller.setInterestParam(toBN(90e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '');
        await dexAgg.setOpenLev(openLev.address);
        await controller.createLPoolPair(token0.address, token1.address, 3000, Uni2DexData);
        router = await Mock1inchRouter.new(dev);
        await openLev.setRouter1inch(router.address);
        await openLev.setMarketConfig(0, 0, 3000, 0, [1, 2, 21]);

        // approve and transfer
        await token0.approve(router.address, utils.toWei(10000000000), {from: dev});
        await token1.approve(router.address, utils.toWei(10000000000), {from: dev});
        await utils.mint(token0, trader, 20000);
        await utils.mint(token1, trader, 20000);
        pool0 = await LPool.at((await openLev.markets(0)).pool0);
        pool1 = await LPool.at((await openLev.markets(0)).pool1);
        await token0.approve(pool0.address, utils.toWei(10000), {from: trader});
        await token0.approve(openLev.address, utils.toWei(10000), {from: trader});
        await token1.approve(pool1.address, utils.toWei(10000), {from: trader});
        await token1.approve(openLev.address, utils.toWei(10000), {from: trader});
        await pool0.mint(utils.toWei(10000), {from: trader});
        await pool1.mint(utils.toWei(10000), {from: trader});
    });

    it("open and close by 1inch, success", async () => {
        let sellAmount = utils.toWei(2);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, token0.address, token1.address, openLev.address, sellAmount.toString(), "1999999999999999999");
        await utils.mint(token1, dev, 2);
        await openLev.marginTrade(pairId, true, false, deposit, borrow, borrow, callData, {from: trader});

        let trade = await openLev.activeTrades(trader, pairId, 1);
        let borrowed = await pool0.borrowBalanceCurrent(trader);
        m.log("after marginTrade ---");
        m.log("current held =", trade.held);
        m.log("current borrowed =", borrowed);
        assert.equal(trade.held.toString(), "1999999999999999999");
        assert.equal(borrowed, "1000000000000000000");

        await advanceMultipleBlocksAndTime(100);
        let closeCallData = getCall1inchData(router, token1.address, token0.address, openLev.address, trade.held.toString(), trade.held.toString());
        await utils.mint(token0, dev, 2);
        await openLev.closeTrade(pairId, true, trade.held, 0, closeCallData, {from: trader});
        let tradeAfter = await openLev.activeTrades(trader, pairId, 1);
        m.log("finish closeTrade, current held = ", tradeAfter.held)
        assert.equal(tradeAfter.held, 0);
        let borrowedAfter = await pool0.borrowBalanceCurrent(trader);
        m.log("current borrowed =", borrowedAfter);
        assert.equal(tradeAfter.held.toString(), 0);
        assert.equal(borrowedAfter, 0);
    })

    it("verify call 1inch data, receive buyToken address is not openLevV1, revert", async () => {
        let sellAmount = utils.toWei(2);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, token0.address, token1.address, trader, sellAmount.toString(), "1999999999999999999");
        await utils.mint(token1, dev, 2);
        await assertThrows(openLev.marginTrade(pairId, true, false, deposit, borrow, borrow, callData, {from: trader}), '1inch: buy amount less than min');
    })

    it("verify call 1inch data, sellToken address is another token, revert", async () => {
        let sellAmount = utils.toWei(2);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, weth.address, token1.address, openLev.address, sellAmount.toString(), "1999999999999999999");
        await utils.mint(token1, dev, 2);
        await assertThrows(openLev.marginTrade(pairId, true, false, deposit, borrow, borrow, callData, {from: trader}), 'sell token error');
    })

    it("verify call 1inch data, buyToken address is another token, revert", async () => {
        let sellAmount = utils.toWei(2);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        await weth.approve(router.address, utils.toWei(10000000000), {from: dev});
        let callData = getCall1inchData(router, token0.address, weth.address, openLev.address, sellAmount.toString(), "1999999999999999999");
        await utils.mint(weth, dev, 2);
        await assertThrows(openLev.marginTrade(pairId, true, false, deposit, borrow, borrow, callData, {from: trader}), '1inch: buy amount less than min');
    })

    it("verify call 1inch data, sellAmount more than actual amount, revert", async () => {
        let sellAmount = utils.toWei(4);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, token0.address, token1.address, openLev.address, sellAmount.toString(), "3999999999999999999");
        await utils.mint(token1, dev, 4);
        await assertThrows(openLev.marginTrade(pairId, true, false, deposit, borrow, borrow, callData, {from: trader}), 'ERC20: transfer amount exceeds balance');
    })

    it("sell by 1inch data,if 1inch revert, then revert with error info", async () => {
        let sellAmount = utils.toWei(2);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, token0.address, token1.address, openLev.address, sellAmount.toString(), "2000000000000000001");
        await utils.mint(token1, dev, 2);
        await assertThrows(openLev.marginTrade(pairId, true, false, deposit, borrow, borrow, callData, {from: trader}), 'ReturnAmountIsNotEnough');
    })

    it("sell by 1inch data, buyAmount less than minBuyAmount, revert", async () => {
        let sellAmount = utils.toWei(2);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, token0.address, token1.address, openLev.address, sellAmount.toString(), "999999999999999999");
        await utils.mint(token1, dev, 1);
        await assertThrows(openLev.marginTrade(pairId, true, false, deposit, borrow, "1999999999999999999", callData, {from: trader}), '1inch: buy amount less than min');
    })

    it("long token = deposit token, close by sell twice, success", async () => {
        let sellAmount = utils.toWei(1);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, token0.address, token1.address, openLev.address, sellAmount.toString(), "999999999999999999");
        await utils.mint(token1, dev, 1);
        await openLev.marginTrade(pairId, true, true, deposit, borrow, "999999999999999999", callData, {from: trader});

        let trade = await openLev.activeTrades(trader, pairId, 1);
        let borrowed = await pool0.borrowBalanceCurrent(trader);
        m.log("after marginTrade ---");
        m.log("current held =", trade.held);
        m.log("current borrowed =", borrowed);
        assert.equal(trade.held.toString(), "1999999999999999999");
        assert.equal(borrowed, "1000000000000000000");

        await advanceMultipleBlocksAndTime(100);
        let closeCallData = getCall1inchData(router, token1.address, token0.address, openLev.address, trade.held.toString(), "1999999999999999999");
        await utils.mint(token0, dev, 2);
        let token1BalanceBefore = await token1.balanceOf(trader);
        await openLev.closeTrade(pairId, true, trade.held, trade.held, closeCallData, {from: trader});
        let token1BalanceAfter =await token1.balanceOf(trader);
        assert.equal(token1BalanceAfter - token1BalanceBefore, "996946527001772000");
        let tradeAfter = await openLev.activeTrades(trader, pairId, 1);
        m.log("finish closeTrade, current held = ", tradeAfter.held)
        assert.equal(tradeAfter.held, 0);
        let borrowedAfter = await pool0.borrowBalanceCurrent(trader);
        m.log("current borrowed =", borrowedAfter);
        assert.equal(tradeAfter.held.toString(), 0);
        assert.equal(borrowedAfter, 0);
    })

    it("long token = deposit token, close by sell twice, fist sell return amount less than buyAmount, revert", async () => {
        let deposit = utils.toWei(1);
        let borrow = utils.toWei(2);
        let sellAmount = utils.toWei(2);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, token0.address, token1.address, openLev.address, sellAmount.toString(), "1999999999999999999");
        await utils.mint(token1, dev, 2);
        await openLev.marginTrade(pairId, true, true, deposit, borrow, "1999999999999999999", callData, {from: trader});

        let trade = await openLev.activeTrades(trader, pairId, 1);
        let borrowed = await pool0.borrowBalanceCurrent(trader);
        m.log("after marginTrade ---");
        m.log("current held =", trade.held);
        m.log("current borrowed =", borrowed);
        assert.equal(trade.held.toString(), "2999999999999999999");
        assert.equal(borrowed, "2000000000000000000");

        await advanceMultipleBlocksAndTime(100);
        let closeCallData = getCall1inchData(router, token1.address, token0.address, openLev.address, trade.held.toString(), "1999999999999999999");
        await utils.mint(token0, dev, 2);
        await assertThrows(openLev.closeTrade(pairId, true, trade.held, trade.held, closeCallData, {from: trader}), 'SafeMath: subtraction overflow');
    })

    it("long token = deposit token, close by sell twice, second sell return amount less than maxSellAmount, revert", async () => {
        let deposit = utils.toWei(2);
        let borrow = utils.toWei(2);
        let sellAmount = utils.toWei(2);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, token0.address, token1.address, openLev.address, sellAmount.toString(), "1999999999999999999");
        await utils.mint(token1, dev, 2);
        await openLev.marginTrade(pairId, true, true, deposit, borrow, "1999999999999999999", callData, {from: trader});

        let trade = await openLev.activeTrades(trader, pairId, 1);
        let borrowed = await pool0.borrowBalanceCurrent(trader);
        m.log("after marginTrade ---");
        m.log("current held =", trade.held);
        m.log("current borrowed =", borrowed);
        assert.equal(trade.held.toString(), "3999999999999999999");
        assert.equal(borrowed, "2000000000000000000");

        await advanceMultipleBlocksAndTime(100);
        let closeCallData = getCall1inchData(router, token1.address, token0.address, openLev.address, trade.held.toString(), "2999999999999999999");
        await utils.mint(token0, dev, 3);
        await assertThrows(openLev.closeTrade(pairId, true, trade.held, "2500000000000000000", closeCallData, {from: trader}), 'buy amount less than min');
    })

    it("liquidate not support 1inch", async () => {
        let sellAmount = utils.toWei(2);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        let callData = getCall1inchData(router, token0.address, token1.address, openLev.address, sellAmount.toString(), "1999999999999999999");
        await utils.mint(token1, dev, 2);
        await openLev.marginTrade(pairId, true, false, deposit, borrow, borrow, callData, {from: trader});

        await assertThrows(openLev.liquidate(trader, pairId, true, 0, utils.maxUint(), callData), 'UDX');
    })

    it("market create default dex not allow 1inch", async () => {
        await assertThrows(controller.createLPoolPair(weth.address, token1.address, 3000, "0x1500000002"), 'UDX');
    })

    it("1inch router address only can modify by admin", async () => {
        await openLev.setRouter1inch(token1.address);
        assert.equal(await openLev.router1inch(), token1.address);
        console.log("1inch router update success by admin.");
        await assertThrows(openLev.setRouter1inch(router.address, {from: trader}), 'caller must be admin');
    })

})