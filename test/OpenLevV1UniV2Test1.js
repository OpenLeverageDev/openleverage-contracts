const utils = require("./utils/OpenLevUtil");
const {
    last8,
    checkAmount,
    printBlockNum,
    Uni2DexData,
    assertPrint, assertThrows,
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocksAndTime, toBN} = require("./utils/EtheUtil");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");
const m = require('mocha-logger');
const LPool = artifacts.require("LPool");
const TestToken = artifacts.require("MockERC20");
const OpenLevV1Lib = artifacts.require("OpenLevV1Lib")

contract("OpenLev UniV2", async accounts => {

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

    let trader2 = accounts[5];

    let dev = accounts[3];
    let liquidator1 = accounts[8];
    let liquidator2 = accounts[9];
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

        assert.equal(3000, (await openLev.markets(0)).marginLimit);

        assert.equal(await openLev.numPairs(), 1, "Should have one active pair");
        m.log("Reset OpenLev instance: ", last8(openLev.address));
    });
    it("Deposit Eth，return eth ", async () => {
        gotPair = await utils.createUniswapV2Pool(uniswapFactory, weth, token1);
        await controller.createLPoolPair(weth.address, token1.address, 3000, Uni2DexData); // 30% margin ratio by default
        let pairId = 1;
        await utils.mint(token1, saver, 10000);
        checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
        let deposit = utils.toWei(1);
        // Saver deposit to pool1
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(1);
        m.log("toBorrow from Pool 1: \t", borrow);
        await advanceMultipleBlocksAndTime(1000);
        let priceData00 = await dexAgg.getPriceCAvgPriceHAvgPrice(weth.address, token1.address, 60, Uni2DexData);
        m.log("priceData00: \t", JSON.stringify(priceData00));
        let updatePrice_tx = await openLev.updatePrice(pairId, Uni2DexData);
        let priceData01 = await dexAgg.getPriceCAvgPriceHAvgPrice(weth.address, token1.address, 60, Uni2DexData);
        m.log("priceData01: \t", JSON.stringify(priceData01));
        m.log("updatePrice gas consumed:", updatePrice_tx.receipt.gasUsed);
        await openLev.marginTrade(pairId, false, false, 0, borrow, 0, Uni2DexData, {from: trader, value: deposit});
        let PriceData02 = await dexAgg.getPriceCAvgPriceHAvgPrice(weth.address, token1.address, 60, Uni2DexData);
        m.log("PriceData02: \t", JSON.stringify(PriceData02));
        let marginRatio = await openLev.marginRatio(trader, pairId, 0, Uni2DexData);
        m.log("Margin Ratio current:", marginRatio.current / 100, "%");
        m.log("Margin Ratio cAvg:", marginRatio.cAvg / 100, "%");
        m.log("Margin Ratio hAvg:", marginRatio.hAvg / 100, "%");
        assert.equal(marginRatio.current.toString(), 9910);
        assert.equal(marginRatio.hAvg.toString(), 9909);
        let tradeBefore = await openLev.activeTrades(trader, pairId, 0);
        m.log("Trade.held:", tradeBefore.held);
        assert.equal(tradeBefore.held, "1990990060009101709");
        let ethBefore = await web3.eth.getBalance(trader);
        await openLev.closeTrade(pairId, false, tradeBefore.held, utils.maxUint(), Uni2DexData, {from: trader});
        let tradeAfter = await openLev.activeTrades(trader, 0, 0);
        m.log("Trade.held:", tradeAfter.held);
        assert.equal(tradeAfter.held, 0);
        let ethAfter = await web3.eth.getBalance(trader);
        m.log("ethBefore=", ethBefore);
        m.log("ethAfter=", ethAfter);
        assert.equal(toBN(ethAfter).gt(toBN(ethBefore)), true);
    })
    it("LONG Token0, Not Init Price ,Not Succeed ", async () => {
        let pairId = 0;
        await printBlockNum();

        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);

        await utils.mint(token1, saver, 10000);
        checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);

        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, deposit, {from: trader});

        // Saver deposit to pool1
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("PriceData0: \t", JSON.stringify(priceData0));
        let borrow = utils.toWei(500);
        m.log("toBorrow from Pool 1: \t", borrow);
        await assertThrows(openLev.marginTrade(0, false, true, deposit, borrow, 0, Uni2DexData, {from: trader}), 'PNH');
    })
    it("LONG Token0, Not Init Price ,60s later Succeed ", async () => {
        let pairId = 0;
        await printBlockNum();

        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);

        await utils.mint(token1, saver, 10000);
        checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);

        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, deposit, {from: trader});

        // Saver deposit to pool1
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("PriceData0: \t", JSON.stringify(priceData0));
        await advanceMultipleBlocksAndTime(100);
        await gotPair.sync();
        let priceData1 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("PriceData0: \t", JSON.stringify(priceData1));
        let borrow = utils.toWei(500);
        await openLev.marginTrade(0, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
    })
    it("LONG Token0, Init Price, Close Succeed ", async () => {
        let pairId = 0;
        await printBlockNum();
        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);

        await utils.mint(token1, saver, 10000);
        checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, deposit, {from: trader});

        // Saver deposit to pool1
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        m.log("toBorrow from Pool 1: \t", borrow);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);
        let priceData2 = await dexAgg.uniV2PriceOracle(gotPair.address);
        m.log("PriceData2: \t", JSON.stringify(priceData2));
        let priceData3 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("PriceData3: \t", JSON.stringify(priceData3));

        let marginTradeTx = await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});

        m.log("V2 Margin Trade Gas Used: ", marginTradeTx.receipt.gasUsed);
        let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("PriceData0: \t", JSON.stringify(priceData0));
        let marginRatio = await openLev.marginRatio(trader, pairId, 0, Uni2DexData);
        assert.equal(marginRatio.current.toString(), 8052);
        assert.equal(marginRatio.hAvg.toString(), 7733);
        let tradeBefore = await openLev.activeTrades(trader, pairId, 0);
        assert.equal(tradeBefore.held, "886675826237735294796");

        let closeTradeTx = await openLev.closeTrade(0, false, tradeBefore.held, 0, Uni2DexData, {from: trader});
        m.log("V2 Close Trade Gas Used: ", closeTradeTx.receipt.gasUsed);

        let tradeAfter = await openLev.activeTrades(trader, pairId, 0);
        m.log("Trade.held:", tradeAfter.held);
        assert.equal(tradeAfter.held, 0);
    })

    it("LONG Token0, advance 1000 blocks, margin ratio updated  ", async () => {
        let pairId = 0;
        await printBlockNum();
        await utils.mint(token1, trader, 10000);
        await utils.mint(token1, saver, 10000);
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, deposit, {from: trader});
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);
        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});

        let marginRatio = await openLev.marginRatio(trader, pairId, 0, Uni2DexData);
        assert.equal(marginRatio.current.toString(), 8052);
        await advanceMultipleBlocksAndTime(1000);
        marginRatio = await openLev.marginRatio(trader, pairId, 0, Uni2DexData);
        assert.equal(marginRatio.current.toString(), 8044);
    })

    it("LONG Token0, Price Diffience>10%, Not update pirce, Long Again", async () => {
        let pairId = 0;
        await printBlockNum();
        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);
        await utils.mint(token1, saver, 10000);
        checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, utils.toWei(100000), {from: trader});
        // Saver deposit to pool1
        let saverSupply = utils.toWei(2000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, saverSupply, {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        await advanceMultipleBlocksAndTime(70);
        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        //set price 1.2
        await gotPair.setPrice(token0.address, token1.address, 120);
        await advanceMultipleBlocksAndTime(70);
        //needn't update price
        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});

    })
    it("LONG Token0, Price Diffience>10%,Update price Long Again", async () => {
        let pairId = 0;
        await printBlockNum();
        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);
        await utils.mint(token1, saver, 10000);
        checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, utils.toWei(100000), {from: trader});
        // Saver deposit to pool1
        let saverSupply = utils.toWei(2000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, saverSupply, {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        await advanceMultipleBlocksAndTime(70);
        await openLev.updatePrice(pairId, Uni2DexData);
        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        //set price 1.2
        await gotPair.setPrice(token0.address, token1.address, 120);

        let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("PriceData0: \t", JSON.stringify(priceData0));

        // add deposit needn't update price
        await openLev.marginTrade(pairId, false, true, deposit, 0, 0, Uni2DexData, {from: trader});
        await advanceMultipleBlocksAndTime(2);
        await openLev.updatePrice(pairId, Uni2DexData);
        let priceData1 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("priceData1: \t", JSON.stringify(priceData1));

        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        let priceData2 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("priceData2: \t", JSON.stringify(priceData2));

        //
        let marginRatio = await openLev.marginRatio(trader, 0, 0, Uni2DexData);
        m.log("Margin Ratio current:", marginRatio.current / 100, "%");
        m.log("Margin Ratio havg:", marginRatio.hAvg / 100, "%");
        assert.equal(marginRatio.current.toString(), 13599);
    })
    it("LONG Token0, Price Diffience>10%, 60s Later, Liquidation", async () => {
        let pairId = 0;
        await printBlockNum();
        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);
        await utils.mint(token1, saver, 10000);
        checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, utils.toWei(100000), {from: trader});
        // Saver deposit to pool1
        let saverSupply = utils.toWei(2000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, saverSupply, {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        await advanceMultipleBlocksAndTime(70);
        await openLev.updatePrice(pairId, Uni2DexData);

        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        await advanceMultipleBlocksAndTime(300);
        //set price 0.5
        await gotPair.setPrice(token0.address, token1.address, 50);
        await advanceMultipleBlocksAndTime(300);
        //set price 0.5
        await gotPair.setPrice(token0.address, token1.address, 50);
        let marginRatio0 = await openLev.marginRatio(trader, pairId, 0, Uni2DexData);
        m.log("Margin Ratio0 current:", marginRatio0.current / 100, "%");
        m.log("Margin Ratio0 cavg:", marginRatio0.cAvg / 100, "%");
        m.log("Margin Ratio0 havg:", marginRatio0.hAvg / 100, "%");
        assert.equal(marginRatio0.current.toString(), 0);
        let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("PriceData0: \t", JSON.stringify(priceData0));

        // should update price first
        await assertThrows(openLev.liquidate(trader, pairId, 0, 0, utils.maxUint(), Uni2DexData, {from: liquidator2}), 'MPT');

        await advanceMultipleBlocksAndTime(3000);
        await gotPair.sync();
        let priceData1 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("priceData1: \t", JSON.stringify(priceData1));
        //
        let marginRatio1 = await openLev.marginRatio(trader, pairId, 0, Uni2DexData);
        m.log("Margin Ratio1 current:", marginRatio1.current / 100, "%");
        m.log("Margin Ratio1 avg:", marginRatio1.cAvg / 100, "%");
        assert.equal(marginRatio1.current, 0);
        let liquidationTx = await openLev.liquidate(trader, pairId, 0, 0, utils.maxUint(), Uni2DexData, {from: liquidator2});
        m.log("V2 Liquidation Gas Used: ", liquidationTx.receipt.gasUsed);
        assertPrint("Deposit Decrease", '397300000000000000000', liquidationTx.logs[0].args.depositDecrease);
        assertPrint("Deposit Return", '0', liquidationTx.logs[0].args.depositReturn);
    })
    it("LONG Token0, Price Diffience>10%,Update Price, Liquidation", async () => {
        let pairId = 0;
        await printBlockNum();
        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);
        await utils.mint(token1, saver, 10000);
        checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, utils.toWei(100000), {from: trader});
        // Saver deposit to pool1
        let saverSupply = utils.toWei(2000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, saverSupply, {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        await advanceMultipleBlocksAndTime(70);
        await openLev.updatePrice(pairId, Uni2DexData);

        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        await advanceMultipleBlocksAndTime(300);
        //set price 0.5
        await gotPair.setPrice(token0.address, token1.address, 50);
        await advanceMultipleBlocksAndTime(300);
        //set price 0.5
        await gotPair.setPrice(token0.address, token1.address, 50);
        let marginRatio0 = await openLev.marginRatio(trader, pairId, 0, Uni2DexData);
        m.log("Margin Ratio0 current:", marginRatio0.current / 100, "%");
        m.log("Margin Ratio0 cavg:", marginRatio0.cAvg / 100, "%");
        m.log("Margin Ratio0 havg:", marginRatio0.hAvg / 100, "%");
        assert.equal(marginRatio0.current.toString(), 0);
        let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("PriceData0: \t", JSON.stringify(priceData0));


        // should update price first
        await assertThrows(openLev.liquidate(trader, pairId, 0, 0, utils.maxUint(), Uni2DexData, {from: liquidator2}), 'MPT');
        await advanceMultipleBlocksAndTime(1000);
        let updatePriceTx = await openLev.updatePrice(pairId, Uni2DexData, {from: accounts[2]});
        m.log("V2 UpdatePrice Gas Used: ", updatePriceTx.receipt.gasUsed);

        assert.equal((await openLev.markets(pairId)).priceUpdater, accounts[2]);
        let priceData1 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 60, Uni2DexData);
        m.log("priceData1: \t", JSON.stringify(priceData1));
        await advanceMultipleBlocksAndTime(1000);
        await gotPair.sync();
        //
        let marginRatio1 = await openLev.marginRatio(trader, pairId, 0, Uni2DexData);
        m.log("Margin Ratio1 current:", marginRatio1.current / 100, "%");
        m.log("Margin Ratio1 avg:", marginRatio1.cAvg / 100, "%");
        assert.equal(marginRatio1.current, 0);
        let liquidationTx = await openLev.liquidate(trader, pairId, 0, 0, utils.maxUint(), Uni2DexData, {from: liquidator2});
        m.log("V2 Liquidation Gas Used: ", liquidationTx.receipt.gasUsed);
        assertPrint("Deposit Decrease", '397300000000000000000', liquidationTx.logs[0].args.depositDecrease);
        assertPrint("Deposit Return", '0', liquidationTx.logs[0].args.depositReturn);

    })
    it("LONG Token0, Update Price, Discount", async () => {
        let pairId = 0;
        await printBlockNum();
        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        await utils.mint(token1, saver, 10000);
        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, deposit, {from: trader});
        // Saver deposit to pool1
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        m.log("toBorrow from Pool 1: \t", borrow);
        await advanceMultipleBlocksAndTime(200);
        await openLev.updatePrice(pairId, Uni2DexData, {from: trader});
        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        let tradeBefore = await openLev.activeTrades(trader, pairId, 0);
        m.log("Trade.held:", tradeBefore.held);
        assert.equal(tradeBefore.held, "887336915523826444724");
        assertPrint("Insurance of Pool1:", '668250000000000000', (await openLev.markets(pairId)).pool1Insurance);
    })

    it("MarginTrade For trader2", async () => {
        let pairId = 0;
        await printBlockNum();
        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        await utils.mint(token1, saver, 10000);
        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, deposit, {from: trader});
        // Saver deposit to pool1
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        m.log("toBorrow from Pool 1: \t", borrow);
        await advanceMultipleBlocksAndTime(200);
        await openLev.updatePrice(pairId, Uni2DexData, {from: trader2});
        await assertThrows(openLev.marginTradeFor(trader2, pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader}), 'OLO');
        await openLev.setOpLimitOrder(trader);
        await openLev.marginTradeFor(trader2, pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        let tradeBefore = await openLev.activeTrades(trader2, pairId, 0);
        m.log("Trade.held:", tradeBefore.held);
        assert.equal(tradeBefore.held, "887336915523826444724");
        await openLev.closeTrade(pairId, false, tradeBefore.held, 0, Uni2DexData, {from: trader2});
        let tradeAfter = await openLev.activeTrades(trader2, pairId, 0);
        assert.equal(tradeAfter.held, "0");
        m.log("Trader2.balanceOf:", await token1.balanceOf(trader2));
        assert.equal(await token1.balanceOf(trader2), "390651883276774977117");
        // weth
        gotPair = await utils.createUniswapV2Pool(uniswapFactory, weth, token1);
        await controller.createLPoolPair(weth.address, token1.address, 3000, Uni2DexData);
        pairId = 1;
        await utils.mint(token1, saver, 1000);
        await utils.mint(weth, trader, 1000);
        deposit = utils.toWei(1);
        saverSupply = utils.toWei(1000);
        pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, saverSupply, {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        borrow = utils.toWei(1);
        m.log("toBorrow from Pool 1: \t", borrow);
        m.log("totalBorrow from Pool 1: \t", await pool1.availableForBorrow());

        await advanceMultipleBlocksAndTime(200);
        await openLev.updatePrice(pairId, Uni2DexData, {from: trader2});
        await weth.approve(openLev.address, deposit, {from: trader});

        await openLev.marginTradeFor(trader2, pairId, false, false, deposit, borrow, 0, Uni2DexData, {from: trader});
        tradeBefore = await openLev.activeTrades(trader2, pairId, 0);
        m.log("Trade.held:", tradeBefore.held);
        assert.equal(tradeBefore.held.toString(), "1992490060009101709");
    })
    it("CloseTrade For trader2", async () => {
        let pairId = 0;
        await printBlockNum();
        // provide some funds for trader and saver
        await utils.mint(token1, trader, 400);
        await utils.mint(token1, saver, 10000);
        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, deposit, {from: trader});
        // Saver deposit to pool1
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        m.log("toBorrow from Pool 1: \t", borrow);
        await advanceMultipleBlocksAndTime(200);
        await openLev.updatePrice(pairId, Uni2DexData, {from: trader});
        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
        let tradeBefore = await openLev.activeTrades(trader, pairId, 0);
        m.log("Trade.held:", tradeBefore.held);
        assert.equal(tradeBefore.held, "887336915523826444724");
        await assertThrows(openLev.closeTradeFor(trader, pairId, false, tradeBefore.held, 0, Uni2DexData, {from: trader2}), 'OLO');
        await openLev.setOpLimitOrder(trader2);

        await openLev.closeTradeFor(trader, pairId, false, tradeBefore.held, 0, Uni2DexData, {from: trader2})
        let tradeAfter = await openLev.activeTrades(trader, pairId, 0);
        assert.equal(tradeAfter.held, "0");
        m.log("Trader1.balanceOf:", await token1.balanceOf(trader));

        assert.equal((await token1.balanceOf(trader)).toString(), "390651431412239210117");
    })

    it("LONG Token0, Close Amount>=99.999%, Close 100% default", async () => {
        let pairId = 0;
        await printBlockNum();
        // provide some funds for trader and saver
        await utils.mint(token1, trader, 10000);
        checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);

        await utils.mint(token1, saver, 10000);
        checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
        // Trader to approve openLev to spend
        let deposit = utils.toWei(400);
        await token1.approve(openLev.address, deposit, {from: trader});

        // Saver deposit to pool1
        let saverSupply = utils.toWei(1000);
        let pool1 = await LPool.at((await openLev.markets(pairId)).pool1);
        await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
        await pool1.mint(saverSupply, {from: saver});
        let borrow = utils.toWei(500);
        m.log("toBorrow from Pool 1: \t", borrow);
        await advanceMultipleBlocksAndTime(100);
        await openLev.updatePrice(pairId, Uni2DexData);

        await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});

        let tradeBefore = await openLev.activeTrades(trader, pairId, 0);
        assert.equal(tradeBefore.held, "886675826237735294796");
        let close_99 = toBN(tradeBefore.held).mul(toBN(999991)).div(toBN(1000000));
        m.log("Close 99.999% : \t", close_99);
        await openLev.closeTrade(0, false, close_99, 0, Uni2DexData, {from: trader});

        let tradeAfter = await openLev.activeTrades(trader, pairId, 0);
        m.log("Trade.held:", tradeAfter.held);
        assert.equal(tradeAfter.held, 0);
    })
})
