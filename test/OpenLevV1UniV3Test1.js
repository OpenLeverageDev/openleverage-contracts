const utils = require("./utils/OpenLevUtil");
const {
  toWei,
  last8,
  checkAmount,
  printBlockNum,
  Uni3DexData,
  assertPrint,
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocks, toBN} = require("./utils/EtheUtil");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");

const Treasury = artifacts.require("TreasuryDelegator");
const TreasuryImpl = artifacts.require("Treasury");
const m = require('mocha-logger');
const LPErc20Delegator = artifacts.require("LPoolDelegator");
const TestToken = artifacts.require("MockERC20");

contract("OpenLev UniV3", async accounts => {

  // components
  let openLev;
  let openLevErc20;
  let treasury;
  let uniswapFactory;
  let gotPair;

  // roles
  let admin = accounts[0];
  let saver = accounts[1];
  let trader = accounts[2];

  let dev = accounts[3];
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

    let uniswapFactory = await utils.createUniswapV3Factory();
    gotPair = await utils.createUniswapV3Pool(uniswapFactory, token0, token1, accounts[0]);

    token0 = await TestToken.at(await gotPair.token0());
    token1 = await TestToken.at(await gotPair.token1());
    dexAgg = await utils.createDexAgg("0x0000000000000000000000000000000000000000", uniswapFactory.address);

    let treasuryImpl = await TreasuryImpl.new();
    treasury = await Treasury.new(uniswapFactory.address, openLevErc20.address, usdt.address, 50, dev, controller.address, treasuryImpl.address);

    let delegatee = await OpenLevV1.new();
    openLev = await OpenLevDelegator.new(controller.address, dexAgg.address, treasury.address, [token0.address, token1.address], accounts[0], delegatee.address);
    await controller.setOpenLev(openLev.address);
    await controller.setLPoolImplementation((await utils.createLPoolImpl()).address);
    await controller.setInterestParam(toBN(90e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '');

    await controller.createLPoolPair(token0.address, token1.address, 3000); // 30% margin ratio by default
    assert.equal(3000, (await openLev.markets(0)).marginLimit);

    await openLev.setDefaultMarginLimit(1500, {from: admin});
    assert.equal(1500, await openLev.defaultMarginLimit());

    assert.equal(await openLev.numPairs(), 1, "Should have one active pair");
    m.log("Reset OpenLev instance: ", last8(openLev.address));
  });


  it("LONG Token0,  Add deposit, Close", async () => {
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

    let tx = await openLev.marginTrade(0, false, true, deposit, borrow, 0, Uni3DexData, {from: trader});

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
      assert.equal(trade.held, 886675826237735300000, "");
      numTrades++;
    }

    assert.equal(numTrades, 1, "Should have one trade only");

    // Check balances
    checkAmount("Trader Balance", 9600000000000000000000, await token1.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("OpenLev Balance", 886675826237735294796, await token0.balanceOf(openLev.address), 18);


    let moreDeposit = utils.toWei(200);
    await token1.approve(openLev.address, moreDeposit, {from: trader});
    tx = await openLev.marginTrade(0, false, true, moreDeposit, 0, 0, Uni3DexData, {from: trader});

    let marginRatio_3 = await openLev.marginRatio(trader, 0, 0, Uni3DexData, {from: saver});
    trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade.held:", trade.held);
    m.log("Trade.deposited:", trade.deposited);
    m.log("Trade.depositFixedValue:", trade.depositFixedValue);
    m.log("Trade.marketValueOpen:", trade.marketValueOpen);

    m.log("Margin Ratio after deposit:", marginRatio_3.current, marginRatio_3.marketLimit);
    assert.equal(marginRatio_3.current.toString(), 12098); // TODO check

    // Close trade
    let tx_close = await openLev.closeTrade(0, 0, "821147572990716389330", 0, Uni3DexData, {from: trader});

    // Check contract held balance
    checkAmount("OpenLev Balance", 1089000000000000000, await token1.balanceOf(openLev.address), 18);
    checkAmount("Trader Balance", 9847747697366893321127, await token1.balanceOf(trader), 18);
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
    let saverSupply = utils.toWei(2000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(2000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});


    let borrow = utils.toWei(1000);
    m.log("toBorrow from Pool 1: \t", borrow);

    await openLev.marginTrade(0, false, true, deposit, borrow, 0, Uni3DexData, {from: trader});


    // Check treasury
    assert.equal('2814000000000000000', (await token1.balanceOf(treasury.address)).toString());

    // Market price change, then check margin ratio
    await gotPair.setPrice(token0.address, token1.address, 1);
    await gotPair.setPreviousPrice(token0.address, token1.address, 1);
    let marginRatio_1 = await openLev.marginRatio(trader, 0, 0, Uni3DexData, {from: saver});
    m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
    assert.equal(marginRatio_1.current.toString(), 0);

    m.log("Liquidating trade ... ");
    await openLev.liquidate(trader, 0, 0, Uni3DexData, {from: liquidator2});

    assertPrint("Insurance of Pool0:", '1358787417096470955', (await openLev.markets(pairId)).pool0Insurance);
    assertPrint("Insurance of Pool1:", '1386000000000000000', (await openLev.markets(pairId)).pool1Insurance);
    checkAmount("Borrows is zero", 0, await pool1.borrowBalanceCurrent(trader), 18);
    checkAmount("OpenLev Balance", 1358787417096470955, await token0.balanceOf(openLev.address), 18);
    checkAmount("OpenLev Balance", 1386000000000000000, await token1.balanceOf(openLev.address), 18);
    checkAmount("Treasury Balance", 2814000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 2758750210468592548, await token0.balanceOf(treasury.address), 18);
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
    let saverSupply = utils.toWei(2000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(2000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(1000);
    m.log("toBorrow from Pool 1: \t", borrow);

    await openLev.marginTrade(0, false, false, deposit, borrow, 0, Uni3DexData, {from: trader});


    await advanceMultipleBlocks(1000);
    //price 0.5
    await gotPair.setPrice(token0.address, token1.address, 1);
    await gotPair.setPreviousPrice(token0.address, token1.address, 1);

    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, Uni3DexData, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(marginRatio_2.current.toString(), 0);

    let trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade.held:", trade.held);
    m.log("Trade.deposited:", trade.deposited);

    m.log("Liquidating trade ... ");
    let tx_liquidate = await openLev.liquidate(trader, 0, 0, Uni3DexData, {from: liquidator2});

    assertPrint("Deposit Decrease", '395800000000000000000', tx_liquidate.logs[0].args.depositDecrease);
    assertPrint("Deposit Return", '15156232092607505605864', tx_liquidate.logs[0].args.depositReturn);

    assertPrint("Insurance of Pool0:", '2755128454053090685', (await openLev.markets(pairId)).pool0Insurance);
    assertPrint("Insurance of Pool1:", '0', (await openLev.markets(pairId)).pool1Insurance);
    checkAmount("OpenLev Balance", 2755128454053090685, await token0.balanceOf(openLev.address), 18);
    checkAmount("OpenLev Balance", 0, await token1.balanceOf(openLev.address), 18);
    checkAmount("Treasury Balance", 0, await token1.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 5593745649138093211, await token0.balanceOf(treasury.address), 18);
    checkAmount("Borrows is zero", 0, await pool1.borrowBalanceCurrent(trader), 18);
    checkAmount("Trader Despoit Token Balance will be back", 24756232092607505605864, await token0.balanceOf(trader), 18);
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
    let saverSupply = utils.toWei(3000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(3000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(2000);
    m.log("toBorrow from Pool 1: \t", borrow);

    await openLev.marginTrade(0, false, false, deposit, borrow, 0, Uni3DexData, {from: trader});

    await utils.mint(token0, saver, 100000);
    await token0.approve(dexAgg.address, utils.toWei(50000), {from: saver});
    await dexAgg.sell(token1.address, token0.address, utils.toWei(50000), 0, Uni3DexData, {from: saver});
    await gotPair.setPreviousPrice(token0.address, token1.address, 1);
    m.log("Liquidating trade ... ");
    let tx_liquidate = await openLev.liquidate(trader, 0, 0, Uni3DexData, {from: liquidator2});

    assertPrint("Deposit Return", '0', tx_liquidate.logs[0].args.depositReturn);

    assertPrint("Insurance of Pool1:", '0', (await openLev.markets(pairId)).pool1Insurance);
    checkAmount("Borrows is zero", 0, await pool1.borrowBalanceCurrent(trader), 18);
    checkAmount("Trader Despoit Token Balance will not back", 9000000000000000000000, await token0.balanceOf(trader), 18);
    checkAmount("Trader Borrows Token Balance is Zero", 0, await token1.balanceOf(trader), 18);
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

    let tx = await openLev.marginTrade(0, true, false, deposit, borrow, 0, Uni3DexData, {from: trader});
    m.log("marginTrade tx: \t", JSON.stringify(tx));

    // Check events
    let fees = tx.logs[0].args.fees;
    m.log("Fees", fees);
    assert.equal(fees, 2700000000000000000);

    // Check balances
    checkAmount("Trader Balance", 9600000000000000000000, await token0.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token0.balanceOf(treasury.address), 18);
    checkAmount("OpenLev Balance", 886675826237735294796, await token1.balanceOf(openLev.address), 18);

    // Market price change, then check margin ratio
    let marginRatio_1 = await openLev.marginRatio(trader, 0, 1, Uni3DexData, {from: saver});
    m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
    assert.equal(marginRatio_1.current.toString(), 8052);

    // Close trade
    let tx_close = await openLev.closeTrade(0, 1, "821147572990716389330", 0, Uni3DexData, {from: trader});
    m.log("closeTrade tx: \t", JSON.stringify(tx_close));

    // Check contract held balance
    checkAmount("OpenLev Balance", 891000000000000000, await token0.balanceOf(openLev.address), 18);
    checkAmount("Trader Balance", 9961110478590371508518, await token0.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token0.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 1650506621711339942, await token1.balanceOf(treasury.address), 18);
    await printBlockNum();
  })


  /*** Admin Test ***/

  it("Admin setDefaultMarginLimit test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setDefaultMarginLimit(uint32)',
      web3.eth.abi.encodeParameters(['uint32'], [1]), 0)
    assert.equal(1, await openLev.defaultMarginLimit());
    try {
      await openLev.setDefaultMarginLimit(1);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setMarketMarginLimit test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setMarketMarginLimit(uint16,uint32)',
      web3.eth.abi.encodeParameters(['uint16', 'uint32'], [1, 20]), 0)
    assert.equal(20, (await openLev.markets(1)).marginLimit);
    try {
      await openLev.setMarketMarginLimit(1, 20);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setDefaultFeesRate test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setDefaultFeesRate(uint256)',
      web3.eth.abi.encodeParameters(['uint256'], [1]), 0)
    assert.equal(1, await openLev.defaultFeesRate());
    try {
      await openLev.setDefaultFeesRate(1);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setMarketFeesRate test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setMarketFeesRate(uint16,uint256)',
      web3.eth.abi.encodeParameters(['uint16', 'uint256'], [1, 10]), 0)
    assert.equal(10, (await openLev.markets(1)).feesRate);
    try {
      await openLev.setMarketFeesRate(1, 10);
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

  it("Admin setDexAggregator test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    let newUniFactory = await utils.createUniswapV2Factory();
    await timeLock.executeTransaction(openLev.address, 0, 'setDexAggregator(address)',
      web3.eth.abi.encodeParameters(['address'], [newUniFactory.address]), 0)
    assert.equal(newUniFactory.address, await openLev.dexAggregator());
    try {
      await openLev.setDexAggregator(newUniFactory.address);
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

  it("Admin setAllowedDepositTokens test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setAllowedDepositTokens(address[],bool)',
      web3.eth.abi.encodeParameters(['address[]', 'bool'], [[accounts[1]], true]), 0)
    assert.equal(true, await openLev.allowedDepositTokens(accounts[1]));
    try {
      await openLev.setAllowedDepositTokens([accounts[1]], true);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })
  it("Admin setPriceDiffientRatio test", async () => {
    let {timeLock, openLev} = await instanceSimpleOpenLev();
    await timeLock.executeTransaction(openLev.address, 0, 'setPriceDiffientRatio(uint16)',
      web3.eth.abi.encodeParameters(['uint16'], [99]), 0)
    assert.equal(99, await openLev.priceDiffientRatio());
    try {
      await openLev.setPriceDiffientRatio(40);
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
    await openLev.marginTrade(0, false, true, deposit, borrow, 0, Uni3DexData, {from: trader});

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
      "0x0000000000000000000000000000000000000000", []);
    return {
      timeLock: timeLock,
      openLev: openLev
    };
  }
})
