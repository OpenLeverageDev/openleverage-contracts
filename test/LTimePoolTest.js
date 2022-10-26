const utils = require("./utils/OpenLevUtil");
const {toWei, toETH, assertPrint, approxAssertPrint, approxPrecisionAssertPrint, assertThrows, createUniswapV2Factory, createEthDexAgg, createXOLE} = require("./utils/OpenLevUtil");

const {toBN, blockNumber, maxUint, advanceMultipleBlocksAndAssignTime, advanceBlockAndSetTime, advanceMultipleBlocks} = require("./utils/EtheUtil");
const m = require('mocha-logger');
const {advanceTime} = require("ganache-time-traveler");
const timeMachine = require("ganache-time-traveler");
const {number} = require("truffle/build/735.bundled");
const LPoolDelegator = artifacts.require('LPoolDelegator');
const LPoolDepositor = artifacts.require('LPoolDepositor');
const LPoolDepositorDelegator = artifacts.require("LPoolDepositorDelegator")

contract("LPoolDelegator", async accounts => {

    // roles
    let admin = accounts[0];
    let borrower0 = accounts[1];
    let borrower1 = accounts[2];
    let lender0 = accounts[3];
    let lender1 = accounts[4];

    let snapshotId;
    beforeEach(async () => {
        let snapshot = await timeMachine.takeSnapshot();
        snapshotId = snapshot['result'];
    })

    afterEach(async () => {
        await timeMachine.revertToSnapshot(snapshotId);
    });

    // --- new block timestamp test ---

    it("badDebtsAmount test with one seconds to produce a block", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 10000);
        await erc20Pool.setReserveFactor(toBN(2e17));
        // deposit 10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(10000 * 1e10);
        await testToken.approve(erc20Pool.address, maxUint(), {from: accounts[1]});
        await controller.setOpenLev(accounts[1]);
        //Borrow money 5000
        await erc20Pool.borrowBehalf(accounts[2], 5000 * 1e10, {from: accounts[1]});
        // advance 1000 seconds...
        await advanceMultipleBlocksAndAssignTime( 1, 1000);
        let tx = await erc20Pool.repayBorrowEndByOpenLev(accounts[2], 1000 * 1e10, {from: accounts[1]});
        m.log("tx", JSON.stringify(tx));
        approxPrecisionAssertPrint("badDebtsAmount", '40000158707508', toBN(tx.logs[3].args.badDebtsAmount), 8);
    })

    it("badDebtsAmount test with five seconds to produce a block", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 10000);
        await erc20Pool.setReserveFactor(toBN(2e17));
        // deposit 10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(10000 * 1e10);
        await testToken.approve(erc20Pool.address, maxUint(), {from: accounts[1]});
        await controller.setOpenLev(accounts[1]);
        //Borrow money 5000
        await erc20Pool.borrowBehalf(accounts[2], 5000 * 1e10, {from: accounts[1]});
        // advance 5000 seconds...
        await advanceMultipleBlocksAndAssignTime( 1, 5000);
        let tx = await erc20Pool.repayBorrowEndByOpenLev(accounts[2], 1000 * 1e10, {from: accounts[1]});
        m.log("tx", JSON.stringify(tx));
        approxPrecisionAssertPrint("badDebtsAmount", '40000792586250', toBN(tx.logs[3].args.badDebtsAmount), 8);
    })

    it("badDebtsAmount test with three seconds to produce a block", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 10000);
        await erc20Pool.setReserveFactor(toBN(2e17));
        // deposit 10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(10000 * 1e10);
        await testToken.approve(erc20Pool.address, maxUint(), {from: accounts[1]});
        await controller.setOpenLev(accounts[1]);
        //Borrow money 5000
        await erc20Pool.borrowBehalf(accounts[2], 5000 * 1e10, {from: accounts[1]});
        // advance 3000 seconds...
        await advanceMultipleBlocksAndAssignTime( 1, 3000);
        let tx = await erc20Pool.repayBorrowEndByOpenLev(accounts[2], 1000 * 1e10, {from: accounts[1]});
        m.log("tx", JSON.stringify(tx));
        approxPrecisionAssertPrint("badDebtsAmount", '40000475646879', toBN(tx.logs[3].args.badDebtsAmount), 8);
    })

    // --- old block number test ---
    it("Supply,borrow,repay,redeem test", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let blocksPerYear = toBN(31536000);
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
        await erc20Pool.setReserveFactor(toBN(2e17));
        //Checking deposits
        assert.equal(await erc20Pool.getCash(), 10000 * 1e10);
        assert.equal(await erc20Pool.totalSupply(), 10000 * 1e10);
        //Check deposit rate
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        //Check loan interest rate
        //(=5e16/31536000)
        assert.equal((await erc20Pool.borrowRatePerBlock()).toString(), 1585489599);

        /**
         * borrow money
         */
        //borrow money5000
        await erc20Pool.borrowBehalf(accounts[0], 5000 * 1e10);
        //=(0.05+0.05)/31536000*10e18*31536000
        assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), 99999999988128000);
        //=(0.5*1e17*(1e18-2e17)/1e18)
        assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), 39999999988944000);

        //inspect snapshot
        let accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 10000 * 1e10);
        assert.equal(accountSnapshot[1], 5000 * 1e10);
        assert.equal(accountSnapshot[2], 1e18);
        //Borrow 2000 more
        await advanceTime(864000);
        let lastbkBefore = await web3.eth.getBlock('latest');
        await erc20Pool.borrowBehalf(accounts[0], 2000 * 1e10);
        let lastbkAfter = await web3.eth.getBlock('latest');
        m.log("Block distance with borrowBehalf()", lastbkAfter.timestamp - lastbkBefore.timestamp, lastbkAfter.number - lastbkBefore.number);

        //(current cash 30000000000000 borrows 70136986301353 reserves 27397260270)
        approxPrecisionAssertPrint("borrowRatePerBlock", '4443189242', (await erc20Pool.borrowRatePerBlock()).toString(), 8);
        approxPrecisionAssertPrint("supplyRatePerBlock", '2490326099', (await erc20Pool.supplyRatePerBlock()).toString(), 8);

        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        approxPrecisionAssertPrint("accountSnapshot1", '70136986301353', accountSnapshot[1].toString(), 8);
        approxPrecisionAssertPrint("accountSnapshot2", '1001095890410830000',accountSnapshot[2].toString(), 8);
        //Total borrowings
        approxPrecisionAssertPrint("totalBorrows", '70136986301353', (await erc20Pool.totalBorrows()).toString(), 8);

        //Update total borrowings and interest
        m.log("Advancing 10 days");
        await advanceTime(864000); //
        let lastbkBefore2 = await web3.eth.getBlock('latest');
        await erc20Pool.accrueInterest();
        let lastbkAfter2 = await web3.eth.getBlock('latest');
        m.log("Block distance with borrowBehalf()", lastbkAfter2.timestamp - lastbkBefore2.timestamp, lastbkAfter2.number - lastbkBefore2.number);

        approxPrecisionAssertPrint("borrowRatePerBlock", '4450670023', (await erc20Pool.borrowRatePerBlock()).toString(), 7);
        approxPrecisionAssertPrint("supplyRatePerBlock", '2498718839', (await erc20Pool.supplyRatePerBlock()).toString(), 7);
        //rate of exchange
        //(token-Ltoken= (totalCash + totalBorrows - totalReserves) / totalSupply)
        approxPrecisionAssertPrint("exchangeRateStored", '1003249890124370000', (await erc20Pool.exchangeRateStored()).toString(), 7);

        /**
         * repayment
         */
        m.log("Advancing 10 days");
        await advanceTime(864000);
        await erc20Pool.repayBorrowBehalf(accounts[0], maxUint());
        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 10000 * 1e10);
        assert.equal(accountSnapshot[1], 0);
        //Total borrowings
        assert.equal(await erc20Pool.totalBorrows(), 0);
        //Total deposit
        assert.equal(await erc20Pool.totalSupply(), 10000 * 1e10);
        //Loan interest rate and deposit interest rate
        assert.equal((await erc20Pool.borrowRatePerBlock()).toString(), 1585489599);
        assert.equal((await erc20Pool.supplyRatePerBlock()).toString(), 0);
        m.log("10 day elapsed by the time the repayment was executed and the exchange rate rate increased");
        approxPrecisionAssertPrint("exchangeRateStored", '1005415801874060000', (await erc20Pool.exchangeRateStored()).toString(), 7);

        /**
         * Withdrawal
         */
        m.log("Advancing 10 days");
        await advanceTime(864000);
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 0);
        // Not enough money to pay back
        assert.equal((await testToken.balanceOf(accounts[0])).toString(), 9999999999864604953146);
        assert.equal((await erc20Pool.borrowRatePerBlock()).toString(), 1585489599);
        assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '0');
        assert.equal((await erc20Pool.exchangeRateStored()).toString(), 1e18);
        assert.equal((await erc20Pool.availableForBorrow()).toString(), '0');

    })

    it("borrowTo test", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 10000);

        // deposit 10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(10000 * 1e10);

        //Borrow money 5000
        await advanceTime(864000);
        await erc20Pool.borrowBehalf(accounts[0], 5000 * 1e10, {from: accounts[1]});

        assert.equal((await testToken.balanceOf(accounts[1])).toString(), toBN(5000).mul(toBN(1e10)).toString());
        // inspect snapshot
        let accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 10000 * 1e10);
        assert.equal(accountSnapshot[1], 5000 * 1e10);
        assert.equal(accountSnapshot[2], 1e18);

    })

    it("repayBorrowEndByOpenLev test", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 10000);
        await erc20Pool.setReserveFactor(toBN(2e17));

        // deposit 10000
        await testToken.approve(erc20Pool.address, maxUint());

        await erc20Pool.mint(10000 * 1e10);

        //Borrow money 5000
        await erc20Pool.borrowBehalf(accounts[2], 5000 * 1e10, {from: accounts[1]});
        // advance 15000 seconds
        await advanceTime(15000);
        m.log("advance 15000 seconds...");
        let exchangeRateStored1 = await erc20Pool.exchangeRateStored();
        m.log("exchangeRateStored1", exchangeRateStored1);
        assert.equal('1000000000000000000', exchangeRateStored1);

        await testToken.approve(erc20Pool.address, maxUint(), {from: accounts[1]});

        await controller.setOpenLev(accounts[1]);

        // Test return not enough money to penetration warehouse
        let tx = await erc20Pool.repayBorrowEndByOpenLev(accounts[2], 1000 * 1e10, {from: accounts[1]});
        m.log("tx", JSON.stringify(tx));
        assertPrint("repayAmount", '10000000000000', toBN(tx.logs[3].args.repayAmount));
        approxPrecisionAssertPrint("badDebtsAmount", '40002378392947', toBN(tx.logs[3].args.badDebtsAmount), 8);
        assertPrint("accountBorrowsNew", '0', toBN(tx.logs[3].args.accountBorrows));
        assertPrint("totalBorrows", '0', toBN(tx.logs[3].args.totalBorrows));

        let borrowsCurrent = await erc20Pool.borrowBalanceCurrent(accounts[1]);
        assert.equal(0, borrowsCurrent);
        let totalBorrowCurrent = await erc20Pool.totalBorrowsCurrent();
        assert.equal(0, totalBorrowCurrent);
        let exchangeRateStored2 = await erc20Pool.exchangeRateStored();
        let getCash2 = await erc20Pool.getCash();
        m.log("exchangeRateStored2", exchangeRateStored2);
        m.log("getCash2", getCash2);
        m.log("----getPoolInfo----", (await erc20Pool.getCash()).toString(),  (await erc20Pool.totalBorrows()).toString(), (await erc20Pool.totalReserves()).toString(), (await erc20Pool.totalSupply()).toString());
        approxPrecisionAssertPrint("exchangeRateStored", '599995243531210000', exchangeRateStored2.toString(), 8);
        assert.equal('60000000000000', getCash2);

        await erc20Pool.mint(1000 * 1e10);
        m.log("----getAccountSnapshot---- ", (await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        // LTOKEN cannot be exchanged for a token of equal value after the penetration warehouse
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        let getCash3 = await erc20Pool.getCash();
        let totalReserves = await erc20Pool.totalReserves();
        m.log("cacsh3--", getCash3, totalReserves);
        approxPrecisionAssertPrint("getCash3", '475646880', getCash3.toString(), 4);
        approxPrecisionAssertPrint("totalReserves", '475646879', totalReserves.toString(), 4);
        let exchangeRateStored3 = await erc20Pool.exchangeRateStored();
        m.log("exchangeRateStored3", exchangeRateStored3);
        m.log("----getPoolInfo----", (await erc20Pool.getCash()).toString(),  (await erc20Pool.totalBorrows()).toString(), (await erc20Pool.totalReserves()).toString(), (await erc20Pool.totalSupply()).toString());
        assert.equal('1000000000000000000', exchangeRateStored3);
    })

    it("borrow out of range test", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let testToken = createPoolResult.token;
        let erc20Pool = createPoolResult.pool;
        await utils.mint(testToken, admin, 10000);

        //deposit 10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(10000 * 1e10);
        await advanceTime(100000);
        let maxBorrow = await erc20Pool.availableForBorrow();
        m.log('maxBorrow', maxBorrow.toString());
        //Maximum borrowing amount + 1
        await assertThrows(erc20Pool.borrowBehalf(accounts[0], maxBorrow.add(toBN('1'))), 'Borrow out of range');

    })

    it("mint redeem eth test", async () => {
        let weth = await utils.createWETH();
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin, weth);
        let erc20Pool = createPoolResult.pool;
        let mintAmount = toWei(1);
        //deposit 1
        let ethBegin = await web3.eth.getBalance(admin);
        m.log("ethBegin=", ethBegin);
        let tx = await erc20Pool.mintEth({value: mintAmount});

        m.log("MintEth Gas Used: ", tx.receipt.gasUsed);
        assert.equal((await erc20Pool.getCash()).toString(), mintAmount.toString());
        assert.equal((await erc20Pool.totalSupply()).toString(), mintAmount.toString());
        //redeem
        let ethBefore = await web3.eth.getBalance(admin);
        await erc20Pool.redeemUnderlying(mintAmount);

        assert.equal(await erc20Pool.getCash(), 0);
        assert.equal(await erc20Pool.totalSupply(), 0);
        let ethAfter = await web3.eth.getBalance(admin);
        m.log("ethBefore=", ethBefore);
        m.log("ethAfter=", ethAfter);
        assert.equal(toBN(ethAfter).gt(toBN(ethBefore)), true);
    })

    it("Depositor deposit eth redeem test", async () => {
        let weth = await utils.createWETH();
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin, weth);
        let erc20Pool = createPoolResult.pool;
        let poolDepositor = await LPoolDepositorDelegator.new((await LPoolDepositor.new()).address, accounts[0]);
        poolDepositor = await LPoolDepositor.at(poolDepositor.address);
        let mintAmount = toWei(1);
        //deposit 1
        let ethBegin = await web3.eth.getBalance(admin);
        m.log("ethBegin=", ethBegin);
        let tx = await poolDepositor.depositNative(erc20Pool.address, {value: mintAmount});

        m.log("DepositEth Gas Used: ", tx.receipt.gasUsed);
        assert.equal((await erc20Pool.getCash()).toString(), mintAmount.toString());
        assert.equal((await erc20Pool.totalSupply()).toString(), mintAmount.toString());
        //redeem
        let ethBefore = await web3.eth.getBalance(admin);
        await erc20Pool.redeemUnderlying(mintAmount);

        assert.equal(await erc20Pool.getCash(), 0);
        assert.equal(await erc20Pool.totalSupply(), 0);
        let ethAfter = await web3.eth.getBalance(admin);
        m.log("ethBefore=", ethBefore);
        m.log("ethAfter=", ethAfter);
        assert.equal(toBN(ethAfter).gt(toBN(ethBefore)), true);
    })

    it("Depositor deposit erc20 redeem test", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 1);

        let poolDepositor = await LPoolDepositorDelegator.new((await LPoolDepositor.new()).address, accounts[0]);
        poolDepositor = await LPoolDepositor.at(poolDepositor.address);
        let mintAmount = toWei(1);
        //deposit 1
        await testToken.approve(poolDepositor.address, maxUint());
        let tx = await poolDepositor.deposit(erc20Pool.address, mintAmount);

        m.log("DepositErc20 Gas Used: ", tx.receipt.gasUsed);
        assert.equal((await erc20Pool.getCash()).toString(), mintAmount.toString());
        assert.equal((await erc20Pool.totalSupply()).toString(), mintAmount.toString());
        //redeem
        await erc20Pool.redeemUnderlying(mintAmount);

        assert.equal(await erc20Pool.getCash(), 0);
        assert.equal(await erc20Pool.totalSupply(), 0);
        assert.equal(toWei(1).toString(), (await testToken.balanceOf(admin)).toString());
    })
    it("Supply -> raise Balance -> supply -> redeem", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let blocksPerYear = toBN(31536000);
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 10000);
        let cash = await erc20Pool.getCash();
        assert.equal(cash, 0);
        /**
         * deposit
         */
        //deposit10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(utils.toWei(10000));
        await erc20Pool.setReserveFactor(toBN(2e17));

        //Checking deposits
        assert.equal(await erc20Pool.getCash(), utils.toWei(10000).toString());
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(10000).toString());
        //Check deposit rate
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        //Check loan interest rate
        assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '49999999994064000');

        /* raise balance */
        await utils.mint(testToken, erc20Pool.address, 10000);

        assert.equal(await erc20Pool.getCash(), utils.toWei(20000).toString());
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(10000).toString());
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '49999999994064000');

        /* deposit again by another account*/
        await utils.mint(testToken, accounts[1], 20000);
        await testToken.approve(erc20Pool.address, maxUint(), {from: accounts[1]});
        await erc20Pool.mint(utils.toWei(20000), {from: accounts[1]});

        assert.equal(await erc20Pool.getCash(), utils.toWei(40000).toString());
        // token mint will not add the totalSupply, so the exchangeRateMantissa from 1:1 change to 2:1, when mint 20000 again, totalSupply only add 20000/2 = 10000
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(20000).toString());
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '49999999994064000');

        /* Withdrawal
         */
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 0);
        assert.equal((await testToken.balanceOf(accounts[0])).toString(), utils.toWei(20000).toString());

        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[1]))[0], {from: accounts[1]});
        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[1]);
        assert.equal(accountSnapshot[0], 0);
        assert.equal((await testToken.balanceOf(accounts[1])).toString(), utils.toWei(20000).toString());

        assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '49999999994064000');
        assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '0');
        assert.equal((await erc20Pool.exchangeRateStored()).toString(), 1e18);
        assert.equal((await erc20Pool.availableForBorrow()).toString(), '0');
    })

    it("Supply -> borrow -> supply more -> raise -> borrow more -> redeem partial -> repay -> redeem all", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let blocksPerYear = toBN(31536000);
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 10000);

        let cash = await erc20Pool.getCash();
        assert.equal(cash, 0);
        /**
         * deposit
         */
        //deposit10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(utils.toWei(10000));
        await erc20Pool.setReserveFactor(toBN(2e17));

        //Checking deposits
        assert.equal(await erc20Pool.getCash(), utils.toWei(10000).toString());
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(10000).toString());
        //Check deposit rate
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        //Check loan interest rate
        assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '49999999994064000');

        /**
         * borrow money
         */
        //borrow money5000
        await erc20Pool.borrowBehalf(borrower0, utils.toWei(5000), {from: borrower0});
        assert.equal((await erc20Pool.borrowRatePerBlock()).toString(), '3170979198');
        assert.equal((await erc20Pool.supplyRatePerBlock()).toString(), '1268391679');
        //inspect snapshot
        let accountSnapshot = await erc20Pool.getAccountSnapshot(borrower0);
        assert.equal(accountSnapshot[0], 0);
        assert.equal(accountSnapshot[1], utils.toWei(5000).toString());
        assert.equal(accountSnapshot[2], 1e18);

        /* deposit again by another account*/
        await advanceMultipleBlocksAndAssignTime(1,864000);
        await utils.mint(testToken, lender0, 20000, {from: lender0});
        await testToken.approve(erc20Pool.address, maxUint(), {from: lender0});
        await erc20Pool.mint(utils.toWei(20000), {from: lender0});

        assert.equal(await erc20Pool.getCash(), utils.toWei(25000).toString());
        approxPrecisionAssertPrint("totalSupply",  "29978106185005333115234", (await erc20Pool.totalSupply()).toString(), 8)
        approxPrecisionAssertPrint("borrowRate", '2115240551', (await erc20Pool.borrowRatePerBlock()).toString(), 8);
        approxPrecisionAssertPrint("supplyRate", '282701493', (await erc20Pool.supplyRatePerBlock()).toString(), 8);

        /* raise balance */
        await utils.mint(testToken, erc20Pool.address, 60000);

        assert.equal(await erc20Pool.getCash(), utils.toWei(85000).toString());
        approxPrecisionAssertPrint("totalSupply",  "29978106185005333115234", (await erc20Pool.totalSupply()).toString(), 8)
        approxPrecisionAssertPrint("borrowRate", '1762116248', (await erc20Pool.borrowRatePerBlock()).toString(), 8);
        approxPrecisionAssertPrint("supplyRate", '78521281', (await erc20Pool.supplyRatePerBlock()).toString(), 8);

        //Borrow 5000 more
        await erc20Pool.borrowBehalf(borrower0, utils.toWei(5000), {from: borrower0});

        approxPrecisionAssertPrint("borrowRate", '1938260311', (await erc20Pool.borrowRatePerBlock()).toString(), 8);
        approxPrecisionAssertPrint("supplyRate", '172504813', (await erc20Pool.supplyRatePerBlock()).toString(), 8);
        accountSnapshot = await erc20Pool.getAccountSnapshot(borrower0);

        approxPrecisionAssertPrint("accountSnapshot 1",  "10013698638970079818736", accountSnapshot[1].toString(), 8)
        approxPrecisionAssertPrint("accountSnapshot 2",  "3002556544288925063", accountSnapshot[2].toString(), 8)
        //Total borrowings
        approxPrecisionAssertPrint("accountSnapshot 2",  "10013698638970079818736", await erc20Pool.totalBorrows(), 8)

        //Update total borrowings and interest
        await advanceMultipleBlocksAndAssignTime(1,864000);
        await erc20Pool.accrueInterest();
        approxPrecisionAssertPrint("borrowRate", '1938798422', (await erc20Pool.borrowRatePerBlock()).toString(), 8);
        approxPrecisionAssertPrint("supplyRate", '172815915', (await erc20Pool.supplyRatePerBlock()).toString(), 8);
        //rate of exchange
        approxPrecisionAssertPrint("exchangeRateStored", '3003004060527666431', (await erc20Pool.exchangeRateStored()).toString(), 8);

        /**
         * Withdrawal partial
         */
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(lender0))[0], {from: lender0});

        accountSnapshot = await erc20Pool.getAccountSnapshot(lender0);
        assert.equal(accountSnapshot[0], 0);
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(10000).toString());
        approxPrecisionAssertPrint("balanceOf", "59994333946443210028545", (await testToken.balanceOf(lender0)).toString(), 8);
        approxPrecisionAssertPrint("borrowRatePerBlock", '2644642542', (await erc20Pool.borrowRatePerBlock()).toString(), 8);
        approxPrecisionAssertPrint("supplyRatePerBlock", '706679106', (await erc20Pool.supplyRatePerBlock()).toString(), 8);
        approxPrecisionAssertPrint("exchangeRateStored", "3003004058085958896", (await erc20Pool.exchangeRateStored()).toString(), 8);
        approxPrecisionAssertPrint("availableForBorrow", '13993564305559172431876', (await erc20Pool.availableForBorrow()).toString(), 8);

        /**
         * repayment
         */
        await utils.mint(testToken, borrower0, 10000);
        await testToken.approve(erc20Pool.address, maxUint(), {from: borrower0});
        accountSnapshot = await erc20Pool.getAccountSnapshot(borrower0);
        m.log("account borrow", accountSnapshot[1])
        await erc20Pool.repayBorrowBehalf(borrower0, maxUint(), {from: borrower0});

        accountSnapshot = await erc20Pool.getAccountSnapshot(borrower0);
        assert.equal(accountSnapshot[0], 0);
        assert.equal(accountSnapshot[1], 0);
        //Total deposit
        //Loan interest rate and deposit interest rate
        m.log("----getPoolInfo2----", (await erc20Pool.getCash()).toString(),  (await erc20Pool.totalBorrows()).toString(), (await erc20Pool.totalReserves()).toString(), (await erc20Pool.totalSupply()).toString());
        approxPrecisionAssertPrint("borrowRatePerBlock", '1585489599', (await erc20Pool.borrowRatePerBlock()).toString(), 8);
        assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '0');
        //rate of exchange
        approxPrecisionAssertPrint("exchangeRateStored", "3003004062649826654", (await erc20Pool.exchangeRateStored()).toString(), 8);

        /**
         * Withdrawal all
         */
        let redeemAmount = (await erc20Pool.getAccountSnapshot(accounts[0]))[0];
        await erc20Pool.redeem(redeemAmount);
        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 0);
        approxPrecisionAssertPrint("balanceOf", "30030040580859588960000", (await testToken.balanceOf(accounts[0])).toString(), 8);
        m.log("----getPoolInfo3----", (await erc20Pool.getCash()).toString(),  (await erc20Pool.totalBorrows()).toString(), (await erc20Pool.totalReserves()).toString(), (await erc20Pool.totalSupply()).toString(), accountSnapshot[1]);
        // sometimes total borrows = 1
        let totalBorrows = (await erc20Pool.totalBorrows()).toString();
        if (totalBorrows == 1){
            m.log("totalBorrows is 1----", totalBorrows)
            assert.equal((await erc20Pool.borrowRatePerBlock()).toString(), '1588225560');
        } else {
            m.log("totalBorrows is 0----", totalBorrows)
            assert.equal((await erc20Pool.borrowRatePerBlock()).toString(), '1585489599');
        }
        assert.equal(toETH(await erc20Pool.supplyRatePerBlock()).toString(), '0');
        assert.equal((await erc20Pool.exchangeRateStored()).toString(), 1e18);
    })

    it("pool not allowed test", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let testToken = createPoolResult.token;
        let erc20Pool = createPoolResult.pool;
        await utils.mint(testToken, admin, 10000);
        //deposit 10000
        await testToken.approve(erc20Pool.address, maxUint());
        controller.setLPoolUnAllowed(await erc20Pool.address, true);
        await assertThrows(erc20Pool.mint(10000 * 1e10), 'LPool paused');
    })

    it("pool change admin test", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let newAdmin = accounts[1];
        await erc20Pool.setPendingAdmin(newAdmin);
        assert.equal(newAdmin, await erc20Pool.pendingAdmin());
        await erc20Pool.acceptAdmin({from: accounts[1]});
        assert.equal(newAdmin, await erc20Pool.admin());
        assert.equal("0x0000000000000000000000000000000000000000", await erc20Pool.pendingAdmin());
    })

    it("reverses test ", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let blocksPerYear = toBN(31536000);
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 10000);
        await erc20Pool.setReserveFactor(toBN(2e17));
        //deposit 9000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(toWei(9000));
        //borrow 1000
        await erc20Pool.borrowBehalf(accounts[0], toWei(1000));
        await advanceTime(864000);
        //repay
        await erc20Pool.repayBorrowBehalf(accounts[0], maxUint());
        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0].toString(), toWei(9000).toString());
        assert.equal(accountSnapshot[1], 0);

        //withdrawal
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        let totalBorrows = await erc20Pool.totalBorrows();
        let totalCash = await erc20Pool.getCash();
        let reserves = await erc20Pool.totalReserves();
        m.log("totalBorrows", totalBorrows);
        m.log("totalCash ", totalCash);
        m.log("reserves", reserves);

        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 0);
        approxPrecisionAssertPrint("balanceOf", '9999665144596864000000', (await testToken.balanceOf(accounts[0])).toString(), 7);
        approxPrecisionAssertPrint("Check borrow rate", '1585489599', await erc20Pool.borrowRatePerBlock(), 7);
        assert.equal(toETH(await erc20Pool.supplyRatePerBlock()), 0);
        assert.equal((await erc20Pool.exchangeRateStored()).toString(), 1e18);
        approxPrecisionAssertPrint("reserves", '334855403136000000', reserves.toString(), 7);

        //reduce reserves
        await erc20Pool.reduceReserves(accounts[1], '34855403136000000');
        let reservesAfterReduce = await erc20Pool.totalReserves();
        approxPrecisionAssertPrint("reservesAfterReduce", '300000000000000000', reservesAfterReduce.toString(), 7);
        approxPrecisionAssertPrint("Check borrow rate", '1585489599', (await erc20Pool.borrowRatePerBlock()).toString(), 7);
        assert.equal(toETH(await erc20Pool.supplyRatePerBlock()), 0);
        assert.equal((await erc20Pool.exchangeRateStored()).toString(), 1e18);
        approxPrecisionAssertPrint("balanceOf", '34855403136000000', (await testToken.balanceOf(accounts[1])).toString(), 7);
        approxPrecisionAssertPrint("cash", '300000000000000000', (await erc20Pool.getCash()).toString(), 7);
        // add reserves
        await erc20Pool.addReserves('100000000000000000');
        approxPrecisionAssertPrint("totalReserves", '400000000000000000', (await erc20Pool.totalReserves()).toString(), 7);
        approxPrecisionAssertPrint("cash", '400000000000000000', (await erc20Pool.getCash()).toString(), 7);

    })

    it("update interestParams test", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let testToken = createPoolResult.token;
        //5% base 100000 blocks
        await erc20Pool.setInterestParams(toBN(5e16).div(toBN(31536000)), toBN(10e16).div(toBN(31536000)), toBN(20e16).div(toBN(31536000)), 50e16 + '');
        await erc20Pool.setReserveFactor(toBN(2e17));

        await utils.mint(testToken, admin, toWei(100000));
        // deposit 10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(toWei(10000));
        //borrow 5000
        await erc20Pool.borrowBehalf(accounts[0], toWei(4000), {from: accounts[1]});
        await advanceMultipleBlocksAndAssignTime(1, 86400);

        // check borrows=4000+(5%+10%*40%)*4000*864000/31536000
        let borrowsBefore = await erc20Pool.borrowBalanceCurrent(accounts[0]);
        m.log("borrowsBefore =", borrowsBefore.toString());
        approxPrecisionAssertPrint("borrowsBefore", '4000986301369676799999',  borrowsBefore.toString(), 8);

        //base interest change to 10% 31536000 blocks
        await erc20Pool.setInterestParams(toBN(10e16).div(toBN(31536000)), toBN(10e16).div(toBN(31536000)), toBN(20e16).div(toBN(31536000)), 50e16 + '');

        let borrowsAfterUpdate = await erc20Pool.borrowBalanceCurrent(accounts[0]);
        let totalBorrowsAfterUpdate = await erc20Pool.totalBorrowsCurrent();
        let totalBorrowsStoredAfterUpdate = await erc20Pool.totalBorrows();
        let baseRatePerBlockAfterUpdate = await erc20Pool.baseRatePerBlock();
        // check borrows=4000+(5%+10%*40%)*4000*1001/100000
        m.log("borrowsAfterUpdate =", borrowsAfterUpdate.toString());
        m.log("totalBorrowsAfterUpdate =", totalBorrowsAfterUpdate.toString());
        m.log("totalBorrowsStoredAfterUpdate =", totalBorrowsStoredAfterUpdate.toString());
        m.log("baseRatePerBlockAfterUpdate =", baseRatePerBlockAfterUpdate.toString());
        approxPrecisionAssertPrint("borrowsAfterUpdate", '4000986301369676799999',  borrowsAfterUpdate.toString(), 8);
        approxPrecisionAssertPrint("totalBorrowsAfterUpdate", '4000986301369676800000', totalBorrowsAfterUpdate.toString(), 8);
        assert.equal("3170979198", baseRatePerBlockAfterUpdate.toString());
        await advanceTime(864000);

        // check borrows=4000.36+(10%+10%*40%)*4000.36*864000/31536000
        borrowsAfterUpdate = await erc20Pool.borrowBalanceCurrent(accounts[0]);
        totalBorrowsAfterUpdate = await erc20Pool.totalBorrowsCurrent();
        m.log("borrowsAfterUpdate =", borrowsAfterUpdate.toString());
        m.log("totalBorrowsAfterUpdate =", totalBorrowsAfterUpdate.toString());
        approxPrecisionAssertPrint("borrowsAfterUpdate", '4000986301369676800000',  borrowsAfterUpdate.toString(), 8);
        approxPrecisionAssertPrint("totalBorrowsAfterUpdate", '4000986301369676800000', totalBorrowsAfterUpdate.toString(), 8);

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
        let reserves = await erc20Pool.totalReserves();
        m.log("cashInPool =", cashInPool.toString());
        m.log("reserves =", reserves.toString());
        let avaiableCash = cashInPool.sub(reserves);
        m.log("avaiableCash =", avaiableCash.toString());
        approxPrecisionAssertPrint("cashInPool", '3266657062937755091', cashInPool.toString(), 5);
        approxPrecisionAssertPrint("reserves", '3266657062937755091', reserves.toString(), 5);
    })


})
