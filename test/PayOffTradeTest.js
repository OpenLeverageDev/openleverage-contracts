const utils = require("./utils/OpenLevUtil");
const {
    last8,
    Uni2DexData,
    assertThrows,
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocksAndTime, toBN} = require("./utils/EtheUtil");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");
const TestToken = artifacts.require("MockERC20");
const m = require('mocha-logger');
const LPool = artifacts.require("LPool");
const OpenLevV1Lib = artifacts.require("OpenLevV1Lib")

contract("OpenLev payoff trade", async accounts => {

    // components
    let openLev;
    let ole;
    let treasury;
    let uniswapFactory;
    let gotPair;
    let dexAgg;
    // roles
    let admin = accounts[0];
    let saver = accounts[1];
    let trader = accounts[2];
    let dev = accounts[3];
    let token0;
    let token1;
    let controller;
    let delegatee;
    let weth;

    beforeEach(async () => {

        // runs once before the first test in this block
        controller = await utils.createController(admin);
        m.log("Created Controller", last8(controller.address));

        ole = await TestToken.new('OpenLevERC20', 'OLE');
        token0 = await TestToken.new('TokenA', 'TKA');
        token1 = await TestToken.new('TokenB', 'TKB');
        weth = await utils.createWETH();

        uniswapFactory = await utils.createUniswapV2Factory();
        gotPair = await utils.createUniswapV2Pool(uniswapFactory, token0, token1);
        dexAgg = await utils.createEthDexAgg(uniswapFactory.address, "0x0000000000000000000000000000000000000000", accounts[0]);
        xole = await utils.createXOLE(ole.address, admin, dev, dexAgg.address);
        openLevV1Lib = await OpenLevV1Lib.new();
        await OpenLevV1.link("OpenLevV1Lib", openLevV1Lib.address);
        delegatee = await OpenLevV1.new();

        openLev = await OpenLevDelegator.new(controller.address, dexAgg.address, [token0.address, token1.address], weth.address, xole.address, [1, 2], accounts[0], delegatee.address);
        openLev = await OpenLevV1.at(openLev.address);
        await openLev.setCalculateConfig(30, 33, 3000, 5, 25, 25, (30e18) + '', 300, 10, 60);
        await controller.setOpenLev(openLev.address);
        await controller.setLPoolImplementation((await utils.createLPoolImpl()).address);
        await controller.setInterestParam(toBN(90e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '');
        await dexAgg.setOpenLev(openLev.address);

        let createPoolTx = await controller.createLPoolPair(token0.address, token1.address, 3000, Uni2DexData); // 30% margin ratio by default
        m.log("Create Market Gas Used: ", createPoolTx.receipt.gasUsed);
    });

    it("current held is zero, transaction fail ", async () => {
        let pairId = 0;
        await utils.mint(token1, trader, 10000);
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(0)).pool1);
        await token1.approve(pool1.address, utils.toWei(10000), {from: trader});
        await token1.approve(openLev.address, utils.toWei(10000), {from: trader});
        await pool1.mint(saverSupply, {from: trader});
        m.log("mint token1 to pool1, amount = ", saverSupply)
        await advanceMultipleBlocksAndTime(1000);
        await openLev.updatePrice(pairId, Uni2DexData);
        m.log("updatePrice ---");

        let deposit = utils.toWei(1);
        let borrow = utils.toWei(1);
        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        let tradeBefore = await openLev.activeTrades(trader, pairId, 0);
        m.log("finish marginTrade, current held = ", tradeBefore.held)
        assert.equal(tradeBefore.held.toString(), "1987978478630008709");

        await openLev.closeTrade(pairId, false, tradeBefore.held, 0, Uni2DexData, {from: trader});
        let tradeAfter = await openLev.activeTrades(trader, 0, 0);
        m.log("finish closeTrade, current held = ", tradeAfter.held)
        assert.equal(tradeAfter.held, 0);
        m.log("start payoffTrade, current held is zero ---")
        await assertThrows(openLev.payoffTrade(pairId, false, {from: trader}), 'HI0');
        m.log("payoffTrade fail --- HI0, test pass.")
    })

    it("not enough to repay current borrow, transaction fail ", async () => {
        let pairId = 0;
        await utils.mint(token1, trader, 1001);
        m.log("mint 1001 amount token1 to trader")
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(0)).pool1);
        await token1.approve(pool1.address, utils.toWei(10000), {from: trader});
        await token1.approve(openLev.address, utils.toWei(10000), {from: trader});
        await pool1.mint(saverSupply, {from: trader});
        m.log("trader mint 1000 token1 to pool1")
        m.log("trader token1 balance = ", utils.toETH(await token1.balanceOf(trader)));
        await advanceMultipleBlocksAndTime(1000);
        await openLev.updatePrice(pairId, Uni2DexData);
        m.log("updatePrice ---");

        let deposit = utils.toWei(1);
        let borrow = utils.toWei(1);
        m.log("start marginTrade, deposit token1 amount = ", utils.toETH(deposit))
        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        m.log("finish marginTrade, trader current token1 balance is ---", utils.toETH(await token1.balanceOf(trader)))
        await assertThrows(openLev.payoffTrade(pairId, false, {from: trader}), 'TFF');
        m.log("payoffTrade fail --- TFF, test pass.")
    })

    it("after payoff trade finished, account current borrow and held is zero, receive held token ", async () => {
        let pairId = 0;
        await utils.mint(token1, trader, 10000);
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(0)).pool1);
        await token1.approve(pool1.address, utils.toWei(10000), {from: trader});
        await token1.approve(openLev.address, utils.toWei(10000), {from: trader});
        await pool1.mint(saverSupply, {from: trader});
        await advanceMultipleBlocksAndTime(1000);
        await openLev.updatePrice(pairId, Uni2DexData);
        m.log("updatePrice ---");

        let deposit = utils.toWei(1);
        let borrow = utils.toWei(1);
        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});

        let tradeBefore = await openLev.activeTrades(trader, pairId, 0);
        let borrowedBefore = utils.toETH(await pool1.borrowBalanceCurrent(trader));
        let token0BalanceBefore = utils.toETH(await token0.balanceOf(trader));
        let token1BalanceBefore = utils.toETH(await token1.balanceOf(trader));
        m.log("before payoffTrade ---");
        m.log("current held =", tradeBefore.held);
        m.log("current borrowed =", borrowedBefore);
        m.log("current token0 balance = ", token0BalanceBefore);
        m.log("current token1 balance = ", token1BalanceBefore);
        assert.equal(tradeBefore.held.toString(), "1987978478630008709");
        assert.equal(borrowedBefore, 1);
        assert.equal(token0BalanceBefore, 0);
        assert.equal(token1BalanceBefore, 8999);

        let payoffTradeTx = await openLev.payoffTrade(pairId, false, {from: trader});

        let tradeAfter = await openLev.activeTrades(trader, 0, 0);
        let borrowedAfter = await pool1.borrowBalanceCurrent(trader);
        let token0BalanceAfter = await token0.balanceOf(trader);
        let token1BalanceAfter = await token1.balanceOf(trader);
        m.log("after payoffTrade ---");
        m.log("current held =", tradeAfter.held);
        m.log("current borrowed =", borrowedAfter);
        m.log("current token0 balance = ", token0BalanceAfter);
        m.log("current token1 balance = ", token1BalanceAfter);
        assert.equal(tradeAfter.held, 0);
        assert.equal(borrowedAfter, 0);
        assert.equal(token0BalanceAfter, 1987978478630008709);
        assert.equal(token1BalanceAfter, 8997999999571870243534);

        console.log("-- check event...");
        let depositToken = payoffTradeTx.logs[0].args.depositToken;
        let depositDecrease = payoffTradeTx.logs[0].args.depositDecrease;
        let closeAmount = payoffTradeTx.logs[0].args.closeAmount;
        assert.equal(depositToken, true);
        assert.equal(depositDecrease.toString(), "994000000000000000");
        assert.equal(closeAmount.toString(), "1987978478630008709");
    })

})