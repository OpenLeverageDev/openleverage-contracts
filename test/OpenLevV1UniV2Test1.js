const utils = require("./utils/OpenLevUtil");
const {
  last8,
  checkAmount,
  printBlockNum,
  Uni2DexData,
  assertPrint,
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocksAndTime, toBN} = require("./utils/EtheUtil");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");
const m = require('mocha-logger');
const LPool = artifacts.require("LPool");
const TestToken = artifacts.require("MockERC20");

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

    dexAgg = await utils.createDexAgg(uniswapFactory.address, "0x0000000000000000000000000000000000000000", accounts[0]);

    xole = await utils.createXOLE(ole.address, admin, dev, dexAgg.address);
    delegatee = await OpenLevV1.new();
    openLev = await OpenLevDelegator.new(controller.address, dexAgg.address, [token0.address, token1.address], weth.address, xole.address, accounts[0], delegatee.address);
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
    await openLev.setAllowedDepositTokens([weth.address], true);
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
    await advanceMultipleBlocksAndTime(2);
    let updatePrice_tx = await openLev.updatePrice(pairId, true, Uni2DexData);
    m.log("updatePrice gas consumed:", updatePrice_tx.receipt.gasUsed);
    await openLev.marginTrade(pairId, false, false, 0, borrow, 0, Uni2DexData, {from: trader, value: deposit});
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
    await openLev.closeTrade(pairId, false, tradeBefore.held, 0, Uni2DexData, {from: trader});
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
    let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 25, Uni2DexData);
    m.log("PriceData0: \t", JSON.stringify(priceData0));
    let borrow = utils.toWei(500);
    m.log("toBorrow from Pool 1: \t", borrow);
    try {
      await openLev.marginTrade(0, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
      assert.fail("should thrown  Position not healthy error");
    } catch (error) {
      assert.include(error.message, 'Position not healthy', 'throws exception with  Position not healthy');
    }

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
    await advanceMultipleBlocksAndTime(2);
    await openLev.updatePrice(pairId, false, Uni2DexData);
    let priceData2 = await dexAgg.uniV2PriceOracle(gotPair.address);
    m.log("PriceData2: \t", JSON.stringify(priceData2));
    let priceData3 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 25, Uni2DexData);
    m.log("PriceData3: \t", JSON.stringify(priceData3));
    let marginTradeTx = await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
    m.log("V2 Margin Trade Gas Used: ", marginTradeTx.receipt.gasUsed);
    let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 25, Uni2DexData);
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

  it("LONG Token0, Price Diffience>10%,Long Again", async () => {
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
    await advanceMultipleBlocksAndTime(2);
    await openLev.updatePrice(pairId, false, Uni2DexData);
    await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
    //set price 1.2
    await gotPair.setPrice(token0.address, token1.address, 120);

    let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 25, Uni2DexData);
    m.log("PriceData0: \t", JSON.stringify(priceData0));

    // add deposit needn't update price
    await openLev.marginTrade(pairId, false, true, deposit, 0, 0, Uni2DexData, {from: trader});
    await advanceMultipleBlocksAndTime(2);
    await openLev.updatePrice(pairId, false, Uni2DexData);
    let priceData1 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 25, Uni2DexData);
    m.log("priceData1: \t", JSON.stringify(priceData1));

    await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
    let priceData2 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 25, Uni2DexData);
    m.log("priceData2: \t", JSON.stringify(priceData2));

    //
    let marginRatio = await openLev.marginRatio(trader, 0, 0, Uni2DexData);
    m.log("Margin Ratio current:", marginRatio.current / 100, "%");
    m.log("Margin Ratio avg:", marginRatio.avg / 100, "%");
    assert.equal(marginRatio.current.toString(), 13599);

  })

  it("LONG Token0, Price Diffience>10%, Liquidation", async () => {
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
    await advanceMultipleBlocksAndTime(3);
    await openLev.updatePrice(pairId, true, Uni2DexData);

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
    let priceData0 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 25, Uni2DexData);
    m.log("PriceData0: \t", JSON.stringify(priceData0));

    let shouldUpatePrice = await openLev.shouldUpdatePrice(pairId, Uni2DexData);
    assert.equal(shouldUpatePrice, true);

    // should update price first
    try {
      await openLev.liquidate(trader, pairId, 0, Uni2DexData, {from: liquidator2});
      assert.fail("should thrown  Position is Healthy error");
    } catch (error) {
      assert.include(error.message, 'Position is Healthy', 'throws exception with Position is Healthy');
    }
    await advanceMultipleBlocksAndTime(300);
    let updatePriceTx=await openLev.updatePrice(pairId, true, Uni2DexData, {from: accounts[2]});
    m.log("V2 UpdatePrice Gas Used: ", updatePriceTx.receipt.gasUsed);

    assert.equal((await openLev.markets(pairId)).priceUpdater, accounts[2]);
    let priceData1 = await dexAgg.getPriceCAvgPriceHAvgPrice(token0.address, token1.address, 25, Uni2DexData);
    m.log("priceData1: \t", JSON.stringify(priceData1));
    //
    let marginRatio1 = await openLev.marginRatio(trader, pairId, 0, Uni2DexData);
    m.log("Margin Ratio1 current:", marginRatio1.current / 100, "%");
    m.log("Margin Ratio1 avg:", marginRatio1.avg / 100, "%");
    assert.equal(marginRatio1.current, 0);
    let liquidationTx = await openLev.liquidate(trader, pairId, 0, Uni2DexData, {from: liquidator2});
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
    await openLev.updatePrice(pairId, true, Uni2DexData, {from: trader});
    await openLev.marginTrade(pairId, false, true, deposit, borrow, 0, Uni2DexData, {from: trader});
    let tradeBefore = await openLev.activeTrades(trader, pairId, 0);
    m.log("Trade.held:", tradeBefore.held);
    assert.equal(tradeBefore.held, "887336915523826444724");
    assertPrint("Insurance of Pool1:", '668250000000000000', (await openLev.markets(pairId)).pool1Insurance);
  })
})
