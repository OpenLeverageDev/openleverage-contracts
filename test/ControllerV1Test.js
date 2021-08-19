const utils = require("./utils/OpenLevUtil");
const m = require('mocha-logger');
const LPool = artifacts.require("LPoolDelegator");
const {advanceBlockAndSetTime, toBN} = require("./utils/EtheUtil");
const timeMachine = require('ganache-time-traveler');
const {mint, Uni3DexData} = require("./utils/OpenLevUtil");
const Controller = artifacts.require('ControllerV1');

contract("ControllerV1", async accounts => {
  let admin = accounts[0];
  it("create lpool pair succeed test", async () => {
    let {controller, tokenA, tokenB} = await instanceController();
    let transaction = await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
    let token0 = transaction.logs[0].args.token0;
    let token1 = transaction.logs[0].args.token1;
    let pool0 = transaction.logs[0].args.pool0;
    let pool1 = transaction.logs[0].args.pool1;
    m.log("created pool pair toke0,token1,pool0,poo1", token0, token1, pool0, pool1);
    let lpoolPairs = await controller.lpoolPairs(token0, token1);
    assert.equal(lpoolPairs.lpool0, pool0);
    assert.equal(lpoolPairs.lpool1, pool1);
    let pool0Ctr = await LPool.at(pool0);
    let pool1Ctr = await LPool.at(pool1);
    assert.equal(token0, await pool0Ctr.underlying());
    assert.equal(token1, await pool1Ctr.underlying());

    assert.equal("LToken", await pool0Ctr.symbol());
    assert.equal("LToken", await pool1Ctr.symbol());

    m.log("pool0 token name:", await pool0Ctr.name());
    m.log("pool1 token name:", await pool1Ctr.name());
    m.log("pool0 token symbol:", await pool0Ctr.symbol());
    m.log("pool1 token symbol:", await pool1Ctr.symbol());

  });

  it("create lpool pair failed with same token test", async () => {
    let {controller, tokenA, tokenB} = await instanceController();
    try {
      await controller.createLPoolPair(tokenA.address, tokenA.address, 3000, 1);
      assert.fail("should thrown identical address error");
    } catch (error) {
      assert.include(error.message, 'identical address', 'throws exception with identical address.');
    }
  });

  it("create lpool pair failed with pool exists test", async () => {
    let {controller, tokenA, tokenB} = await instanceController();
    await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
    try {
      await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
      assert.fail("should thrown pool pair exists error");
    } catch (error) {
      assert.include(error.message, 'pool pair exists', 'throws exception pool pair exists.');
    }
  });


  it("Distribution by supply test", async () => {
    let {controller, tokenA, tokenB, oleToken} = await instanceController();
    await oleToken.mint(controller.address, utils.toWei(700));
    await controller.setOLETokenDistribution(utils.toWei(200), utils.toWei(4), 300, utils.toWei(400));
    let transaction = await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
    let pool0 = transaction.logs[0].args.pool0;
    let pool1 = transaction.logs[0].args.pool1;
    //start after 10s【duration 30days】
    await controller.distributeRewards2Pool(pool0, utils.toWei(200), utils.toWei(100), await utils.lastBlockTime() + 10, 60 * 60 * 24 * 30);
    //supply
    let pool0Ctr = await LPool.at(pool0);
    let token0Ctr = await utils.tokenAt(await pool0Ctr.underlying());
    await token0Ctr.mint(accounts[0], utils.toWei(10));
    m.log("not minted reward", await controller.earned(pool0, accounts[0], false));
    await token0Ctr.approve(pool0, utils.toWei(10));
    await pool0Ctr.mint(utils.toWei(1));
    m.log("minted not start reward", await controller.earned(pool0, accounts[0], false));
    let pool0Dist = await controller.lpoolDistributions(pool0, false);
    m.log("pool0Dist", JSON.stringify(pool0Dist));
    let advantageTs = toBN(pool0Dist.startTime).add(toBN(24 * 60 * 60)).toString();
    m.log("advantageTs", advantageTs);
    //check reward between
    let snapshotId = (await timeMachine.takeSnapshot()).result;
    await advanceBlockAndSetTime(advantageTs);
    let reward = await controller.earned(pool0, accounts[0], false);
    m.log("minted started reward", reward);
    assert.equal('6666666666666624000', reward.toString());
    //account1 mint
    await token0Ctr.mint(accounts[1], utils.toWei(10));
    await token0Ctr.approve(pool0, utils.toWei(10), {from: accounts[1]});
    await pool0Ctr.mint(utils.toWei(1), {from: accounts[1]});
    //check reward end
    await advanceBlockAndSetTime(toBN(pool0Dist.endTime).toString());
    let endRewardAcc0 = await controller.earned(pool0, accounts[0], false);
    let endRewardAcc1 = await controller.earned(pool0, accounts[1], false);
    m.log("minted ended reward acc0", utils.toETH(endRewardAcc0));
    m.log("minted ended reward acc1", utils.toETH(endRewardAcc1));
    await timeMachine.revertToSnapshot(snapshotId);
    assert.equal('103', utils.toETH(endRewardAcc0));
    assert.equal('96', utils.toETH(endRewardAcc1));
  });

  it("Distribution by borrow test", async () => {
    let {controller, tokenA, tokenB, oleToken, openLev} = await instanceController();
    await oleToken.mint(controller.address, utils.toWei(700));
    await controller.setOLETokenDistribution(utils.toWei(200), utils.toWei(4), 300, utils.toWei(400));
    let transaction = await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
    let pool0 = transaction.logs[0].args.pool0;
    //start after 10s【duration 30days】
    await controller.distributeRewards2Pool(pool0, utils.toWei(100), utils.toWei(200), await utils.lastBlockTime() + 10, 60 * 60 * 24 * 30);
    //supply
    let pool0Ctr = await LPool.at(pool0);
    let token0Ctr = await utils.tokenAt(await pool0Ctr.underlying());
    await token0Ctr.mint(accounts[0], utils.toWei(10));
    await token0Ctr.approve(pool0, utils.toWei(10));
    await pool0Ctr.mint(utils.toWei(5));
    await controller.setOpenLev("0x0000000000000000000000000000000000000000");
    await pool0Ctr.borrowBehalf(accounts[1], utils.toWei(1));
    let pool0Dist = await controller.lpoolDistributions(pool0, true);
    m.log("pool0 borrow dist ", JSON.stringify(pool0Dist));
    let advantageTs = toBN(pool0Dist.startTime).add(toBN(24 * 60 * 60)).toString();
    //check reward between
    let snapshotId = (await timeMachine.takeSnapshot()).result;
    await advanceBlockAndSetTime(advantageTs);
    let reward = await controller.earned(pool0, accounts[1], true);
    m.log("minted started reward", reward);
    await timeMachine.revertToSnapshot(snapshotId);
    assert.equal('6666666666666623992', reward.toString());
  });

  it("Distribution by liquidator test", async () => {
    let trader = accounts[0];
    let liquidator = accounts[1];
    let {controller, tokenA, tokenB, oleToken, pair, openLev} = await instanceController();
    await oleToken.mint(controller.address, utils.toWei(700));
    await controller.setOLETokenDistribution(utils.toWei(200), utils.toWei(100), 300, utils.toWei(400));
    await controller.distributeLiqRewards2Market(0, true);
    let transaction = await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
    let pool0 = transaction.logs[0].args.pool0;
    let pool1 = transaction.logs[0].args.pool1;
    let pool0Ctr = await LPool.at(pool0);
    let pool1Ctr = await LPool.at(pool1);
    let token0Ctr = await utils.tokenAt(await pool0Ctr.underlying());
    let token1Ctr = await utils.tokenAt(await pool1Ctr.underlying());
    await token1Ctr.mint(trader, utils.toWei(10));
    await token1Ctr.approve(pool1, utils.toWei(10));
    await pool1Ctr.mint(utils.toWei(5));

    await token0Ctr.mint(trader, utils.toWei(10));
    await token0Ctr.approve(openLev.address, utils.toWei(10));

    await openLev.marginTrade(0, false, false, utils.toWei(1), utils.toWei(1), 0, Uni3DexData);


    await pair.setPrice(tokenA.address, tokenB.address, 1);
    await pair.setPreviousPrice(tokenA.address, tokenB.address, 1);
    let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, Uni3DexData);
    m.log("Margin Ratio_2:", marginRatio_2.current / 100, "%");


    // ole token price 1 10gwei
    let txLiq = await openLev.liquidate(trader, 0, 0, Uni3DexData, {
      from: liquidator,
      gasPrice: 10000000000,
      gas: 900000
    });

    m.log("txLiq gasUsed:", txLiq.receipt.gasUsed);

    m.log("liquidator ole balance:", (await oleToken.balanceOf(liquidator)).toString());

    let distribution = await controller.oleTokenDistribution();
    assert.equal("180", (await oleToken.balanceOf(liquidator)).div(toBN(10 ** 14)).toString());
    assert.equal("199", distribution.liquidatorBalance.div(toBN(10 ** 18)).toString());
  });

  it("Distribution by add reward test", async () => {
    let {controller, tokenA, tokenB, oleToken, openLev} = await instanceController();
    await oleToken.mint(controller.address, utils.toWei(700));
    await controller.setOLETokenDistribution(utils.toWei(200), utils.toWei(4), 300, utils.toWei(400));
    let transaction = await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
    let pool0 = transaction.logs[0].args.pool0;
    //start after 10s【duration 30days】
    await controller.distributeRewards2Pool(pool0, utils.toWei(100), utils.toWei(200), await utils.lastBlockTime() + 10, 60 * 60 * 24 * 30);
    //supply
    let pool0Ctr = await LPool.at(pool0);
    let token0Ctr = await utils.tokenAt(await pool0Ctr.underlying());
    await token0Ctr.mint(accounts[0], utils.toWei(10));
    await token0Ctr.approve(pool0, utils.toWei(10));
    await pool0Ctr.mint(utils.toWei(5));
    let pool0Dist = await controller.lpoolDistributions(pool0, false);
    let advantageTs = toBN(pool0Dist.startTime).add(toBN(24 * 60 * 60)).toString();
    //check reward between
    let snapshotId = (await timeMachine.takeSnapshot()).result;
    //advantage  1day
    await advanceBlockAndSetTime(advantageTs);
    let reward = await controller.earned(pool0, accounts[0], false);
    m.log("minted started reward", reward);
    assert.equal('3333333333333312000', reward.toString());
    await controller.distributeRewards2PoolMore(pool0, utils.toWei(100), 0);
    //advantage more 1day
    advantageTs = toBN(pool0Dist.startTime).add(toBN(48 * 60 * 60)).toString();
    await advanceBlockAndSetTime(advantageTs);
    let addReward = await controller.earned(pool0, accounts[0], false);
    await timeMachine.revertToSnapshot(snapshotId);
    m.log("minted added reward", addReward);
    assert.equal('98888', addReward.div(toBN(1E14)).toString());

  });
  it("Distribution more by not enough balance test", async () => {
    let {controller, tokenA, tokenB, oleToken} = await instanceController();
    await oleToken.mint(controller.address, utils.toWei(700));
    try {
      await controller.setOLETokenDistribution(utils.toWei(200), utils.toWei(4), 300, utils.toWei(400));
      assert.fail("should thrown not enough balance error");
    } catch (error) {
      assert.include(error.message, 'not enough balance', 'throws exception with not enough balance');
    }
  });

  it("Get all supply distribution test", async () => {
    let {controller, tokenA, tokenB, oleToken} = await instanceController();
    await oleToken.mint(controller.address, utils.toWei(700));
    await controller.setOLETokenDistribution(utils.toWei(0), utils.toWei(0), 300, utils.toWei(600));
    let transaction = await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
    let pool0 = transaction.logs[0].args.pool0;
    let pool1 = transaction.logs[0].args.pool1;
    //start after 10s【duration 30days】
    await controller.distributeRewards2Pool(pool0, utils.toWei(200), utils.toWei(100), await utils.lastBlockTime() + 10, 60 * 60 * 24 * 30);
    await controller.distributeRewards2Pool(pool1, utils.toWei(200), utils.toWei(100), await utils.lastBlockTime() + 10, 60 * 60 * 24 * 30);

    //supply pool0
    let pool0Ctr = await LPool.at(pool0);
    let token0Ctr = await utils.tokenAt(await pool0Ctr.underlying());
    await token0Ctr.mint(accounts[0], utils.toWei(10));
    m.log("not minted reward", await controller.earned(pool0, accounts[0], false));
    await token0Ctr.approve(pool0, utils.toWei(10));
    await pool0Ctr.mint(utils.toWei(1));
    //supply pool1
    let pool1Ctr = await LPool.at(pool1);
    let token1Ctr = await utils.tokenAt(await pool1Ctr.underlying());
    await token1Ctr.mint(accounts[0], utils.toWei(10));
    m.log("not minted reward", await controller.earned(pool1, accounts[0], false));
    await token1Ctr.approve(pool1, utils.toWei(10));
    await pool1Ctr.mint(utils.toWei(1));


    m.log("minted not start reward", await controller.earned(pool0, accounts[0], false));
    let pool0Dist = await controller.lpoolDistributions(pool0, false);
    m.log("pool0Dist", JSON.stringify(pool0Dist));
    let advantageTs = toBN(pool0Dist.startTime).add(toBN(24 * 60 * 60)).toString();
    m.log("advantageTs", advantageTs);
    let beforeBalance = await oleToken.balanceOf(accounts[0]);
    m.log("beforeBalance", beforeBalance.toString());
    //check reward between
    let snapshotId = (await timeMachine.takeSnapshot()).result;
    await advanceBlockAndSetTime(toBN(pool0Dist.endTime).toString());
    let pool0Reward = await controller.earned(pool0, accounts[0], false);
    let pool1Reward = await controller.earned(pool1, accounts[0], false);
    m.log("pool0Reward", utils.toETH(pool0Reward));
    m.log("pool1Reward", utils.toETH(pool1Reward));
    await controller.getSupplyRewards([pool0, pool1], accounts[0]);
    //check rewards is reset
    let pool0RewardAfterRedraw = await controller.earned(pool0, accounts[0], false);
    let pool1RewardAfterRedraw = await controller.earned(pool1, accounts[0], false);
    m.log("pool0RewardAfterRedraw", utils.toETH(pool0RewardAfterRedraw));
    m.log("pool1RewardAfterRedraw", utils.toETH(pool1RewardAfterRedraw));
    assert.equal('0', utils.toETH(pool0RewardAfterRedraw));
    assert.equal('0', utils.toETH(pool1RewardAfterRedraw));

    let afterBalance = await oleToken.balanceOf(accounts[0]);
    m.log("afterBalance", afterBalance.toString());


    await timeMachine.revertToSnapshot(snapshotId);
    assert.equal('399', utils.toETH(afterBalance));

  });

  it("Distribution by supply and transfer to other test", async () => {
    let {controller, tokenA, tokenB, oleToken} = await instanceController();
    await oleToken.mint(controller.address, utils.toWei(700));
    await controller.setOLETokenDistribution(utils.toWei(0), utils.toWei(0), 300, utils.toWei(600));
    let transaction = await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
    let pool0 = transaction.logs[0].args.pool0;
    //start after 10s【duration 30days】
    await controller.distributeRewards2Pool(pool0, utils.toWei(200), utils.toWei(0), await utils.lastBlockTime() + 10, 60 * 60 * 24 * 30);

    //supply pool0
    let pool0Ctr = await LPool.at(pool0);
    let token0Ctr = await utils.tokenAt(await pool0Ctr.underlying());
    await token0Ctr.mint(accounts[0], utils.toWei(100));
    m.log("not minted reward", await controller.earned(pool0, accounts[0], false));
    await token0Ctr.approve(pool0, utils.toWei(1000));
    await pool0Ctr.mint(utils.toWei(10));

    m.log("minted not start reward", await controller.earned(pool0, accounts[0], false));
    let pool0Dist = await controller.lpoolDistributions(pool0, false);
    m.log("pool0Dist", JSON.stringify(pool0Dist));
    let advantageTs = toBN(pool0Dist.startTime).add(toBN(24 * 60 * 60)).toString();
    m.log("advantageTs", advantageTs);
    await advanceBlockAndSetTime(advantageTs);

    let account0Reward1day = await controller.earned(pool0, accounts[0], false);

    m.log("account0 reward1day", account0Reward1day.toString());

    assert.equal('6666666666666624000', account0Reward1day);
    await pool0Ctr.transfer(accounts[1], toBN(await pool0Ctr.balanceOf(accounts[0])).div(toBN(2)));

    let account0RewardAfterTransfer = await controller.earned(pool0, accounts[0], false);
    let account1RewardAfterTransfer = await controller.earned(pool0, accounts[1], false);
    await pool0Ctr.mint(utils.toWei(10));

    m.log("account0 balanceAfterTransfer", toBN(await pool0Ctr.balanceOf(accounts[0])).toString());
    m.log("account1 balanceAfterTransfer", toBN(await pool0Ctr.balanceOf(accounts[1])).toString());

    m.log("account0 rewardAfterTransfer", account0RewardAfterTransfer.toString());
    m.log("account1 rewardAfterTransfer", account1RewardAfterTransfer.toString());
    assert.equal('66', toBN(account0RewardAfterTransfer).div(toBN(1e17)));
    assert.equal('0', account1RewardAfterTransfer);

    //check reward between
    let snapshotId = (await timeMachine.takeSnapshot()).result;
    await advanceBlockAndSetTime(toBN(pool0Dist.endTime).toString());
    let account0EndReward = await controller.earned(pool0, accounts[0], false);
    let account1EndReward = await controller.earned(pool0, accounts[1], false);
    m.log("account0 rewardEnd", account0EndReward.toString());
    m.log("account1 rewardEnd", account1EndReward.toString());
    assert.equal('1516', toBN(account0EndReward).div(toBN(1e17)));
    assert.equal('483', toBN(account1EndReward).div(toBN(1e17)));
    await timeMachine.revertToSnapshot(snapshotId);


  });


  it("MarginTrade Suspend test", async () => {
    let {controller, tokenA, tokenB, openLev} = await instanceController();
    let transaction = await controller.createLPoolPair(tokenA.address, tokenB.address, 3000, 1);
    let pool0 = transaction.logs[0].args.pool0;
    //supply
    let pool0Ctr = await LPool.at(pool0);
    let token0Ctr = await utils.tokenAt(await pool0Ctr.underlying());
    await token0Ctr.mint(accounts[0], utils.toWei(10));
    await token0Ctr.approve(pool0, utils.toWei(10));
    await pool0Ctr.mint(utils.toWei(5));
    await token0Ctr.approve(openLev.address, utils.toWei(10));
    await controller.setSuspend(true);
    try {
      await openLev.marginTrade(0, true, false, utils.toWei(1), utils.toWei(1), 0, Uni3DexData);
      assert.fail("should thrown Suspended! error");
    } catch (error) {
      assert.include(error.message, 'Suspended', 'throws exception Suspended');
    }
  });
  /*** Admin Test ***/

  it("Admin setLPoolImplementation test", async () => {
    let poolAddr = (await utils.createLPoolImpl()).address;
    let {controller, timeLock} = await instanceSimpleController();
    await timeLock.executeTransaction(controller.address, 0, 'setLPoolImplementation(address)', web3.eth.abi.encodeParameters(['address'], [poolAddr]), 0)
    assert.equal(poolAddr, await controller.lpoolImplementation());
    try {
      await controller.setLPoolImplementation(poolAddr);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });

  it("Admin setOpenLev test", async () => {
    let address = (await utils.createToken("tokenA")).address;
    let {controller, timeLock} = await instanceSimpleController();
    await timeLock.executeTransaction(controller.address, 0, 'setOpenLev(address)', web3.eth.abi.encodeParameters(['address'], [address]), 0);
    assert.equal(address, await controller.openLev());
    try {
      await controller.setOpenLev(address);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });
  it("Admin setInterestParam test", async () => {
    let {controller, timeLock} = await instanceSimpleController();
    await timeLock.executeTransaction(controller.address, 0, 'setInterestParam(uint256,uint256,uint256,uint256)',
      web3.eth.abi.encodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], [1, 2, 3, 4]), 0)
    assert.equal(1, await controller.baseRatePerBlock());
    assert.equal(2, await controller.multiplierPerBlock());
    assert.equal(3, await controller.jumpMultiplierPerBlock());
    assert.equal(4, await controller.kink());

    try {
      await controller.setInterestParam(1, 2, 3, 4);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });

  it("Admin setLPoolUnAllowed test", async () => {
    let address = (await utils.createToken("tokenA")).address;
    let {controller, timeLock} = await instanceSimpleController();
    await timeLock.executeTransaction(controller.address, 0, 'setLPoolUnAllowed(address,bool)', web3.eth.abi.encodeParameters(['address', 'bool'], [address, true]), 0);
    assert.equal(true, (await controller.lpoolUnAlloweds(address)), {from: accounts[2]});
    try {
      await controller.setLPoolUnAllowed(address, true);
      assert.fail("should thrown caller must be admin or developer error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin or developer', 'throws exception with caller must be admin or developer');
    }
  });

  it("Admin setSuspend test", async () => {
    let {controller, timeLock} = await instanceSimpleController();
    await timeLock.executeTransaction(controller.address, 0, 'setSuspend(bool)', web3.eth.abi.encodeParameters(['bool'], [true]), 0);
    assert.equal(true, (await controller.suspend()));
    try {
      await controller.setSuspend(false, {from: accounts[2]});
      assert.fail("should thrown caller must be admin or developer error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin or developer', 'throws exception with caller must be admin or developer');
    }
  });

  it("Admin setOLETokenDistribution test", async () => {
    let {controller, oleToken, timeLock} = await instanceSimpleController();
    await oleToken.mint(controller.address, 100);
    await timeLock.executeTransaction(controller.address, 0, 'setOLETokenDistribution(uint256,uint256,uint256,uint256)',
      web3.eth.abi.encodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], [1, 2, 3, 4]), 0)
    assert.equal(1, (await controller.oleTokenDistribution()).liquidatorBalance);
    assert.equal(2, (await controller.oleTokenDistribution()).liquidatorMaxPer);
    assert.equal(3, (await controller.oleTokenDistribution()).liquidatorOLERatio);
    assert.equal(4, (await controller.oleTokenDistribution()).supplyBorrowBalance);

    try {
      await controller.setOLETokenDistribution(1, 2, 3, 4);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });

  it("Admin distributeRewards2Pool test", async () => {
    let {controller, oleToken, timeLock} = await instanceSimpleController();
    let address = (await utils.createPool(accounts[0], controller, admin)).pool.address;

    await mint(oleToken, controller.address, 100);
    await timeLock.executeTransaction(controller.address, 0, 'setOLETokenDistribution(uint256,uint256,uint256,uint256)',
      web3.eth.abi.encodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], [10, 20, 30, 40]), 0);

    await timeLock.executeTransaction(controller.address, 0, 'distributeRewards2Pool(address,uint256,uint256,uint64,uint64)',
      web3.eth.abi.encodeParameters(['address', 'uint256', 'uint256', 'uint64', 'uint64'], [address, 1, 2, 3797020800, 3897020800]), 0)
    try {
      await controller.distributeRewards2Pool(address, 1, 2, 3797020800, 3897020800);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });

  it("Admin distributeRewards2PoolMore test", async () => {
    let {controller, oleToken, timeLock} = await instanceSimpleController();
    let address = (await utils.createPool(accounts[0], controller, admin)).pool.address;

    await mint(oleToken, controller.address, 100);
    await timeLock.executeTransaction(controller.address, 0, 'setOLETokenDistribution(uint256,uint256,uint256,uint256)',
      web3.eth.abi.encodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], [10, 20, 30, 40]), 0);
    await timeLock.executeTransaction(controller.address, 0, 'distributeRewards2Pool(address,uint256,uint256,uint64,uint64)',
      web3.eth.abi.encodeParameters(['address', 'uint256', 'uint256', 'uint64', 'uint64'], [address, 1, 2, parseInt(await utils.lastBlockTime()) + 5, 3897020800]), 0)
    await timeMachine.advanceTime(10);
    await timeLock.executeTransaction(controller.address, 0, 'distributeRewards2PoolMore(address,uint256,uint256)',
      web3.eth.abi.encodeParameters(['address', 'uint256', 'uint256'], [address, 1, 2]), 0)
    try {
      await controller.distributeRewards2PoolMore(address, 1, 2);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });

  it("Admin distributeLiqRewards2Market test", async () => {
    let {controller, timeLock} = await instanceSimpleController();
    await timeLock.executeTransaction(controller.address, 0, 'distributeLiqRewards2Market(uint256,bool)',
      web3.eth.abi.encodeParameters(['uint256', 'bool'], [1, true]), 0)
    assert.equal(true, await controller.marketLiqDistribution(1));
    try {
      await controller.distributeLiqRewards2Market(1, true);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });

  it("Admin setImplementation test", async () => {
    let instance = await Controller.new();
    let {controller, timeLock} = await instanceSimpleController();
    await timeLock.executeTransaction(controller.address, 0, 'setImplementation(address)',
      web3.eth.abi.encodeParameters(['address'], [instance.address]), 0)
    assert.equal(instance.address, await controller.implementation());
    try {
      await controller.setImplementation(instance.address);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });

  async function instanceSimpleController() {
    let timeLock = await utils.createTimelock(admin);
    let oleToken = await utils.createToken("OLE");
    let controller = await utils.createController(timeLock.address, oleToken.address);
    return {
      timeLock: timeLock,
      controller: controller,
      oleToken: oleToken,
    };
  }

  async function instanceController(timelock) {
    let tokenA = await utils.createToken("tokenA");
    let tokenB = await utils.createToken("tokenB");
    let oleToken = await utils.createToken("OLE");
    let weth = await utils.createWETH();

    let controller = await utils.createController(timelock ? timelock : admin, oleToken.address, weth.address);

    let uniswapFactory = await utils.createUniswapV3Factory();
    gotPair = await utils.createUniswapV3Pool(uniswapFactory, tokenA, tokenB, accounts[0]);
    await utils.createUniswapV3Pool(uniswapFactory, weth, oleToken, accounts[0]);
    let dexAgg = await utils.createDexAgg("0x0000000000000000000000000000000000000000", uniswapFactory.address);
    m.log("oleToken.address " + oleToken.address);
    let xOLE = await utils.createXOLE(oleToken.address, admin, accounts[9], dexAgg.address);
    let openLev = await utils.createOpenLev(controller.address, admin, dexAgg.address, xOLE.address, [tokenA.address, tokenB.address]);

    await controller.setOpenLev(openLev.address);
    await controller.setDexAggregator(dexAgg.address);
    await controller.setLPoolImplementation((await utils.createLPoolImpl()).address);
    await controller.setInterestParam(toBN(5e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '');
    return {
      controller: controller,
      tokenA: tokenA,
      tokenB: tokenB,
      oleToken: oleToken,
      pair: gotPair,
      openLev: openLev
    };
  }
})
