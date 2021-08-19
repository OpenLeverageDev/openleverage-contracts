const utils = require("./utils/OpenLevUtil");
const {
  toWei,
  last8,
  checkAmount,
  assertPrint,
} = require("./utils/OpenLevUtil");
const {toBN} = require("./utils/EtheUtil");
const OpenLevDelegate = artifacts.require("OpenLevV1");
const OpenLevV1 = artifacts.require("OpenLevDelegator");
const xOLE = artifacts.require("XOLE");
const m = require('mocha-logger');
const LPErc20Delegator = artifacts.require("LPoolDelegator");
const MockUniswapV3Factory = artifacts.require("MockUniswapV3Factory");
const TestToken = artifacts.require("MockERC20");

const Uni3DexData = "0x01000bb8" + "0000000000000000000000000000000000000000000000000000000000000000";
const Uni3DexDataMaxBuyAmount = "0x01000bb8" + "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

contract("OpenLev UniV3", async accounts => {

  // components
  let openLev;
  let ole;
  let xole;
  let uniswapFactory;
  let gotPair;

  // roles
  let admin = accounts[0];
  let saver = accounts[1];
  let trader = accounts[2];
  let dev = accounts[3];
  let token0;
  let token1;
  beforeEach(async () => {

    // runs once before the first test in this block
    let controller = await utils.createController(admin);
    m.log("Created Controller", last8(controller.address));

    ole = await TestToken.new('OpenLevERC20', 'OLE');
    let usdt = await TestToken.new('Tether', 'USDT');

    token0 = await TestToken.new('TokenA', 'TKA');
    token1 = await TestToken.new('TokenB', 'TKB');

    uniswapFactory = await MockUniswapV3Factory.new();
    m.log("Created UniswapFactory", last8(uniswapFactory.address));
    gotPair = await utils.createUniswapV3Pool(uniswapFactory, token0, token1, admin);

    token0 = await TestToken.at(await gotPair.token0());
    token1 = await TestToken.at(await gotPair.token1());


    let delegate = await OpenLevDelegate.new();
    let dexAgg = await utils.createDexAgg("0x0000000000000000000000000000000000000000", uniswapFactory.address);
    let univ3Addr = await dexAgg.uniV3Factory();
    m.log("UniV3Addr: ", univ3Addr);

    let price = await dexAgg.getPrice(token0.address, token1.address, Uni3DexData);
    m.log("DexAgg price: ", JSON.stringify(price));

    xole = await xOLE.new(admin);
    await xole.initialize(ole.address, dexAgg.address, 5000, dev, {from: admin});

    openLev = await OpenLevV1.new(controller.address, dexAgg.address, [token0.address, token1.address], "0x0000000000000000000000000000000000000000", xole.address, accounts[0], delegate.address);
    await controller.setOpenLev(openLev.address);
    await controller.setLPoolImplementation((await utils.createLPoolImpl()).address);
    await controller.setInterestParam(toBN(90e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '');
    await controller.createLPoolPair(token0.address, token1.address, 3000, 1); // 30% margin ratio

    assert.equal(await openLev.numPairs(), 1, "Should have one active pair");
    m.log("Reset OpenLev instance: ", last8(openLev.address));
  });

  it("Long Token0 with Token0 deposit, then close with dexData buyamount=0", async () => {
    let pairId = 0;
    let btc = token0;
    let usdt = token1;
    // provide some funds for trader and saver
    await utils.mint(btc, trader, 10000);
    await utils.mint(usdt, saver, 10000);

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await btc.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await usdt.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(500);

    let tx = await openLev.marginTrade(0, false, false, deposit, borrow, 0, Uni3DexData, {from: trader});
    // Check events
    assertPrint("Deposit BTC", '400000000000000000000', toBN(tx.logs[0].args.deposited));
    assertPrint("Borrow USDT", '500000000000000000000', toBN(tx.logs[0].args.borrowed));
    assertPrint("Held", '893327303890107812554', toBN(tx.logs[0].args.held));
    assertPrint("Fees", '2700000000000000000', toBN(tx.logs[0].args.fees));

    assertPrint("Insurance of Pool0:", '891000000000000000', (await openLev.markets(0)).pool0Insurance);

    // Check balances
    checkAmount("Trader BTC Balance", 9600000000000000000000, await btc.balanceOf(trader), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(xole.address), 18);
    checkAmount("Treasury BTC Balance", 1809000000000000000, await btc.balanceOf(xole.address), 18);
    checkAmount("OpenLev BTC Balance", 894218303890107812554, await btc.balanceOf(openLev.address), 18);


    let trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade.held:", trade.held);
    m.log("Trade.deposited:", trade.deposited);

    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, Uni3DexData, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(8041, marginRatio_2.current.toString());

    // Partial Close trade
    m.log("Partial Close Trade", 400);
    let tx_close = await openLev.closeTrade(0, 0, "400000000000000000000", 0, Uni3DexData, {from: trader});

    // Check contract held balance
    checkAmount("OpenLev USDT Balance", 0, await usdt.balanceOf(openLev.address), 18);
    checkAmount("OpenLev BTC Balance", 494614303890107812554, await btc.balanceOf(openLev.address), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Trader BTC Balance", 9774948435438776501236, await btc.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(xole.address), 18);
    checkAmount("Treasury BTC Balance", 2613000000000000000, await btc.balanceOf(xole.address), 18);
    // await printBlockNum();

    trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade held:", trade.held);
    m.log("Trade deposited:", trade.deposited);

    let ratio = await openLev.marginRatio(trader, 0, 0, Uni3DexData, {from: saver});
    m.log("Ratio, current:", ratio.current, "limit", ratio.marketLimit);
    assert.equal(7934, ratio.current.toString());

    // Partial Close trade
    let tx_full_close = await openLev.closeTrade(0, 0, "493327303890107812554", 0, Uni3DexData, {from: trader});
    checkAmount("OpenLev USDT Balance", 0, await usdt.balanceOf(openLev.address), 18);
    checkAmount("OpenLev BTC Balance", 1775394030851206734, await btc.balanceOf(openLev.address), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Trader BTC Balance", 9989275766146449073312, await btc.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(xole.address), 18);
    checkAmount("Treasury BTC Balance", 3604587880819116703, await btc.balanceOf(xole.address), 18);

    assertPrint("Insurance of Pool0:", '1775394030851206734', (await openLev.markets(0)).pool0Insurance);
    assertPrint("Insurance of Pool1:", '0', (await openLev.markets(0)).pool1Insurance);

  })

  it("Long Token0 with Token0 deposit, then close with dexData buyamount=uint(-1)", async () => {
    let pairId = 0;
    let btc = token0;
    let usdt = token1;
    // provide some funds for trader and saver
    await utils.mint(btc, trader, 10000);
    await utils.mint(usdt, saver, 10000);

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await btc.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await usdt.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(500);

    let tx = await openLev.marginTrade(0, false, false, deposit, borrow, 0, Uni3DexData, {from: trader});
    // Check events
    assertPrint("Deposit BTC", '400000000000000000000', toBN(tx.logs[0].args.deposited));
    assertPrint("Borrow USDT", '500000000000000000000', toBN(tx.logs[0].args.borrowed));
    assertPrint("Held", '893327303890107812554', toBN(tx.logs[0].args.held));
    assertPrint("Fees", '2700000000000000000', toBN(tx.logs[0].args.fees));

    assertPrint("Insurance of Pool0:", '891000000000000000', (await openLev.markets(0)).pool0Insurance);

    // Check balances
    checkAmount("Trader BTC Balance", 9600000000000000000000, await btc.balanceOf(trader), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(xole.address), 18);
    checkAmount("Treasury BTC Balance", 1809000000000000000, await btc.balanceOf(xole.address), 18);
    checkAmount("OpenLev BTC Balance", 894218303890107812554, await btc.balanceOf(openLev.address), 18);


    let trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade.held:", trade.held);
    m.log("Trade.deposited:", trade.deposited);

    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, Uni3DexData, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(8041, marginRatio_2.current.toString());

    // Partial Close trade
    m.log("Partial Close Trade", 400);
    let tx_close = await openLev.closeTrade(0, 0, "400000000000000000000", 0, Uni3DexDataMaxBuyAmount, {from: trader});

    // Check contract held balance
    checkAmount("OpenLev USDT Balance", 0, await usdt.balanceOf(openLev.address), 18);
    checkAmount("OpenLev BTC Balance", 494614303890107812554, await btc.balanceOf(openLev.address), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Trader BTC Balance", 9776001941194416054143, await btc.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(xole.address), 18);
    checkAmount("Treasury BTC Balance", 2613000000000000000, await btc.balanceOf(xole.address), 18);
    // await printBlockNum();

    trade = await openLev.activeTrades(trader, 0, 0);
    m.log("Trade held:", trade.held);
    m.log("Trade deposited:", trade.deposited);

    let ratio = await openLev.marginRatio(trader, 0, 0, Uni3DexData, {from: saver});
    m.log("Ratio, current:", ratio.current, "limit", ratio.marketLimit);
    assert.equal(7934, ratio.current.toString());

    // Partial Close trade
    let tx_full_close = await openLev.closeTrade(0, 0, "493327303890107812554", 0, Uni3DexDataMaxBuyAmount, {from: trader});
    checkAmount("OpenLev USDT Balance", 0, await usdt.balanceOf(openLev.address), 18);
    checkAmount("OpenLev BTC Balance", 1775394030851206734, await btc.balanceOf(openLev.address), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Trader BTC Balance", 9991622573557847443108, await btc.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(xole.address), 18);
    checkAmount("Treasury BTC Balance", 3604587880819116703, await btc.balanceOf(xole.address), 18);

    assertPrint("Insurance of Pool0:", '1775394030851206734', (await openLev.markets(0)).pool0Insurance);
    assertPrint("Insurance of Pool1:", '0', (await openLev.markets(0)).pool1Insurance);

  })

  it("Long Token1 with Token0 deposit, then liquidate with dexData buyamount=uint(-1)", async () => {
    let pairId = 0;
    let btc = token0;
    let usdt = token1;
    // provide some funds for trader and saver
    await utils.mint(btc, trader, 10000);
    await utils.mint(usdt, saver, 10000);

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await btc.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
    await usdt.approve(await pool1.address, utils.toWei(1000), {from: saver});
    await pool1.mint(saverSupply, {from: saver});

    let borrow = utils.toWei(500);

    await openLev.marginTrade(0, false, false, deposit, borrow, 0, Uni3DexData, {from: trader});
    //set price  1/2=0.5
    await gotPair.setPrice(btc.address, usdt.address, 1);
    await gotPair.setPreviousPrice(btc.address, usdt.address, 1);

    let marginRatio_2 = await openLev.marginRatio(trader, 0, false, Uni3DexData, {from: saver});
    m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
    assert.equal(0, marginRatio_2.current.toString());

    await openLev.liquidate(trader, 0, false, Uni3DexDataMaxBuyAmount, {from: saver});

    checkAmount("OpenLev USDT Balance", 0, await usdt.balanceOf(openLev.address), 18);
    checkAmount("OpenLev BTC Balance", 1775394030851206734, await btc.balanceOf(openLev.address), 18);
    checkAmount("Trader USDT Balance", 0, await usdt.balanceOf(trader), 18);
    checkAmount("Trader BTC Balance", 10364956796895533434763, await btc.balanceOf(trader), 18);
    checkAmount("Treasury USDT Balance", 0, await usdt.balanceOf(xole.address), 18);
    checkAmount("Treasury BTC Balance", 3604587880819116703, await btc.balanceOf(xole.address), 18);

    assertPrint("Insurance of Pool0:", '1775394030851206734', (await openLev.markets(0)).pool0Insurance);
    assertPrint("Insurance of Pool1:", '0', (await openLev.markets(0)).pool1Insurance);

  })


})
