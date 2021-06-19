const utils = require("./utils/OpenLevUtil");
const {
  toWei,
  last8,
  prettyPrintBalance,
  initEnv,
  checkAmount,
  printBlockNum,
  wait,
  assertPrint,
  assertThrows
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocks, toBN} = require("./utils/EtheUtil");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");

const Treasury = artifacts.require("TreasuryDelegator");
const TreasuryImpl = artifacts.require("Treasury");
const m = require('mocha-logger');
const LPErc20Delegator = artifacts.require("LPoolDelegator");
const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");
const MockPriceOracle = artifacts.require("MockPriceOracle");
const TestToken = artifacts.require("MockERC20");

contract("OpenLev", async accounts => {

  // components
  let openLev;
  let openLevErc20;
  let treasury;
  let uniswapFactory;
  let priceOracle;

  // roles
  let admin = accounts[0];
  let saver = accounts[1];
  let trader = accounts[2];
  let trader2 = accounts[5];

  let dev = accounts[3];
  let controller = accounts[3];
  let liquidator1 = accounts[8];
  let liquidator2 = accounts[9];
  let token0;
  let token1;
  beforeEach(async () => {

    // runs once before the first test in this block
    let controller = await utils.createController(admin);
    m.log("Created Controller", last8(controller.address));

    openLevErc20 = await TestToken.new('OpenLevERC20', 'OLE');
    let usdt = await TestToken.new('Tether', 'USDT');

    token0 = await TestToken.new('TokenA', 'TKA');
    token1 = await TestToken.new('TokenB', 'TKB');

    uniswapFactory = await utils.createUniswapFactory(admin);
    m.log("Created UniswapFactory", last8(uniswapFactory.address));

    let pair = await MockUniswapV2Pair.new(token0.address, token1.address, toWei(10000), toWei(10000));
    m.log("Created MockUniswapV2Pair (", last8(await pair.token0()), ",", last8(await pair.token1()), ")");

    // m.log("getReserves:", JSON.stringify(await pair.getReserves(), 0 ,2));
    await uniswapFactory.addPair(pair.address);

    // Making sure the pair has been added correctly in mock
    let gotPair = await MockUniswapV2Pair.at(await uniswapFactory.getPair(token0.address, token1.address));
    assert.equal(await pair.token0(), await gotPair.token0());
    assert.equal(await pair.token1(), await gotPair.token1());

    let treasuryImpl = await TreasuryImpl.new();
    treasury = await Treasury.new(uniswapFactory.address, openLevErc20.address, usdt.address, 50, dev, controller.address, treasuryImpl.address);

    priceOracle = await MockPriceOracle.new();
    let delegatee = await OpenLevV1.new();
    openLev = await OpenLevDelegator.new(controller.address, uniswapFactory.address, treasury.address, priceOracle.address, "0x0000000000000000000000000000000000000000", accounts[0], delegatee.address);
    await controller.setOpenLev(openLev.address);
    await controller.setLPoolImplementation((await utils.createLPoolImpl()).address);
    await controller.setInterestParam(toBN(90e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '');

    await controller.createLPoolPair(token0.address, token1.address, 3000); // 30% margin ratio by default
    assert.equal(3000, (await openLev.markets(0)).marginRatio);

    await openLev.setDefaultMarginRatio(1500, {from: admin});
    assert.equal(1500, await openLev.defaultMarginRatio());

    assert.equal(await openLev.numPairs(), 1, "Should have one active pair");
    m.log("Reset OpenLev instance: ", last8(openLev.address));
  });

  it("LONG Token0, Close", async () => {
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
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(500);
    m.log("toBorrow from Pool 1: \t", borrow);

    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    await priceOracle.setPrice(token1.address, token0.address, 100000000);
    let tx = await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    // Check events
    let fees = tx.logs[0].args.fees;
    m.log("Fees", fees);
    assert.equal(fees, 2700000000000000000);

    assertPrint("atPrice:", '100000000', tx.logs[0].args.atPrice);
    assertPrint("priceDecimals:", '8', tx.logs[0].args.priceDecimals);
    assertPrint("Insurance of Pool1:", '891000000000000000', (await openLev.markets(pairId)).pool1Insurance);

    // Check active trades
    let numPairs = await openLev.numPairs();

    let numTrades = 0;
    for (let i = 0; i < numPairs; i++) {
      let trade = await openLev.activeTrades(trader, i, 0);
      m.log("Margin Trade executed", i, ": ", JSON.stringify(trade, 0, 2));
      assert.equal(trade.deposited, 397300000000000000000); // TODO check after fees amount accuracy
      assert.equal(trade.held, 821147572990716389330, "");
      numTrades++;
    }

    assert.equal(numTrades, 1, "Should have one trade only");

    // Check balances
    checkAmount("Trader Balance", 9600000000000000000000, await token1.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("OpenLev Balance", 821147572990716389330, await token0.balanceOf(openLev.address), 18);

    // Market price change, then check margin ratio
    await priceOracle.setPrice(token0.address, token1.address, 120000000);
    let marginRatio_1 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
    assert.equal(marginRatio_1.current.toString(), 9707);

    await priceOracle.setPrice(token0.address, token1.address, 65000000);
    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(marginRatio_2.current.toString(), 674);

    let trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade:", JSON.stringify(trade, 0, 2));

    await priceOracle.setPrice(token0.address, token1.address, 120000000);
    let tx_close = await openLev.closeTrade(0, 0, "821147572990716389330", 0, {from: trader});
    m.log("held at close", tx_close.held);

    assertPrint("atPrice:", '100000000', tx_close.logs[0].args.atPrice);
    assertPrint("priceDecimals:", '8', tx_close.logs[0].args.priceDecimals);

    // Check contract held balance 9854631923910821448870
    checkAmount("OpenLev Balance", 891000000000000000, await token1.balanceOf(openLev.address), 18);
    checkAmount("Trader Balance", 9854631923910821448870, await token1.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 1650506621711339942, await token0.balanceOf(treasury.address), 18);
    await printBlockNum();
  })

  it("LONG Token0, Price Drop, Add deposit, Close", async () => {
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
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});


    let borrow = utils.toWei(500);
    m.log("toBorrow from Pool 1: \t", borrow);

    await priceOracle.setPrice(token0.address, token1.address, 100000000);

    let tx = await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    // Check events
    let fees = tx.logs[0].args.fees;
    m.log("Fees", fees);
    assert.equal(fees, 2700000000000000000);

    // Check active trades
    let numPairs = await openLev.numPairs();

    let numTrades = 0;
    for (let i = 0; i < numPairs; i++) {
      let trade = await openLev.activeTrades(trader, i, 0);
      m.log("Margin Trade executed", i, ": ", JSON.stringify(trade, 0, 2));
      assert.equal(trade.deposited, 397300000000000000000); // TODO check after fees amount accuracy
      assert.equal(trade.held, 821147572990716389330, "");
      numTrades++;
    }

    assert.equal(numTrades, 1, "Should have one trade only");

    // Check balances
    checkAmount("Trader Balance", 9600000000000000000000, await token1.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("OpenLev Balance", 821147572990716389330, await token0.balanceOf(openLev.address), 18);

    await priceOracle.setPrice(token0.address, token1.address, 65000000);
    await priceOracle.setPrice(token1.address, token0.address, 135000000);
    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio before adding deposit:", marginRatio_2.current / 100, "%");
    assert.equal(marginRatio_2.current.toString(), 674);

    let moreDeposit = utils.toWei(200);
    await token1.approve(openLev.address, moreDeposit, {from: trader});
    tx = await openLev.marginTrade(0, false, true, moreDeposit, 0, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    let marginRatio_3 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade.held:", trade.held);
    m.log("Trade.deposited:", trade.deposited);
    m.log("Trade.depositFixedValue:", trade.depositFixedValue);
    m.log("Trade.marketValueOpen:", trade.marketValueOpen);

    m.log("Margin Ratio after deposit:", marginRatio_3.current, marginRatio_3.marketLimit);
    assert.equal(marginRatio_3.current.toString(), 3208); // TODO check

    // Close trade
    let tx_close = await openLev.closeTrade(0, 0, "821147572990716389330", 0, {from: trader});

    // Check contract held balance
    checkAmount("OpenLev Balance", 1089000000000000000, await token1.balanceOf(openLev.address), 18);
    checkAmount("Trader Balance", 9750581914760213759609, await token1.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 2211000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 1650506621711339942, await token0.balanceOf(treasury.address), 18);
    await printBlockNum();
  })

  it("LONG Token0,DepositToken 1 Liquidate", async () => {
    let pairId = 0;

    // provide some funds for trader and saver
    await utils.mint(token1, trader, 10000);
    m.log("Trader", last8(trader), "minted", await token1.symbol(), await token1.balanceOf(trader));

    await utils.mint(token1, saver, 10000);
    m.log("Saver", last8(saver), "minted", await token1.symbol(), await token1.balanceOf(saver));

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await token1.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});


    let borrow = utils.toWei(500);
    m.log("toBorrow from Pool 1: \t", borrow);

    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    await priceOracle.setPrice(token1.address, token0.address, 100000000);
    await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    // Check events
    //assert.equal(tx.logs[0].event, "Transfer");

    // Check active trades
    let numPairs = await openLev.numPairs();

    let numTrades = 0;
    for (let i = 0; i < numPairs; i++) {
      let trade = await openLev.activeTrades(trader, i, 0);
      m.log("Margin Trade executed", i, ": ", JSON.stringify(trade, 0, 2));
      assert.equal(trade.deposited, 397300000000000000000); // TODO check after fees amount accuracy
      assert.equal(trade.held, 821147572990716389330, "");
      numTrades++;
    }

    assert.equal(numTrades, 1, "Should have one trade only");

    // Check contract held balance
    assert.equal(await token0.balanceOf(openLev.address), 821147572990716389330);

    // Check treasury
    assert.equal('1809000000000000000', (await token1.balanceOf(treasury.address)).toString());

    // Market price change, then check margin ratio
    await priceOracle.setPrice(token0.address, token1.address, 120000000);
    let marginRatio_1 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
    assert.equal(marginRatio_1.current.toString(), 9707);

    await advanceMultipleBlocks(4000);

    await priceOracle.setPrice(token0.address, token1.address, 65000000);
    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(marginRatio_2.current.toString(), 655);

    // Close trade
    m.log("Mark trade liquidatable ... ");
    await openLev.liqMarker(trader, 0, 0, {from: liquidator1});

    m.log("Liquidating trade ... ");
    await openLev.liquidate(trader, 0, 0, {from: liquidator2});

    assertPrint("Insurance of Pool0:", '812936097260809225', (await openLev.markets(pairId)).pool0Insurance);
    assertPrint("Insurance of Pool1:", '891000000000000000', (await openLev.markets(pairId)).pool1Insurance);
    checkAmount("Borrows is zero", 0, await pool1.borrowBalanceCurrent(trader), 18);
    checkAmount("OpenLev Balance", 812936097260809225, await token0.balanceOf(openLev.address), 18);
    checkAmount("OpenLev Balance", 891000000000000000, await token1.balanceOf(openLev.address), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 1650506621711339942, await token0.balanceOf(treasury.address), 18);
  })

  it("LONG Token0, Deposit Token0, Liquidate", async () => {
    let pairId = 0;

    // provide some funds for trader and saver
    await utils.mint(token0, trader, 10000);
    m.log("Trader", last8(trader), "minted", await token0.symbol(), await token0.balanceOf(trader));

    await utils.mint(token1, saver, 10000);
    m.log("Saver", last8(saver), "minted", await token1.symbol(), await token1.balanceOf(saver));

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await token0.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(500);
    m.log("toBorrow from Pool 1: \t", borrow);

    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    await priceOracle.setPrice(token1.address, token0.address, 100000000);
    await openLev.marginTrade(0, false, false, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});


    // Market price change, then check margin ratio
    await priceOracle.setPrice(token0.address, token1.address, 120000000);
    let marginRatio_1 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
    assert.equal(marginRatio_1.current.toString(), 10931);

    await advanceMultipleBlocks(4000);

    await priceOracle.setPrice(token0.address, token1.address, 65000000);
    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(marginRatio_2.current.toString(), 1317);

    // Close trade
    m.log("Mark trade liquidatable ... ");
    await openLev.liqMarker(trader, 0, 0, {from: liquidator1});

    m.log("Liquidating trade ... ");
    let tx_liquidate = await openLev.liquidate(trader, 0, 0, {from: liquidator2});

    assertPrint("Deposit Decrease", '872129737581559270371', tx_liquidate.logs[0].args.depositDecrease);
    assertPrint("Deposit Return", '340608385333425655674', tx_liquidate.logs[0].args.depositReturn);


    assertPrint("Insurance of Pool0:", '1754408440205743677', (await openLev.markets(pairId)).pool0Insurance);
    assertPrint("Insurance of Pool1:", '0', (await openLev.markets(pairId)).pool1Insurance);
    checkAmount("OpenLev Balance", 1754408440205743677, await token0.balanceOf(openLev.address), 18);
    checkAmount("OpenLev Balance", 0, await token1.balanceOf(openLev.address), 18);
    checkAmount("Treasury Balance", 0, await token1.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 3561980772538934134, await token0.balanceOf(treasury.address), 18);
    checkAmount("Borrows is zero", 0, await pool1.borrowBalanceCurrent(trader), 18);
    checkAmount("Trader Despoit Token Balance will be back", 9940608385333425655674, await token0.balanceOf(trader), 18);
    checkAmount("Trader Borrows Token Balance is Zero", 0, await token1.balanceOf(trader), 18);
  })

  it("LONG Token0, Deposit Token0, Liquidate, Blow up", async () => {
    let pairId = 0;

    m.log("OpenLev.token0() = ", last8(token0.address));
    m.log("OpenLev.token1() = ", last8(token1.address));

    // provide some funds for trader and saver
    await utils.mint(token0, trader, 10000);
    m.log("Trader", last8(trader), "minted", await token0.symbol(), await token0.balanceOf(trader));

    await utils.mint(token1, saver, 10000);
    m.log("Saver", last8(saver), "minted", await token1.symbol(), await token1.balanceOf(saver));

    // Trader to approve openLev to spend
    let deposit = utils.toWei(1000);
    await token0.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(10000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(10000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(3000);
    m.log("toBorrow from Pool 1: \t", borrow);

    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    await priceOracle.setPrice(token1.address, token0.address, 100000000);
    await openLev.marginTrade(0, false, false, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    await priceOracle.setPrice(token0.address, token1.address, 65000000);
    //

    // Close trade
    m.log("Mark trade liquidatable ... ");
    await openLev.liqMarker(trader, 0, 0, {from: liquidator1});

    m.log("Liquidating trade ... ");
    let tx_liquidate = await openLev.liquidate(trader, 0, 0, {from: liquidator2});

    assertPrint("Deposit Return", '0', tx_liquidate.logs[0].args.depositReturn);

    assertPrint("Insurance of Pool1:", '0', (await openLev.markets(pairId)).pool1Insurance);
    checkAmount("Borrows is not zero", 535429556624761209187, await pool1.borrowBalanceCurrent(trader), 18);
    checkAmount("Trader Despoit Token Balance will not back", 9000000000000000000000, await token0.balanceOf(trader), 18);
    checkAmount("Trader Borrows Token Balance is Zero", 0, await token1.balanceOf(trader), 18);
  })

  it("LONG Token0, Reset Liquidate ", async () => {
    let pairId = 0;

    // provide some funds for trader and saver
    await utils.mint(token1, trader, 10000);
    m.log("Trader", last8(trader), "minted", await token1.symbol(), await token1.balanceOf(trader));

    await utils.mint(token1, saver, 10000);
    m.log("Saver", last8(saver), "minted", await token1.symbol(), await token1.balanceOf(saver));

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await token1.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});


    let borrow = utils.toWei(500);
    m.log("toBorrow from Pool 1: \t", borrow);

    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});


    await advanceMultipleBlocks(10);

    await priceOracle.setPrice(token0.address, token1.address, 65000000);
    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(marginRatio_2.current.toString(), 674);

    m.log("Mark trade liquidatable ... ");
    await openLev.liqMarker(trader, 0, 0, {from: liquidator1});

    m.log("Reset trade liquidate... ");
    await priceOracle.setPrice(token0.address, token1.address, 80000000);
    let marginRatioReset = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio Reset:", marginRatioReset.current / 100, "%");
    assert.equal(marginRatioReset.current.toString(), 3138);
    await openLev.liqMarkerReset(trader, 0, 0, {from: liquidator1});

    let trade = await openLev.activeTrades(trader, 0, 0);
    assert.equal(trade[2], "0x0000000000000000000000000000000000000000");
    assert.equal(trade[3], 0);

  })

  it("Long Token1, Close", async () => {
    let pairId = 0;
    await printBlockNum();

    // provide some funds for trader and saver
    await utils.mint(token0, trader, 10000);
    checkAmount(await token0.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token0.balanceOf(trader), 18);

    await utils.mint(token0, saver, 10000);
    checkAmount(await token0.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token0.balanceOf(saver), 18);

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await token0.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool0 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool0);
    await token0.approve(await pool0.address, utils.toWei(1000), {from: saver});
    await pool0.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(500);
    m.log("toBorrow from Pool 1: \t", borrow);

    await priceOracle.setPrice(token1.address, token0.address, 100000000);
    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    let tx = await openLev.marginTrade(0, true, false, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    // Check events
    let fees = tx.logs[0].args.fees;
    m.log("Fees", fees);
    assert.equal(fees, 2700000000000000000);

    // Check active trades
    let numPairs = await openLev.numPairs();

    let numTrades = 0;
    for (let i = 0; i < numPairs; i++) {
      let trade = await openLev.activeTrades(trader, i, true);
      m.log("Margin Trade executed", i, ": ", JSON.stringify(trade, 0, 2));
      assert.equal(trade.deposited, 397300000000000000000); // TODO check after fees amount accuracy
      assert.equal(trade.held, 821147572990716389330, "");
      numTrades++;
    }

    assert.equal(numTrades, 1, "Should have one trade only");

    // Check balances
    checkAmount("Trader Balance", 9600000000000000000000, await token0.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token0.balanceOf(treasury.address), 18);
    checkAmount("OpenLev Balance", 821147572990716389330, await token1.balanceOf(openLev.address), 18);

    // Market price change, then check margin ratio
    await priceOracle.setPrice(token1.address, token0.address, 120000000);
    let marginRatio_1 = await openLev.marginRatio(trader, 0, 1, {from: saver});
    m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
    assert.equal(marginRatio_1.current.toString(), 9707);

    // Close trade
    let tx_close = await openLev.closeTrade(0, 1, "821147572990716389330", 0, {from: trader});

    // Check contract held balance
    checkAmount("OpenLev Balance", 891000000000000000, await token0.balanceOf(openLev.address), 18);
    checkAmount("Trader Balance", 9854632375775357216324, await token0.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token0.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 1650506621711339942, await token1.balanceOf(treasury.address), 18);
    await printBlockNum();
  })

  it("Open with Referrer Test ", async () => {
    let pairId = 0;
    //set Referral
    let referrer = accounts[8];
    let referral = await utils.createReferral(openLev.address, admin);
    await referral.registerReferrer({from: referrer});
    await openLev.setReferral(referral.address);

    // provide some funds for trader and saver
    await utils.mint(token0, trader, 10000);
    await utils.mint(token0, saver, 10000);

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await token0.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool0 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool0);
    await token0.approve(await pool0.address, utils.toWei(1000), {from: saver});
    await pool0.mint(saverSupply, {from: saver});

    //Set price
    await priceOracle.setPrice(token1.address, token0.address, 100000000);
    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    let borrow = utils.toWei(500);
    let tx = await openLev.marginTrade(0, true, false, deposit, borrow, 0, referrer, {from: trader});

    // Check events
    let fees = tx.logs[0].args.fees;
    assertPrint("Fees with referral discount:", '2484000000000000000', fees);

    //referralBalance=fees*18%
    assertPrint("Referral balance:", '432000000000000000', await token0.balanceOf(referral.address));

    //treasuryBalance=fees-insurance-referralBalance-refereeDiscount
    assertPrint("Treasury:", '1161000000000000000', await token0.balanceOf(treasury.address));

  })


  /*** Admin Test ***/

  it("Admin setDefaultMarginRatio test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setDefaultMarginRatio(uint32)',
      web3.eth.abi.encodeParameters(['uint32'], [1]), 0)
    assert.equal(1, await openLev.defaultMarginRatio());
    try {
      await openLev.setDefaultMarginRatio(1);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setMarketMarginLimit test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setMarketMarginLimit(uint16,uint32)',
      web3.eth.abi.encodeParameters(['uint16', 'uint32'], [1, 20]), 0)
    assert.equal(20, (await openLev.markets(1)).marginRatio);
    try {
      await openLev.setMarketMarginLimit(1, 20);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setFeesRate test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setFeesRate(uint256)',
      web3.eth.abi.encodeParameters(['uint256'], [1]), 0)
    assert.equal(1, await openLev.feesRate());
    try {
      await openLev.setFeesRate(1);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setInsuranceRatio test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setInsuranceRatio(uint8)',
      web3.eth.abi.encodeParameters(['uint8'], [1]), 0)
    assert.equal(1, await openLev.insuranceRatio());
    try {
      await openLev.setInsuranceRatio(1);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setPriceOracle test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    let newPriceOracle = await utils.createPriceOracle();
    await timeLock.executeTransaction(openLev.address, 0, 'setPriceOracle(address)',
      web3.eth.abi.encodeParameters(['address'], [newPriceOracle.address]), 0)
    assert.equal(newPriceOracle.address, await openLev.priceOracle());
    try {
      await openLev.setPriceOracle(newPriceOracle.address);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setUniswapFactory test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    let newUniFactory = await utils.createUniswapFactory();
    await timeLock.executeTransaction(openLev.address, 0, 'setUniswapFactory(address)',
      web3.eth.abi.encodeParameters(['address'], [newUniFactory.address]), 0)
    assert.equal(newUniFactory.address, await openLev.uniswapFactory());
    try {
      await openLev.setUniswapFactory(newUniFactory.address);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setReferral test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    let newReferral = accounts[1]
    await timeLock.executeTransaction(openLev.address, 0, 'setReferral(address)',
      web3.eth.abi.encodeParameters(['address'], [newReferral]), 0)
    assert.equal(newReferral, await openLev.referral());
    try {
      await openLev.setReferral(newReferral);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setController test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    let newController = await utils.createController(accounts[0]);
    await timeLock.executeTransaction(openLev.address, 0, 'setController(address)',
      web3.eth.abi.encodeParameters(['address'], [newController.address]), 0)
    assert.equal(newController.address, await openLev.controller());
    try {
      await openLev.setController(newController.address);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin moveInsurance test", async () => {
    let pairId = 0;
    await printBlockNum();
    await utils.mint(token1, trader, 10000);
    checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);
    await utils.mint(token1, saver, 10000);
    checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
    let deposit = utils.toWei(400);
    await token1.approve(openLev.address, deposit, {from: trader});
    let saverSupply = utils.toWei(1000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});
    let borrow = utils.toWei(500);
    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    await priceOracle.setPrice(token1.address, token0.address, 100000000);
    await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    let timeLock = await utils.createTimelock(admin);
    await openLev.setPendingAdmin(timeLock.address);
    await timeLock.executeTransaction(openLev.address, 0, 'acceptAdmin()',
      web3.eth.abi.encodeParameters([], []), 0)
    // await openLev.acceptAdmin();

    let pool1Insurance = (await openLev.markets(pairId)).pool1Insurance;
    m.log("pool1Insurance", pool1Insurance);
    await timeLock.executeTransaction(openLev.address, 0, 'moveInsurance(uint16,uint8,address,uint256)',
      web3.eth.abi.encodeParameters(['uint16', 'uint8', 'address', 'uint256'], [pairId, 1, accounts[5], pool1Insurance]), 0)

    assert.equal("0", (await openLev.markets(pairId)).pool1Insurance);
    assert.equal(pool1Insurance, (await token1.balanceOf(accounts[5])).toString());
    try {
      await openLev.moveInsurance(pairId, 1, accounts[5], pool1Insurance);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })

  it("Admin setImplementation test", async () => {
    let instance = await OpenLevV1.new();
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setImplementation(address)',
      web3.eth.abi.encodeParameters(['address'], [instance.address]), 0)
    assert.equal(instance.address, await openLev.implementation());
    try {
      await openLev.setImplementation(instance.address);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });

  async function instanceSimpleOpenLev() {
    let timeLock = await utils.createTimelock(admin);
    let openLev = await utils.createOpenLev("0x0000000000000000000000000000000000000000",
      timeLock.address, "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000");
    return {
      timeLock: timeLock,
      openLev: openLev
    };
  }
})
