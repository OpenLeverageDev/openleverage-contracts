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
const OpenLevDelegate = artifacts.require("OpenLevV1");
const OpenLevV1 = artifacts.require("OpenLevDelegator");
const Treasury = artifacts.require("TreasuryDelegator");
const TreasuryImpl = artifacts.require("Treasury");
const m = require('mocha-logger');
const LPErc20Delegator = artifacts.require("LPoolDelegator");
const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");
const MockPriceOracle = artifacts.require("MockPriceOracle");
const TestToken = artifacts.require("MockERC20");
const InterestModel = artifacts.require("JumpRateModel");

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
    let delegate = await OpenLevDelegate.new();
    openLev = await OpenLevV1.new(controller.address, uniswapFactory.address, treasury.address, priceOracle.address, "0x0000000000000000000000000000000000000000", accounts[0], delegate.address);
    await controller.setOpenLev(openLev.address);
    await controller.setLPoolImplementation((await utils.createLPoolImpl()).address);
    await controller.setInterestParam(toBN(90e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '');
    await controller.createLPoolPair(token0.address, token1.address, 3000); // 30% margin ratio

    assert.equal(await openLev.numPairs(), 1, "Should have one active pair");
    m.log("Reset OpenLev instance: ", last8(openLev.address));
  });

  it("Long Token0 with Token0 deposit, lower price, then close", async () => {
    let pairId = 0;
    let btc = token0;
    let usdt = token1;
    m.log("BTC=", last8(btc.address));
    m.log("USDT=", last8(usdt.address));

    // provide some funds for trader and saver
    await utils.mint(btc, trader, 10000);
    checkAmount(await btc.symbol() + " Trader " + last8(trader) + " Balance", 10000000000000000000000, await btc.balanceOf(trader), 18);

    await utils.mint(usdt, saver, 10000);
    checkAmount(await usdt.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await usdt.balanceOf(saver), 18);

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await btc.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await usdt.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(500);

    await priceOracle.setPrice(usdt.address, btc.address, 100000000);
    await priceOracle.setPrice(btc.address, usdt.address, 100000000);

    let tx = await openLev.marginTrade(0, false, false, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    // Check events
    assertPrint("Deposit BTC", '400000000000000000000', toBN(tx.logs[0].args.deposited));
    assertPrint("Borrow USDT", '500000000000000000000', toBN(tx.logs[0].args.borrowed));
    assertPrint("Held", '872129737581559270371', toBN(tx.logs[0].args.held));
    assertPrint("Fees", '2700000000000000000', toBN(tx.logs[0].args.fees));

    assertPrint("Insurance of Pool0:", '891000000000000000', (await openLev.markets(0)).pool0Insurance);

    // Check balances
    checkAmount("Trader BTC Balance", 9600000000000000000000, await btc.balanceOf(trader), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(treasury.address), 18);
    checkAmount("Treasury BTC Balance", 1809000000000000000, await btc.balanceOf(treasury.address), 18);
    checkAmount("OpenLev BTC Balance", 873020737581559270371, await btc.balanceOf(openLev.address), 18);


    let trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade.held:", trade.held);
    m.log("Trade.deposited:", trade.deposited);
    m.log("Trade.marketValueOpen:", trade.marketValueOpen);
    m.log("Trade.depositFixedValue:", trade.depositFixedValue);


    await priceOracle.setPrice(usdt.address, btc.address, 100000001);
    await priceOracle.setPrice(btc.address, usdt.address, 99999999);
    // Market price change, then check margin ratio
    let marginRatio_1 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
    /**
     * held:872.129
     * deposit:400
     * borrow:500
     * price:1
     * marginRatio=(held*price-borrow)/borrow=(872.129*1-500)/500=74.42%
     */
    assert.equal(7442, marginRatio_1.current.toString());

    // await priceOracle.setPrice(usdt.address, btc.address, 120000000);
    await priceOracle.setPrice(btc.address, usdt.address, 120000000);
    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(10931, marginRatio_2.current.toString());

    // Partial Close trade
    m.log("Partial Close Trade", 400);
    let tx_close = await openLev.closeTrade(0, 0, "400000000000000000000", 0, {from: trader});

    // Check contract held balance
    checkAmount("OpenLev USDT Balance", 0, await usdt.balanceOf(openLev.address), 18);
    checkAmount("OpenLev BTC Balance", 473416737581559270371, await btc.balanceOf(openLev.address), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Trader BTC Balance", 9763412161500582686829, await btc.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(treasury.address), 18);
    checkAmount("Treasury BTC Balance", 2613000000000000000, await btc.balanceOf(treasury.address), 18);
    // await printBlockNum();

    trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade held:", trade.held);
    m.log("Trade deposited:", trade.deposited);
    m.log("Trade marketValueOpen:", trade.marketValueOpen);

    let ratio = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Ratio, current:", ratio.current, "limit", ratio.marketLimit);
    assert.equal(10929, ratio.current.toString());

    // Partial Close trade
    let tx_full_close = await openLev.closeTrade(0, 0, "472129737581559270371", 0, {from: trader});

    checkAmount("OpenLev USDT Balance", 0, await usdt.balanceOf(openLev.address), 18);
    checkAmount("OpenLev BTC Balance", 1754408440205743677, await btc.balanceOf(openLev.address), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Trader BTC Balance", 9955055925115864724311, await btc.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(treasury.address), 18);
    checkAmount("Treasury BTC Balance", 3561980772538934134, await btc.balanceOf(treasury.address), 18);

    assertPrint("Insurance of Pool0:", '1754408440205743677', (await openLev.markets(0)).pool0Insurance);
    assertPrint("Insurance of Pool1:", '0', (await openLev.markets(0)).pool1Insurance);

  })

  it("Long Token0 with Token1 deposit,  then close", async () => {
    let pairId = 0;
    let btc =token0;
    let usdt = token1;
    // provide some funds for trader and saver
    let deposit = utils.toWei(400);
    await utils.mint(usdt, trader, 400);

    await utils.mint(usdt, saver, 10000);

    // Trader to approve openLev to spend
    await usdt.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await usdt.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(500);

    await priceOracle.setPrice(usdt.address, btc.address, 100000000);
    await priceOracle.setPrice(btc.address, usdt.address, 100000000);

    let tx = await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    // Check events
    assertPrint("Deposit USDT", '400000000000000000000', toBN(tx.logs[0].args.deposited));
    assertPrint("Borrow USDT", '500000000000000000000', toBN(tx.logs[0].args.borrowed));
    assertPrint("Held", '821147572990716389330', toBN(tx.logs[0].args.held));
    assertPrint("Fees", '2700000000000000000', toBN(tx.logs[0].args.fees));

    assertPrint("Insurance of Pool1:", '891000000000000000', (await openLev.markets(0)).pool1Insurance);
    assertPrint("Insurance of Pool0:", '0', (await openLev.markets(0)).pool0Insurance);

    // Check balances
    checkAmount("Treasury USDT Balance", 1809000000000000000, await usdt.balanceOf(treasury.address), 18);
    checkAmount("Treasury BTC Balance", 0, await btc.balanceOf(treasury.address), 18);
    checkAmount("OpenLev BTC Balance", 821147572990716389330, await btc.balanceOf(openLev.address), 18);


    let trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade.held:", trade.held);
    m.log("Trade.deposited:", trade.deposited);


    await priceOracle.setPrice(usdt.address, btc.address, 100000001);
    await priceOracle.setPrice(btc.address, usdt.address, 99999999);
    // Market price change, then check margin ratio
    let marginRatio_1 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
    assert.equal(6422, marginRatio_1.current.toString());

    await priceOracle.setPrice(btc.address, usdt.address, 120000000);
    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(9707, marginRatio_2.current.toString());

    // Partial Close trade
    m.log("Partial Close Trade", 400);
    let tx_partial_close = await openLev.closeTrade(0, 0, "400000000000000000000", 0, {from: trader});
    m.log("Partial Close Tx ", JSON.stringify(tx_partial_close.logs[0]));
    assert.equal(193524830000000000000, tx_partial_close.logs[0].args.depositDecrease);
    //Check borrows
    assert.equal("256450463522640789789", (await pool1.borrowBalanceCurrent(trader)).toString());

    // Check contract held balance
    checkAmount("OpenLev BTC Balance", 421543572990716389330, await btc.balanceOf(openLev.address), 18);
    checkAmount("OpenLev USDT Balance", 891000000000000000, await usdt.balanceOf(openLev.address), 18);
    checkAmount("Trader USDT Balance", 138848827255544821005, await usdt.balanceOf(trader), 18);
    checkAmount("Trader BTC Balance", 0, await btc.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 1809000000000000000, await usdt.balanceOf(treasury.address), 18);
    checkAmount("Treasury BTC Balance", 804000000000000000, await btc.balanceOf(treasury.address), 18);
    assertPrint("Insurance of Pool0:", 396000000000000000, (await openLev.markets(0)).pool0Insurance);

    trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade held:", trade.held);
    m.log("Trade deposited:", trade.deposited);

    let ratio = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Ratio, current:", ratio.current, "limit", ratio.marketLimit);
    assert.equal(9706, ratio.current.toString());

    // Partial Close trade
    let tx_full_close = await openLev.closeTrade(0, 0, "421147572990716389330", 0, {from: trader});
    m.log("Full Close Tx ", JSON.stringify(tx_full_close.logs[0]));
    assert.equal(203775170000000000000, tx_full_close.logs[0].args.depositDecrease);

    trade = await openLev.activeTrades(trader, 0, 0);

    assert.equal("0", trade.held);
    assert.equal("0", trade.deposited);

    checkAmount("OpenLev BTC Balance", 812936097260809225, await btc.balanceOf(openLev.address), 18);
    checkAmount("OpenLev USDT Balance", 891000000000000000, await usdt.balanceOf(openLev.address), 18);
    checkAmount("Trader USDT Balance", 284202230580142007069, await usdt.balanceOf(trader), 18);
    checkAmount("Trader BTC Balance", 0, await btc.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 1809000000000000000, await usdt.balanceOf(treasury.address), 18);
    checkAmount("Treasury BTC Balance", 1650506621711339942, await btc.balanceOf(treasury.address), 18);
    assertPrint("Insurance of Pool1:", 891000000000000000, (await openLev.markets(0)).pool1Insurance);

    assertPrint("Insurance of Pool0:", "812936097260809225", (await openLev.markets(0)).pool0Insurance);

    assert.equal("0", await pool1.borrowBalanceCurrent(trader));

  })

  it("Opens Long 2x, open again with 3x, partial close, and full close", async () => {
    let pairId = 0;

    // provide some funds for trader and saver
    await utils.mint(token1, trader, 10000);
    checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);

    await utils.mint(token1, saver, 10000);
    checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await token1.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(2000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await token1.approve(await pool1.address, utils.toWei(2000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(500);
    m.log("toBorrow from Pool 1: \t", borrow);

    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    await priceOracle.setPrice(token1.address, token0.address, 100000000);

    m.log("Margin Trade:", "Deposit=", deposit, "Borrow=", borrow);
    let tx = await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    // Check events
    let fees = tx.logs[0].args.fees;
    m.log("Fees", fees);
    assert.equal(fees, 2700000000000000000);

    assertPrint("Insurance of Pool1:", '891000000000000000', (await openLev.markets(0)).pool1Insurance);

    // Check active trades
    let numPairs = await openLev.numPairs();

    let numTrades = 0;
    for (let i = 0; i < numPairs; i++) {
      let trade = await openLev.activeTrades(trader, i, 0);
      m.log("Trade:", JSON.stringify(trade, 0, 2));
      assert.equal(trade.deposited, 397300000000000000000); // TODO check after fees amount accuracy
      assert.equal(trade.held, 821147572990716389330, "");
      numTrades++;
    }

    assert.equal(numTrades, 1, "Should have one trade only");

    // Check balances
    checkAmount("Trader Balance", 9600000000000000000000, await token1.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("OpenLev Balance", 821147572990716389330, await token0.balanceOf(openLev.address), 18);

    // let pnl = await openLev.getPnl(trader, 0, 0);
    // assertPrint("PNL Sign", false, pnl.sign);
    // checkAmount("PNL Amount", 76152427009283610670, pnl.amount, 18);

    // Market price change, then check margin ratio
    let marginRatio_1 = await openLev.marginRatio(trader, 0, 0, {from: saver});
    m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
    assert.equal(marginRatio_1.current.toString(), 6422);

    m.log("Margin Trade Again:", "Deposit=", deposit, "Borrow=", borrow);
    await token1.approve(openLev.address, deposit, {from: trader});
    tx = await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});

    let trade = await openLev.activeTrades(trader, 0, 0);
    assertPrint("trade.deposited:", '794600000000000000000', trade.deposited);
    assertPrint("trade.held:", '1642295145981432778660', trade.held);

    checkAmount("Trader Balance", 9200000000000000000000, await token1.balanceOf(trader), 18);

    trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade:", JSON.stringify(trade, 0, 2));

    let tx_close = await openLev.closeTrade(0, 0, "1042295145981432778660", 0, {from: trader});
    m.log("TradeClose event:", JSON.stringify(tx_close.logs[0].args.closeAmount, 0, 2));

    trade = await openLev.activeTrades(trader, 0, 0);
    //Check trade
    assertPrint("trade.deposited:", '290346840000000000000', trade.deposited);
    assertPrint("trade.held:", '600000000000000000000', trade.held);

    // Check contract held balance  9504186992243861070926
    checkAmount("OpenLev Balance", 1782000000000000000, await token1.balanceOf(openLev.address), 18);
    checkAmount("Trader Balance", 9504187029974558887910, await token1.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 3618000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 2095013243422679885, await token0.balanceOf(treasury.address), 18);

    tx_close = await openLev.closeTrade(0, 0, "600000000000000000000", 0, {from: trader});
    m.log("TradeClose event:", JSON.stringify(tx_close.logs[0].args.closeAmount, 0, 2));

    trade = await openLev.activeTrades(trader, 0, 0);
    assertPrint("trade.deposited:", '0', trade.deposited);
    assertPrint("trade.held:", '0', trade.held);

    // Check contract held balance   9701623951262107661984
    checkAmount("OpenLev Balance", 1782000000000000000, await token1.balanceOf(openLev.address), 18);
    checkAmount("Trader Balance", 9701624013893343777946, await token1.balanceOf(trader), 18);
    checkAmount("Treasury Balance", 3618000000000000000, await token1.balanceOf(treasury.address), 18);
    checkAmount("Treasury Balance", 3301013243422679885, await token0.balanceOf(treasury.address), 18);
    await printBlockNum();
  })
  it("LONG Token0, Deposit Token0, Close, Blow up", async () => {
    let pairId = 0;

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

    let trade = await openLev.activeTrades(trader, 0, 0);
    // Close trade
    m.log("trade.deposit=", trade.deposited);
    let tx_full_close = await openLev.closeTrade(0, 0, trade.held, 0, {from: trader});

    m.log("Full Close Tx ", JSON.stringify(tx_full_close.logs[0]));
    // assert.equal(trade.deposited, tx_full_close.logs[0].args.depositDecrease);
    checkAmount("Trade deposited is correct", trade.deposited, tx_full_close.logs[0].args.depositDecrease, 18);

    assert.equal(0, tx_full_close.logs[0].args.depositReturn);
    checkAmount("Borrows is not zero", 535426902515172177187, await pool1.borrowBalanceCurrent(trader), 18);

    assertPrint("Insurance of Pool1:", '0', (await openLev.markets(pairId)).pool1Insurance);
    checkAmount("Borrows is not zero", 535426902515172177187, await pool1.borrowBalanceCurrent(trader), 18);
    checkAmount("Trader Despoit Token Balance will not back", 9000000000000000000000, await token0.balanceOf(trader), 18);
    checkAmount("Trader Borrows Token Balance is Zero", 0, await token1.balanceOf(trader), 18);
  })

})
