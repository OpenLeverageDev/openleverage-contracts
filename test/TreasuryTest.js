const utils = require("./utils/OpenLevUtil");
const {
  toWei,
  last8,
  prettyPrintBalance,
  checkAmount,
  printBlockNum,
  wait,
  assertPrint,
  step,
  resetStep
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocks, toBN} = require("./utils/EtheUtil");
const Treasury = artifacts.require("TreasuryDelegator");
const TreasuryImpl = artifacts.require("Treasury");
const m = require('mocha-logger');
const TestToken = artifacts.require("MockERC20");
const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");
const timeMachine = require('ganache-time-traveler');

contract("OpenLev", async accounts => {

  // components
  let treasury;
  let openLevErc20;
  let dai;
  let usdt;
  let uniswapFactory;

  // roles
  let admin = accounts[0];
  let john = accounts[1];
  let tom = accounts[2];
  let dev = accounts[7];

  beforeEach(async () => {

    // runs once before the first test in this block
    let controller = await utils.createController(admin);
    m.log("Created Controller", last8(controller.address));

    uniswapFactory = await utils.createUniswapFactory(admin);
    m.log("Created UniswapFactory", last8(uniswapFactory.address));

    openLevErc20 = await TestToken.new('OpenLevERC20', 'OLE');
    usdt = await TestToken.new('Tether', 'USDT');
    dai = await TestToken.new('DAI', 'DAI');

    let pair = await MockUniswapV2Pair.new(usdt.address, dai.address, toWei(10000), toWei(10000));
    let lvrUsdtPair = await MockUniswapV2Pair.new(usdt.address, openLevErc20.address, toWei(100000), toWei(100000));

    m.log("Created MockUniswapV2Pair (", last8(await pair.token0()), ",", last8(await pair.token1()), ")");

    await uniswapFactory.addPair(pair.address);
    await uniswapFactory.addPair(lvrUsdtPair.address);
    m.log("Added pair", last8(pair.address));

    // Making sure the pair has been added correctly in mock
    let gotPair = await MockUniswapV2Pair.at(await uniswapFactory.getPair(usdt.address, dai.address));
    assert.equal(await pair.token0(), await gotPair.token0());
    assert.equal(await pair.token1(), await gotPair.token1());
    let treasuryImpl = await TreasuryImpl.new();
    treasury = await Treasury.new(uniswapFactory.address, openLevErc20.address, usdt.address, 50, dev, controller.address, treasuryImpl.address);
    m.log("Created Treasury", last8(treasury.address));

    await utils.mint(dai, treasury.address, 10000);

    resetStep();
  });

  it("Convert current erc20 holdings to reward, withdrawn dev fund", async () => {
    await treasury.convertToSharingToken(dai.address, toWei(1), 0);
    m.log("devFund:", (await treasury.devFund()).toString());
    m.log("totalStaked:", (await treasury.totalStaked()).toString());
    m.log("lastUpdateTime:", (await treasury.lastUpdateTime()).toString());
    m.log("rewardPerTokenStored:", (await treasury.rewardPerTokenStored()).toString());
    assert.equal('498450304504640887', (await treasury.devFund()).toString());

    m.log("Withdrawing dev fund");
    await treasury.devWithdraw('498450304504640887', {from: dev});
    assert.equal('0', (await treasury.devFund()).toString());
    assert.equal('498450304504640887', (await usdt.balanceOf(treasury.address)).toString());
    assert.equal('498450304504640887', (await usdt.balanceOf(dev)).toString());
    m.log("Treasury Dev Fund balance:", await treasury.devFund());
    m.log("Dev USDT balance:", await usdt.balanceOf(dev));
    m.log("Treasury USDT balance:", await usdt.balanceOf(treasury.address));
  })

  it("Convert LVR Token exceed available", async () => {
    await openLevErc20.mint(treasury.address, toWei(10000));
    await openLevErc20.mint(admin, toWei(10000));
    await openLevErc20.approve(treasury.address, toWei(10000));
    await treasury.stake(toWei(10000));

    await treasury.convertToSharingToken(openLevErc20.address, toWei(10000), 0);

    try {
      await treasury.convertToSharingToken(openLevErc20.address, toWei(1), 0);
      assert.fail("should thrown Exceed available balance error");
    } catch (error) {
      assert.include(error.message, 'Exceed available balance', 'throws exception with Exceed available balance');
    }
  })

  it("Convert Sharing Token correct", async () => {
    await dai.mint(treasury.address, toWei(1000));

    await openLevErc20.mint(admin, toWei(10000));
    await openLevErc20.approve(treasury.address, toWei(10000));
    await treasury.stake(toWei(10000));

    await treasury.convertToSharingToken(dai.address, toWei(1000), 0);

    m.log("Treasury USDT balance:", await usdt.balanceOf(treasury.address));

    assert.equal('906610893880149131581', (await usdt.balanceOf(treasury.address)).toString());

    m.log("Treasury totalToShared:", await treasury.totalToShared());

    assert.equal('453305446940074565791', (await treasury.totalToShared()).toString());

    m.log("Treasury devFund:", await treasury.devFund());

    assert.equal('453305446940074565790', (await treasury.devFund()).toString());

    m.log("Treasury transferredToAccount:", await treasury.transferredToAccount());

    assert.equal('0', (await treasury.transferredToAccount()).toString());

    await treasury.getReward();

    assert.equal('453305446940074560000', (await treasury.transferredToAccount()).toString());

    //add sharingToken Reward 2000
    await usdt.mint(treasury.address, toWei(2000));
    //sharing 1000
    await treasury.convertToSharingToken(usdt.address, toWei(1000), 0);

    assert.equal('953305446940074565791', (await treasury.totalToShared()).toString());

    await treasury.getReward();

    assert.equal('953305446940074560000', (await treasury.transferredToAccount()).toString());

    //Exceed available balance
    try {
      await treasury.convertToSharingToken(usdt.address, toWei(1001), 0);
      assert.fail("should thrown Exceed available balance error");
    } catch (error) {
      assert.include(error.message, 'Exceed available balance', 'throws exception with Exceed available balance');
    }
  })

  it("John and Tom stakes, Tom stakes more, shares fees", async () => {
    await openLevErc20.mint(john, toWei(10000));
    await openLevErc20.mint(tom, toWei(10000));

    await openLevErc20.approve(treasury.address, toWei(500), {from: john});
    await openLevErc20.approve(treasury.address, toWei(300), {from: tom});

    step("John stake 500");
    await treasury.stake(toWei(500), {from: john});
    step("Tom stake 300");
    await treasury.stake(toWei(300), {from: tom});
    assertPrint("Total staked:", toWei(800), await treasury.totalStaked());

    step("New reward 1");
    await treasury.convertToSharingToken(dai.address, toWei(1), 0);
    assertPrint("Dev Fund:", '498450304504640887', await treasury.devFund());
    assertPrint("Total to share:", '498450304504640887', await treasury.totalToShared());
    assertPrint("John earned:", '311531440315400500', await treasury.earned(john));
    assertPrint("Tom earned:", '186918864189240300', await treasury.earned(tom));
    assertPrint("Total of John and Tom", '498450304504640800',
      (await treasury.earned(john)).add(await treasury.earned(tom)));

    step("Tom stake more 200");
    await openLevErc20.approve(treasury.address, toWei(300), {from: tom});
    await treasury.stake(toWei(300), {from: tom});
    assertPrint("Total staked:", toWei(1100), await treasury.totalStaked());

    step("New reward 1");
    await treasury.convertToSharingToken(dai.address, toWei(1), 0);
    assertPrint("Dev Fund:", '996900609009281774', await treasury.devFund());
    assertPrint("John earned:", '538099760544782500', await treasury.earned(john));
    assertPrint("Tom earned:", '458800848464498700', await treasury.earned(tom));

    // Block time insensitive
    step("Advancing block time ...");
    timeMachine.advanceTimeAndBlock(1000);
    assertPrint("Dev Fund:", '996900609009281774', await treasury.devFund());
    assertPrint("John earned:", '538099760544782500', await treasury.earned(john));
    assertPrint("Tom earned:", '458800848464498700', await treasury.earned(tom));

    step("John stack more, but earning should not change because no new reward");
    await openLevErc20.approve(treasury.address, toWei(1000), {from: john});
    await treasury.stake(toWei(1000), {from: john});
    assertPrint("Total staked:", toWei(2100), await treasury.totalStaked());
    assertPrint("Dev Fund:", '996900609009281774', await treasury.devFund());
    assertPrint("John earned:", '538099760544782500', await treasury.earned(john));
    assertPrint("Tom earned:", '458800848464498700', await treasury.earned(tom));

    step("New reward 200");
    await treasury.convertToSharingToken(dai.address, toWei(200), 0);
    assertPrint("Dev Fund:", '98747748698112562359', await treasury.devFund());
    assertPrint("John earned:", '70360134109904267500', await treasury.earned(john));
    assertPrint("Tom earned:", '28387614588208292700', await treasury.earned(tom));

    step("John withdraw some stake, but earning should not change because no new reward");
    await treasury.withdraw(toWei(500), {from: john});
    assertPrint("Total staked:", toWei(1600), await treasury.totalStaked());
    assertPrint("Dev Fund:", '98747748698112562359', await treasury.devFund());
    assertPrint("John earned:", '70360134109904267500', await treasury.earned(john));
    assertPrint("Tom earned:", '28387614588208292700', await treasury.earned(tom));

    step("New reward 100");
    await treasury.convertToSharingToken(dai.address, toWei(100), 0);
    assertPrint("Dev Fund:", '148105650417965627301', await treasury.devFund());
    assertPrint("John earned:", '101208822684812432500', await treasury.earned(john));
    assertPrint("Tom earned:", '46896827733153191700', await treasury.earned(tom));

    step("John exit");
    await treasury.exit({from: john});
    assertPrint("John's OLE Balance:", '10000000000000000000000', await openLevErc20.balanceOf(john));
    assertPrint("Total staked:", toWei(600), await treasury.totalStaked());
    assertPrint("Dev Fund:", '148105650417965627301', await treasury.devFund());
    assertPrint("John earned:", '0', await treasury.earned(john));
    assertPrint("John's USDT Balance:", '101208822684812432500', await usdt.balanceOf(john));
    assertPrint("Tom earned:", '46896827733153191700', await treasury.earned(tom));

    step("New reward 100");
    await treasury.convertToSharingToken(dai.address, toWei(100), 0);
    assertPrint("Dev Fund:", '197463552137818692243', await treasury.devFund());
    assertPrint("John earned:", '0', await treasury.earned(john));
    assertPrint("Tom earned:", '96254729453006256300', await treasury.earned(tom));

    step("Tom exit, and more reward");
    await treasury.exit({from: tom});
    await treasury.convertToSharingToken(dai.address, toWei(100), 0);
    assertPrint("John earned:", '0', await treasury.earned(john));
    assertPrint("Tom earned:", '0', await treasury.earned(tom));

    step("John stack more, but earning should not change because no new reward");
    await openLevErc20.approve(treasury.address, toWei(1000), {from: john});
    await treasury.stake(toWei(1000), {from: john});
    assertPrint("John earned:", '0', await treasury.earned(john));

    step("New reward 100");
    await treasury.convertToSharingToken(dai.address, toWei(100), 0);
    assertPrint("Dev Fund:", '296179355577524822127', await treasury.devFund());
    assertPrint("John earned:", '49357901719853064000', await treasury.earned(john));

  })

  /*** Admin Test ***/

  it("Admin setDevFundRatio test", async () => {
    let timeLock = await utils.createTimelock(admin);
    let treasuryImpl = await TreasuryImpl.new();
    let treasury = await Treasury.new(usdt.address, usdt.address,accounts[0],
      50, dev, timeLock.address, treasuryImpl.address);
    await timeLock.executeTransaction(treasury.address, 0, 'setDevFundRatio(uint256)',
      web3.eth.abi.encodeParameters(['uint256'], [1]), 0)
    assert.equal(1, await treasury.devFundRatio());
    try {
      await treasury.setDevFundRatio(1);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })

  it("Admin setDev test", async () => {
    let newDev = accounts[7];
    let timeLock = await utils.createTimelock(admin);
    let treasuryImpl = await TreasuryImpl.new();
    let treasury = await Treasury.new(usdt.address, usdt.address,accounts[0],
      50, dev, timeLock.address, treasuryImpl.address);
    await timeLock.executeTransaction(treasury.address, 0, 'setDev(address)',
      web3.eth.abi.encodeParameters(['address'], [newDev]), 0)
    assert.equal(newDev, await treasury.dev());
    try {
      await treasury.setDev(newDev);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })

  it("Admin setImplementation test", async () => {
    let timeLock = await utils.createTimelock(admin);
    let treasuryImpl = await TreasuryImpl.new();
    let treasury = await Treasury.new(usdt.address, usdt.address,accounts[0],
      50, dev, timeLock.address, treasuryImpl.address);
    let instance = await TreasuryImpl.new();

    await timeLock.executeTransaction(treasury.address, 0, 'setImplementation(address)',
      web3.eth.abi.encodeParameters(['address'], [instance.address]), 0)
    assert.equal(instance.address, await treasury.implementation());
    try {
      await treasury.setImplementation(instance.address);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });
})
