const utils = require("./utils/OpenLevUtil");
const {toWei} = require("./utils/OpenLevUtil");

const {toBN, maxUint, advanceMultipleBlocks} = require("./utils/EtheUtil");
const m = require('mocha-logger');
const timeMachine = require('ganache-time-traveler');
const LPool = artifacts.require('LPool');

contract("LPoolDelegator", async accounts => {

  // roles
  let admin = accounts[0];

  before(async () => {
    // runs once before the first test in this block
  });

  it("Supply,borrow,repay,redeem test", async () => {
    let controller = await utils.createController(accounts[0]);
    let createPoolResult = await utils.createPool(accounts[0], controller, admin);
    let erc20Pool = createPoolResult.pool;
    let blocksPerYear = toBN(2102400);
    let testToken = createPoolResult.token;
    await utils.mint(testToken, admin, 10000);
    let cash = await erc20Pool.getCash();
    assert.equal(cash, 0);
    /**
     * deposit
     */
    //deposit10000
    await testToken.approve(erc20Pool.address, maxUint());
    await erc20Pool.mint(10000 * 1e10);
    //Checking deposits
    assert.equal(await erc20Pool.getCash(), 10000 * 1e10);
    assert.equal(await erc20Pool.totalSupply(), 10000 * 1e10);
    //Check deposit rate
    assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
    //Check loan interest rate
    assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '49999999998268800');
    /**
     * borrow money
     */
    //borrow money5000
    await erc20Pool.borrowBehalf(accounts[0], 5000 * 1e10);
    assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '99999999996537600');
    assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '49999999998268800');
    //inspect snapshot
    let accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
    assert.equal(accountSnapshot[0], 10000 * 1e10);
    assert.equal(accountSnapshot[1], 5000 * 1e10);
    assert.equal(accountSnapshot[2], 1e18);
    //Borrow 2000 more
    await erc20Pool.borrowBehalf(accounts[0], 2000 * 1e10);
    assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '140000001421420800');
    assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '98000001992793600');
    accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
    assert.equal(accountSnapshot[1], 70000002378234);
    assert.equal(accountSnapshot[2], 1000000023782340000);
    //Total borrowings
    assert.equal(await erc20Pool.totalBorrows(), 70000002378234);
    //Update total borrowings and interest
    await erc20Pool.accrueInterest();
    assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '140000004219715200');
    assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '98000005909564800');
    //rate of exchange
    assert.equal((await erc20Pool.exchangeRateStored()).toString(), '1000000070395730000');
    // assert.equal((await erc20Pool.borrowBalanceCurrent(accounts[0])).toString(), '70000007039573');
    /**
     * repayment
     */
    await erc20Pool.repayBorrowBehalf(accounts[0], maxUint());
    accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
    assert.equal(accountSnapshot[0], 10000 * 1e10);
    assert.equal(accountSnapshot[1], 0);
    //Total borrowings
    assert.equal(await erc20Pool.totalBorrows(), 0);
    //Total deposit
    assert.equal(await erc20Pool.totalSupply(), 10000 * 1e10);
    //Loan interest rate and deposit interest rate
    assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '49999999998268800');
    assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '0');
    //rate of exchange
    assert.equal((await erc20Pool.exchangeRateStored()).toString(), '1000000117009130000');
    /**
     * Withdrawal
     */
    await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
    accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
    assert.equal(accountSnapshot[0], 0);
    assert.equal((await testToken.balanceOf(accounts[0])).toString(), toBN(10000).mul(toBN(1e18)).toString());
    assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '49999999998268800');
    assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '0');
    assert.equal((await erc20Pool.exchangeRateStored()).toString(), 1e18);
    assert.equal((await erc20Pool.availableForBorrow()).toString(), '0');

  }),
    it("borrowTo test", async () => {
      let controller = await utils.createController(accounts[0]);
      let createPoolResult = await utils.createPool(accounts[0], controller, admin);
      let erc20Pool = createPoolResult.pool;
      let testToken = createPoolResult.token;
      await utils.mint(testToken, admin, 10000);
      // deposit 10000
      await testToken.approve(erc20Pool.address, maxUint());
      await erc20Pool.mint(10000 * 1e10);
      //Borrow money 5000
      await erc20Pool.borrowBehalf(accounts[0], 5000 * 1e10, {from: accounts[1]});
      assert.equal((await testToken.balanceOf(accounts[1])).toString(), toBN(5000).mul(toBN(1e10)).toString());
      // inspect snapshot
      let accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
      assert.equal(accountSnapshot[0], 10000 * 1e10);
      assert.equal(accountSnapshot[1], 5000 * 1e10);
      assert.equal(accountSnapshot[2], 1e18);

    }),

    it("borrow out of range test", async () => {
      let controller = await utils.createController(accounts[0]);
      let createPoolResult = await utils.createPool(accounts[0], controller, admin);
      let testToken = createPoolResult.token;
      let erc20Pool = createPoolResult.pool;
      await utils.mint(testToken, admin, 10000);
      //deposit 10000
      await testToken.approve(erc20Pool.address, maxUint());
      await erc20Pool.mint(10000 * 1e10);
      let maxBorrow = await erc20Pool.availableForBorrow();
      m.log('maxBorrow', maxBorrow.toString());
      //Maximum borrowing amount + 1
      try {
        await erc20Pool.borrowBehalf(accounts[0], maxBorrow.add(toBN('1')));
        assert.fail("should thrown borrow out of range error");
      } catch (error) {
        assert.include(error.message, 'borrow out of range', 'throws exception with borrow out of range');
      }
    }),

    it("pool not allowed test", async () => {
      let controller = await utils.createController(accounts[0]);
      let createPoolResult = await utils.createPool(accounts[0], controller, admin);
      let testToken = createPoolResult.token;
      let erc20Pool = createPoolResult.pool;
      await utils.mint(testToken, admin, 10000);
      //deposit 10000
      await testToken.approve(erc20Pool.address, maxUint());
      controller.setLPoolUnAllowed(await erc20Pool.address, true);
      try {
        await erc20Pool.mint(10000 * 1e10);
        assert.fail("should thrown mint paused error");
      } catch (error) {
        assert.include(error.message, 'mint paused', 'throws exception with  mint is paused');
      }
    }),
    it("pool change admin test", async () => {
      let controller = await utils.createController(accounts[0]);
      let createPoolResult = await utils.createPool(accounts[0], controller, admin);
      let erc20Pool = createPoolResult.pool;
      let newAdmin = accounts[1];
      await erc20Pool.setPendingAdmin(newAdmin);
      assert.equal(newAdmin, await erc20Pool.pendingAdmin());
      await erc20Pool.acceptAdmin();
      assert.equal(newAdmin, await erc20Pool.admin());
      assert.equal("0x0000000000000000000000000000000000000000", await erc20Pool.pendingAdmin());
    })

  it("update interestParams test", async () => {
    let controller = await utils.createController(accounts[0]);
    let createPoolResult = await utils.createPool(accounts[0], controller, admin);
    let erc20Pool = createPoolResult.pool;
    let testToken = createPoolResult.token;
    //5% base 100000 blocks
    await erc20Pool.setInterestParams(toBN(5e16).div(toBN(100000)), toBN(10e16).div(toBN(100000)), toBN(20e16).div(toBN(100000)), 50e16 + '');

    await utils.mint(testToken, admin, toWei(100000));
    // deposit 10000
    await testToken.approve(erc20Pool.address, maxUint());
    await erc20Pool.mint(toWei(10000));
    //borrow 5000
    await erc20Pool.borrowBehalf(accounts[0], toWei(4000), {from: accounts[1]});
    // advance 1000 blocks
    await advanceMultipleBlocks(1000);
    // check borrows=4000+(5%+10%*40%)*4000*1000/100000
    let borrowsBefore = await erc20Pool.borrowBalanceCurrent(accounts[0]);
    m.log("borrowsBefore =", borrowsBefore.toString());
    assert.equal("4003599999999999999999", borrowsBefore.toString());
    //base interest change to 10% 100000 blocks
    await erc20Pool.setInterestParams(toBN(10e16).div(toBN(100000)), toBN(10e16).div(toBN(100000)), toBN(20e16).div(toBN(100000)), 50e16 + '');
    let borrowsAfterUpdate = await erc20Pool.borrowBalanceCurrent(accounts[0]);
    let totalBorrowsAfterUpdate = await erc20Pool.totalBorrowsCurrent();
    let totalBorrowsStoredAfterUpdate = await erc20Pool.totalBorrows();
    let baseRatePerBlockAfterUpdate = await erc20Pool.baseRatePerBlock();
    // check borrows=4000+(5%+10%*40%)*4000*1001/100000
    m.log("borrowsAfterUpdate =", borrowsAfterUpdate.toString());
    m.log("totalBorrowsAfterUpdate =", totalBorrowsAfterUpdate.toString());
    m.log("totalBorrowsStoredAfterUpdate =", totalBorrowsStoredAfterUpdate.toString());
    m.log("baseRatePerBlockAfterUpdate =", baseRatePerBlockAfterUpdate.toString());
    assert.equal("4003603599999999999999", borrowsAfterUpdate.toString());
    assert.equal("4003603600000000000000", totalBorrowsAfterUpdate.toString());
    assert.equal("1000000000000", baseRatePerBlockAfterUpdate.toString());
    // advance 1000 blocks
    await advanceMultipleBlocks(1000);
    m.log("advance 1000 blocks...");
    // check borrows=4000.36+(10%+10%*40%)*4000.36*1000/100000
    borrowsAfterUpdate = await erc20Pool.borrowBalanceCurrent(accounts[0]);
    totalBorrowsAfterUpdate = await erc20Pool.totalBorrowsCurrent();
    m.log("borrowsAfterUpdate =", borrowsAfterUpdate.toString());
    m.log("totalBorrowsAfterUpdate =", totalBorrowsAfterUpdate.toString());
    assert.equal("4009209510371323300403", borrowsAfterUpdate.toString());
    assert.equal("4009209510371323300403", totalBorrowsAfterUpdate.toString());
    // repay
    await erc20Pool.repayBorrowBehalf(accounts[0], maxUint());
    m.log("after repay...");
    borrowsAfterUpdate = await erc20Pool.borrowBalanceCurrent(accounts[0]);
    totalBorrowsAfterUpdate = await erc20Pool.totalBorrowsCurrent();
    assert.equal("0", borrowsAfterUpdate.toString());
    assert.equal("0", totalBorrowsAfterUpdate.toString());
    // redeem
    await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
    let cashInPool = await erc20Pool.getCash();
    m.log("cashInPool =", cashInPool.toString());
    assert.equal("0", cashInPool.div(toBN(4000)));


  })

  /*** Admin Test ***/

    it("Admin setController test", async () => {
      let timeLock = await utils.createTimelock(admin);
      let controller = await utils.createController(accounts[0]);
      let createPoolResult = await utils.createPool(accounts[0], controller, timeLock.address);
      let erc20Pool = createPoolResult.pool;
      let newController = await utils.createController(accounts[0]);

      await timeLock.executeTransaction(erc20Pool.address, 0, 'setController(address)',
        web3.eth.abi.encodeParameters(['address'], [newController.address]), 0)
      assert.equal(newController.address, await erc20Pool.controller());
      try {
        await erc20Pool.setController(newController.address);
        assert.fail("should thrown caller must be admin error");
      } catch (error) {
        assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
      }
    })

  it("Admin setBorrowCapFactorMantissa test", async () => {
    let timeLock = await utils.createTimelock(admin);
    let controller = await utils.createController(accounts[0]);
    let createPoolResult = await utils.createPool(accounts[0], controller, timeLock.address);
    let erc20Pool = createPoolResult.pool;

    await timeLock.executeTransaction(erc20Pool.address, 0, 'setBorrowCapFactorMantissa(uint256)',
      web3.eth.abi.encodeParameters(['uint256'], [1]), 0)
    assert.equal(1, await erc20Pool.borrowCapFactorMantissa());
    try {
      await erc20Pool.setBorrowCapFactorMantissa(1);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  })

  it("Admin setInterestParams test", async () => {
    let timeLock = await utils.createTimelock(admin);
    let controller = await utils.createController(accounts[0]);
    let createPoolResult = await utils.createPool(accounts[0], controller, timeLock.address);
    let erc20Pool = createPoolResult.pool;

    await timeLock.executeTransaction(erc20Pool.address, 0, 'setInterestParams(uint256,uint256,uint256,uint256)',
      web3.eth.abi.encodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], [0, 1, 2, 3]), 0)
    assert.equal(0, await erc20Pool.baseRatePerBlock());
    assert.equal(1, await erc20Pool.multiplierPerBlock());
    assert.equal(2, await erc20Pool.jumpMultiplierPerBlock());
    assert.equal(3, await erc20Pool.kink());

    try {
      await erc20Pool.setInterestParams(0, 1, 2, 3);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }

  })

  it("Admin setImplementation test", async () => {
    let instance = await LPool.new();
    let timeLock = await utils.createTimelock(admin);
    let controller = await utils.createController(accounts[0]);
    let createPoolResult = await utils.createPool(accounts[0], controller, timeLock.address);
    let erc20Pool = createPoolResult.pool;
    await timeLock.executeTransaction(erc20Pool.address, 0, 'setImplementation(address)',
      web3.eth.abi.encodeParameters(['address'], [instance.address]), 0)
    assert.equal(instance.address, await erc20Pool.implementation());
    try {
      await erc20Pool.setImplementation(instance.address);
      assert.fail("should thrown caller must be admin error");
    } catch (error) {
      assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
    }
  });

})
