const utils = require("./utils/OpenLevUtil");
const {
  toWei,
  last8,
  prettyPrintBalance,
  checkAmount,
  printBlockNum,
  wait,
  assertPrint,
  Uni2DexData,
  step,
  resetStep
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocksAndTime, toBN} = require("./utils/EtheUtil");
const Treasury = artifacts.require("TreasuryDelegator");
const xOLE = artifacts.require("xOLE");
const m = require('mocha-logger');
const TestToken = artifacts.require("MockERC20");
const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");
const timeMachine = require('ganache-time-traveler');

contract("Treasury", async accounts => {

  // components
  let xole;
  let ole;
  let dai;
  let usdt;
  let uniswapFactory;

  let H = 3600;
  let DAY = 86400;
  let WEEK = 7 * DAY;
  let MAXTIME = 126144000;
  let TOL = 120 / WEEK;

  // roles
  let admin = accounts[0];
  let john = accounts[1];
  let tom = accounts[2];
  let dev = accounts[7];

  beforeEach(async () => {

    // runs once before the first test in this block
    let controller = await utils.createController(admin);
    m.log("Created Controller", last8(controller.address));

    uniswapFactory = await utils.createUniswapV2Factory(admin);
    m.log("Created UniswapFactory", last8(uniswapFactory.address));

    ole = await TestToken.new('OpenLevERC20', 'OLE');
    usdt = await TestToken.new('Tether', 'USDT');
    dai = await TestToken.new('DAI', 'DAI');

    let pair = await MockUniswapV2Pair.new(usdt.address, dai.address, toWei(10000), toWei(10000));
    let oleUsdtPair = await MockUniswapV2Pair.new(usdt.address, ole.address, toWei(100000), toWei(100000));
    let oleDaiPair = await MockUniswapV2Pair.new(dai.address, ole.address, toWei(100000), toWei(100000));

    m.log("Created MockUniswapV2Pair (", last8(await pair.token0()), ",", last8(await pair.token1()), ")");

    await uniswapFactory.addPair(pair.address);
    await uniswapFactory.addPair(oleUsdtPair.address);
    await uniswapFactory.addPair(oleDaiPair.address);
    m.log("Added pairs", last8(pair.address), last8(oleUsdtPair.address), last8(oleDaiPair.address));
    let dexAgg = await utils.createDexAgg(uniswapFactory.address);
    // Making sure the pair has been added correctly in mock
    let gotPair = await MockUniswapV2Pair.at(await uniswapFactory.getPair(usdt.address, dai.address));
    assert.equal(await pair.token0(), await gotPair.token0());
    assert.equal(await pair.token1(), await gotPair.token1());

    xole = await xOLE.new(admin);
    await xole.initialize(ole.address, dexAgg.address, 5000, dev, {from: admin});

    m.log("Created xOLE", last8(xole.address));
    await utils.mint(usdt, xole.address, 10000);

    resetStep();
  });

  it("Convert current erc20 holdings to reward, withdrawn dev fund", async () => {

    assert.equal('0', (await ole.balanceOf(xole.address)).toString());

    await ole.mint(admin, toWei(10000));
    await ole.approve(xole.address, toWei(10000));
    let lastbk = await web3.eth.getBlock('latest');
    await xole.create_lock(toWei(10000), lastbk.timestamp + WEEK);

    await xole.convertToSharingToken(usdt.address, toWei(1), 0, Uni2DexData);
    m.log("devFund:", (await xole.devFund()).toString());
    m.log("totalRewarded:", (await xole.totalRewarded()).toString());
    m.log("supply:", (await xole.supply()).toString());
    m.log("lastUpdateTime:", (await xole.lastUpdateTime()).toString());
    m.log("rewardPerTokenStored:", (await xole.rewardPerTokenStored()).toString());
    assert.equal('498495030004550854', (await xole.devFund()).toString());

    m.log("Withdrawing dev fund");
    await xole.withdrawDevFund({from: dev});
    assert.equal('0', (await xole.devFund()).toString());
    assert.equal('10000498495030004550855', (await ole.balanceOf(xole.address)).toString());
    assert.equal('498495030004550854', (await ole.balanceOf(dev)).toString());
    m.log("Treasury Dev Fund balance:", await xole.devFund());
    m.log("Dev OLE balance:", await ole.balanceOf(dev));
    m.log("Treasury USDT balance:", await ole.balanceOf(xole.address));
  })

  it("Convert OLE Token exceed available", async () => {
    await ole.mint(xole.address, toWei(10000));
    await ole.mint(admin, toWei(10000));
    await ole.approve(xole.address, toWei(10000));
    let lastbk = await web3.eth.getBlock('latest');
    await xole.create_lock(toWei(10000), lastbk.timestamp + WEEK);

    await xole.convertToSharingToken(ole.address, toWei(10000), 0, Uni2DexData);

    m.log("Withdrawing dev fund");
    await xole.withdrawDevFund({from: dev});

    m.log("ole balance in xOLE:", await ole.balanceOf(xole.address));
    m.log("supply:", await xole.supply());
    m.log("totalRewarded:", await xole.totalRewarded());
    m.log("withdrewReward:", await xole.withdrewReward());
    m.log("devFund:", await xole.devFund());


    try {
      await xole.convertToSharingToken(ole.address, toWei(1), 0, Uni2DexData);
      assert.fail("should thrown Exceed available balance error");
    } catch (error) {
      assert.include(error.message, 'Exceed OLE balance', 'throws exception with Exceed available balance');
    }
  })

  it("Convert Sharing Token correct", async () => {
    await dai.mint(xole.address, toWei(1000));
    await ole.mint(admin, toWei(10000));
    await ole.approve(xole.address, toWei(10000));
    let lastbk = await web3.eth.getBlock('latest');
    await xole.create_lock(toWei(10000), lastbk.timestamp + WEEK);

    await xole.convertToSharingToken(dai.address, toWei(1000), 0, Uni2DexData);

    m.log("xOLE OLE balance:", await ole.balanceOf(xole.address));
    assert.equal('10987158034397061298850', (await ole.balanceOf(xole.address)).toString());

    m.log("xOLE totalRewarded:", await xole.totalRewarded());
    assert.equal('493579017198530649425', (await xole.totalRewarded()).toString());

    m.log("xOLE devFund:", await xole.devFund());
    assert.equal('493579017198530649425', (await xole.devFund()).toString());

    m.log("xOLE withdrewReward:", await xole.withdrewReward());
    assert.equal('0', (await xole.withdrewReward()).toString());

    m.log("xOLE withdrewReward:", await xole.withdrewReward());

    await xole.withdrawReward();

    assert.equal('493579017198530640000', (await ole.balanceOf(admin)).toString());

    assert.equal('493579017198530640000', (await xole.withdrewReward()).toString());

    //add sharingToken Reward 2000
    await usdt.mint(xole.address, toWei(2000));
    //sharing 1000
    await xole.convertToSharingToken(usdt.address, toWei(1000), 0, Uni2DexData);

    assert.equal('987158034397061298850', (await xole.totalRewarded()).toString());

    //Exceed available balance
    try {
      await xole.convertToSharingToken(usdt.address, toWei(1001), 0, Uni2DexData);
      assert.fail("should thrown Exceed available balance error");
    } catch (error) {
      assert.include(error.message, 'Exceed available balance', 'throws exception with Exceed available balance');
    }
  })

  it("John and Tom stakes, Tom stakes more, shares fees", async () => {
    await ole.mint(john, toWei(10000));
    await ole.mint(tom, toWei(10000));
    await dai.mint(xole.address, toWei(1000));

    await ole.approve(xole.address, toWei(500), {from: john});
    await ole.approve(xole.address, toWei(300), {from: tom});

    let lastbk = await web3.eth.getBlock('latest');
    step("John stake 500");
    await xole.create_lock(toWei(500), lastbk.timestamp + WEEK, {from: john});
    assertPrint("John staked:", toWei(500), (await xole.locked(john)).amount);
    step("Tom stake 300");
    await xole.create_lock(toWei(300), lastbk.timestamp + WEEK, {from: tom});
    assertPrint("Tom staked:", toWei(300), (await xole.locked(tom)).amount);
    assertPrint("Total staked:", toWei(800), await xole.supply());

    step("New reward 1");
    await xole.convertToSharingToken(dai.address, toWei(1), 0, Uni2DexData);
    assertPrint("Dev Fund:", '498495030004550854', await xole.devFund());
    assertPrint("Total to share:", '498495030004550855', await xole.totalRewarded());
    assertPrint("John earned:", '311559393752844000', await xole.earned(john));
    assertPrint("Tom earned:", '186935636251706400', await xole.earned(tom));
    assertPrint("Total of John and Tom", '498495030004550400',
      (await xole.earned(john)).add(await xole.earned(tom)));

    step("Tom stake more 200");
    await ole.approve(xole.address, toWei(200), {from: tom});
    await xole.increase_amount(toWei(200), {from: tom});
    assertPrint("Tom staked:", toWei(500), (await xole.locked(tom)).amount);
    assertPrint("John staked:", toWei(500), (await xole.locked(john)).amount);
    assertPrint("Total staked:", toWei(1000), await xole.supply());

    step("New reward 1");
    await xole.convertToSharingToken(dai.address, toWei(1), 0, Uni2DexData);
    assertPrint("Dev Fund:", '996980105262148814', await xole.devFund());
    assertPrint("John earned:", '560801931381642500', await xole.earned(john));
    assertPrint("Tom earned:", '436178173880504900', await xole.earned(tom));

    // Block time insensitive
    step("Advancing block time ...");
    timeMachine.advanceTimeAndBlock(1000);
    assertPrint("Dev Fund:", '996980105262148814', await xole.devFund());
    assertPrint("John earned:", '560801931381642500', await xole.earned(john));
    assertPrint("Tom earned:", '436178173880504900', await xole.earned(tom));

    step("John stack more, but earning should not change because no new reward");
    await ole.approve(xole.address, toWei(1000), {from: john});
    await xole.increase_amount(toWei(1000), {from: john});
    assertPrint("Total staked:", toWei(2000), await xole.supply());
    assertPrint("Dev Fund:", '996980105262148814', await xole.devFund());
    assertPrint("John earned:", '560801931381642500', await xole.earned(john));
    assertPrint("Tom earned:", '436178173880504900', await xole.earned(tom));

    step("New reward 200");
    await xole.convertToSharingToken(dai.address, toWei(200), 0, Uni2DexData);
    assertPrint("Dev Fund:", '100494603912584309258', await xole.devFund());
    assertPrint("John earned:", '75184019786873262500', await xole.earned(john));
    assertPrint("Tom earned:", '25310584125711044900', await xole.earned(tom));

    await advanceMultipleBlocksAndTime(40400);
    step("John exits, but earning should not change because no new reward");
    await xole.withdraw({from: john});
    assertPrint("Total staked:", toWei(500), await xole.supply());
    assertPrint("Dev Fund:", '100494603912584309258', await xole.devFund());
    assertPrint("John earned:", '0', await xole.earned(john));
    assertPrint("Tom earned:", '25310584125711044900', await xole.earned(tom));

    step("New reward 100");
    await xole.convertToSharingToken(dai.address, toWei(100), 0, Uni2DexData);
    assertPrint("Dev Fund:", '150094767100146587308', await xole.devFund());
    assertPrint("John earned:", '0', await xole.earned(john));
    assertPrint("Tom earned:", '74910747313273322900', await xole.earned(tom));

    step("Tom exit, and more reward");
    await xole.withdraw({from: tom});

    step("John stack more, but earning should not change because no new reward");
    await ole.approve(xole.address, toWei(1000), {from: john});
    lastbk = await web3.eth.getBlock('latest');
    await xole.create_lock(toWei(1000), lastbk.timestamp + WEEK, {from: john});
    assertPrint("John earned:", '0', await xole.earned(john));

    step("New reward 100");
    await xole.convertToSharingToken(dai.address, toWei(100), 0, Uni2DexData);
    assertPrint("Dev Fund:", '199596275059873518079', await xole.devFund());
    assertPrint("John earned:", '49501507959726930000', await xole.earned(john));

    await advanceMultipleBlocksAndTime(10);
    lastbk = await web3.eth.getBlock('latest');
    await xole.increase_unlock_time(lastbk.timestamp + 2 * WEEK, {from: john});
    assertPrint("Dev Fund:", '199596275059873518079', await xole.devFund());
    assertPrint("John earned:", '49501507959726930000', await xole.earned(john));

    step("New reward 100");
    await xole.convertToSharingToken(dai.address, toWei(100), 0, Uni2DexData);
    assertPrint("Dev Fund:", '248999421985512891445', await xole.devFund());
    assertPrint("John earned:", '98904654885366303000', await xole.earned(john));

  })

  // Admin Test TODO
  // it("Admin setDevFundRatio test", async () => {
  //   let timeLock = await utils.createTimelock(admin);
  //   let treasuryImpl = await xOLE.new();
  //   let treasury = await Treasury.new(usdt.address, usdt.address, accounts[0],
  //     50, dev, timeLock.address, treasuryImpl.address);
  //   await timeLock.executeTransaction(treasury.address, 0, 'setDevFundRatio(uint256)',
  //     web3.eth.abi.encodeParameters(['uint256'], [1]), 0)
  //   assert.equal(1, await treasury.devFundRatio());
  //   try {
  //     await treasury.setDevFundRatio(1);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  //
  // it("Admin setDev test", async () => {
  //   let newDev = accounts[7];
  //   let timeLock = await utils.createTimelock(admin);
  //   let treasuryImpl = await xOLE.new();
  //   let treasury = await Treasury.new(usdt.address, usdt.address, accounts[0],
  //     50, dev, timeLock.address, treasuryImpl.address);
  //   await timeLock.executeTransaction(treasury.address, 0, 'setDev(address)',
  //     web3.eth.abi.encodeParameters(['address'], [newDev]), 0)
  //   assert.equal(newDev, await treasury.dev());
  //   try {
  //     await treasury.setDev(newDev);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })

  // it("Admin setImplementation test", async () => {
  //   let timeLock = await utils.createTimelock(admin);
  //   let treasuryImpl = await xOLE.new();
  //   let treasury = await Treasury.new(usdt.address, usdt.address, accounts[0],
  //     50, dev, timeLock.address, treasuryImpl.address);
  //   let instance = await xOLE.new();
  //
  //   await timeLock.executeTransaction(treasury.address, 0, 'setImplementation(address)',
  //     web3.eth.abi.encodeParameters(['address'], [instance.address]), 0)
  //   assert.equal(instance.address, await treasury.implementation());
  //   try {
  //     await treasury.setImplementation(instance.address);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // });
})
