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
        approxAssertPrint("badDebtsAmount", '40000158707508', toBN(tx.logs[3].args.badDebtsAmount));
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
        approxAssertPrint("badDebtsAmount", '40000792586250', toBN(tx.logs[3].args.badDebtsAmount));
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
        approxAssertPrint("badDebtsAmount", '40000475646879', toBN(tx.logs[3].args.badDebtsAmount));
    })

    // --- old block number test ---
    it("Supply,borrow,repay,redeem test", async () => {
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createTimePool(accounts[0], controller, admin);
        let erc20Pool = createPoolResult.pool;
        let blocksPerYear = toBN(31536000);
        let testToken = createPoolResult.token;
        await utils.mint(testToken, admin, 10000);
        await advanceTime(1);

        let cash = await erc20Pool.getCash();
        assert.equal(cash, 0);
        /**
         * deposit
         */
        //deposit10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(10000 * 1e10);

        await erc20Pool.setReserveFactor(toBN(2e17));
        await advanceTime(3);

        //Checking deposits
        assert.equal(await erc20Pool.getCash(), 10000 * 1e10);
        assert.equal(await erc20Pool.totalSupply(), 10000 * 1e10);
        //Check deposit rate
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        //Check loan interest rate
        approxAssertPrint("Check loan interest rate", '49999999998268800', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());

        /**
         * borrow money
         */
        //borrow money5000
        await erc20Pool.borrowBehalf(accounts[0], 5000 * 1e10);
        await advanceTime(1);

        approxAssertPrint("Check borrow rate", '99999999996537600', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("Check supply rate", '39999999997353600', (await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString());

        //inspect snapshot
        let accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 10000 * 1e10);
        assert.equal(accountSnapshot[1], 5000 * 1e10);
        assert.equal(accountSnapshot[2], 1e18);
        //Borrow 2000 more
        await erc20Pool.borrowBehalf(accounts[0], 2000 * 1e10);
        await advanceTime(1);

        approxAssertPrint("Check borrow rate", '140000002087881600', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("Check supply rate", '78400002340166400', (await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString());
        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        approxAssertPrint("Check accountSnapshot 1", '70000002378234', accountSnapshot[1].toString());
        approxAssertPrint("Check accountSnapshot 2", '1000000019025880000', accountSnapshot[2].toString());
        //Total borrowings
        approxAssertPrint("Check totalBorrows", '70000002378234', await erc20Pool.totalBorrows());

        //Update total borrowings and interest
        await erc20Pool.accrueInterest();
        await advanceTime(1);

        approxAssertPrint("Check borrow rate", '140000006189664000', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("Check supply rate", '78400006933910400', (await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString());

        //rate of exchange
        approxAssertPrint("Check exchangeRateStored", '1000000056316600000', (await erc20Pool.exchangeRateStored()).toString());

        /**
         * repayment
         */
        await erc20Pool.repayBorrowBehalf(accounts[0], maxUint());
        await advanceTime(1);

        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 10000 * 1e10);
        assert.equal(accountSnapshot[1], 0);
        //Total borrowings
        assert.equal(await erc20Pool.totalBorrows(), 0);
        //Total deposit
        assert.equal(await erc20Pool.totalSupply(), 10000 * 1e10);
        //Loan interest rate and deposit interest rate
        approxAssertPrint("Check borrow rate", '49999999998268800', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '0');
        //rate of exchange
        approxAssertPrint("Check exchange rate", '1000000093607320000', (await erc20Pool.exchangeRateStored()).toString());

        /**
         * Withdrawal
         */
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        await advanceTime(1);

        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 0);
        approxAssertPrint("Check balanceOf", '9999999999999997659819', (await testToken.balanceOf(accounts[0])).toString());
        approxAssertPrint("Check borrow rate", '49999999998268800', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
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
        await erc20Pool.borrowBehalf(accounts[0], 5000 * 1e10, {from: accounts[1]});
        await advanceTime(4);

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
        await advanceTime(5);

        // advance 15000 seconds
        await advanceTime(15000);
        m.log("advance 15000 seconds...");
        let exchangeRateStored1 = await erc20Pool.exchangeRateStored();
        m.log("exchangeRateStored1", exchangeRateStored1);
        assert.equal('1000000000000000000', exchangeRateStored1);

        await testToken.approve(erc20Pool.address, maxUint(), {from: accounts[1]});

        await controller.setOpenLev(accounts[1]);

        let tx = await erc20Pool.repayBorrowEndByOpenLev(accounts[2], 1000 * 1e10, {from: accounts[1]});
        await advanceTime(3);

        m.log("tx", JSON.stringify(tx));
        assertPrint("repayAmount", '10000000000000', toBN(tx.logs[3].args.repayAmount));
        approxAssertPrint("badDebtsAmount", '40002378234398', toBN(tx.logs[3].args.badDebtsAmount));
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
        approxAssertPrint("exchangeRateStored", '599995229261800000', exchangeRateStored2.toString());
        assert.equal('60000000000000', getCash2);
        await erc20Pool.mint(1000 * 1e10);
        //
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        await advanceTime(2);

        //
        let getCash3 = await erc20Pool.getCash();
        let totalReserves = await erc20Pool.totalReserves();
        //
        approxPrecisionAssertPrint("getCash3", '475646880', getCash3.toString(), 2);
        approxPrecisionAssertPrint("totalReserves", '475646879', totalReserves.toString(), 2);
        let exchangeRateStored3 = await erc20Pool.exchangeRateStored();
        m.log("exchangeRateStored3", exchangeRateStored3);
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
        await advanceTime(3);

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
            await advanceTime(1);

            m.log("MintEth Gas Used: ", tx.receipt.gasUsed);
            assert.equal((await erc20Pool.getCash()).toString(), mintAmount.toString());
            assert.equal((await erc20Pool.totalSupply()).toString(), mintAmount.toString());
            //redeem
            let ethBefore = await web3.eth.getBalance(admin);
            await erc20Pool.redeemUnderlying(mintAmount);
            await advanceTime(1);

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
        await advanceTime(1);

        m.log("DepositEth Gas Used: ", tx.receipt.gasUsed);
        assert.equal((await erc20Pool.getCash()).toString(), mintAmount.toString());
        assert.equal((await erc20Pool.totalSupply()).toString(), mintAmount.toString());
        //redeem
        let ethBefore = await web3.eth.getBalance(admin);
        await erc20Pool.redeemUnderlying(mintAmount);
        await advanceTime(1);

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
        await advanceTime(1);

        let poolDepositor = await LPoolDepositorDelegator.new((await LPoolDepositor.new()).address, accounts[0]);
        poolDepositor = await LPoolDepositor.at(poolDepositor.address);
        let mintAmount = toWei(1);
        //deposit 1
        await testToken.approve(poolDepositor.address, maxUint());
        let tx = await poolDepositor.deposit(erc20Pool.address, mintAmount);
        await advanceTime(2);

        m.log("DepositErc20 Gas Used: ", tx.receipt.gasUsed);
        assert.equal((await erc20Pool.getCash()).toString(), mintAmount.toString());
        assert.equal((await erc20Pool.totalSupply()).toString(), mintAmount.toString());
        //redeem
        await erc20Pool.redeemUnderlying(mintAmount);
        await advanceTime(1);

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
        await advanceTime(1);

        let cash = await erc20Pool.getCash();
        assert.equal(cash, 0);
        /**
         * deposit
         */
        //deposit10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(utils.toWei(10000));
        await erc20Pool.setReserveFactor(toBN(2e17));
        await advanceTime(3);

        //Checking deposits
        assert.equal(await erc20Pool.getCash(), utils.toWei(10000).toString());
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(10000).toString());
        //Check deposit rate
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        //Check loan interest rate
        assert.equal((await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), '49999999994064000');

        /* raise balance */
        await utils.mint(testToken, erc20Pool.address, 10000);
        await advanceTime(1);

        assert.equal(await erc20Pool.getCash(), utils.toWei(20000).toString());
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(10000).toString());
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        approxAssertPrint("borrowRate", '49999999998268800', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());

        /* deposit again by another account*/
        await utils.mint(testToken, accounts[1], 20000);
        await testToken.approve(erc20Pool.address, maxUint(), {from: accounts[1]});
        await erc20Pool.mint(utils.toWei(20000), {from: accounts[1]});
        await advanceTime(3);

        assert.equal(await erc20Pool.getCash(), utils.toWei(40000).toString());
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(20000).toString());
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        approxAssertPrint("borrowRate", '49999999998268800', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());

        /* Withdrawal
         */
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        await advanceTime(1);

        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 0);
        assert.equal((await testToken.balanceOf(accounts[0])).toString(), utils.toWei(20000).toString());

        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[1]))[0], {from: accounts[1]});
        await advanceTime(1);

        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[1]);
        assert.equal(accountSnapshot[0], 0);
        assert.equal((await testToken.balanceOf(accounts[1])).toString(), utils.toWei(20000).toString());

        approxAssertPrint("borrowRate", '49999999998268800', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
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
        await advanceTime(1);

        let cash = await erc20Pool.getCash();
        assert.equal(cash, 0);
        /**
         * deposit
         */
        //deposit10000
        await testToken.approve(erc20Pool.address, maxUint());
        await erc20Pool.mint(utils.toWei(10000));
        await erc20Pool.setReserveFactor(toBN(2e17));
        await advanceTime(3);

        //Checking deposits
        assert.equal(await erc20Pool.getCash(), utils.toWei(10000).toString());
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(10000).toString());
        //Check deposit rate
        assert.equal(await erc20Pool.supplyRatePerBlock(), 0);
        //Check loan interest rate
        approxAssertPrint("borrowRate", '49999999994064000', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());

        /**
         * borrow money
         */
        //borrow money5000
        await erc20Pool.borrowBehalf(borrower0, utils.toWei(5000), {from: borrower0});
        await advanceTime(1);

        approxAssertPrint("borrowRate", '99999999996537600', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("supplyRate", '39999999997353600', (await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString());
        //inspect snapshot
        let accountSnapshot = await erc20Pool.getAccountSnapshot(borrower0);
        assert.equal(accountSnapshot[0], 0);
        assert.equal(accountSnapshot[1], utils.toWei(5000).toString());
        assert.equal(accountSnapshot[2], 1e18);

        /* deposit again by another account*/
        await utils.mint(testToken, lender0, 20000, {from: lender0});
        await testToken.approve(erc20Pool.address, maxUint(), {from: lender0});
        await erc20Pool.mint(utils.toWei(20000), {from: lender0});
        await advanceTime(3);

        assert.equal(await erc20Pool.getCash(), utils.toWei(25000).toString());
        approxAssertPrint("totalSupply",  "29999998858447553797103", await erc20Pool.totalSupply())
        approxAssertPrint("borrowRate", '66666668725411200', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("supplyRate", '8888889163388160', (await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString());

        /* raise balance */
        await utils.mint(testToken, erc20Pool.address, 60000);
        await advanceTime(1);

        assert.equal(await erc20Pool.getCash(), utils.toWei(85000).toString());
        approxAssertPrint("totalSupply",  "29999998858447553797103", await erc20Pool.totalSupply())
        approxAssertPrint("borrowRate", '55555556310028800', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("supplyRate", '2469135781152000', (await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString());

        //Borrow 5000 more
        await erc20Pool.borrowBehalf(borrower0, utils.toWei(5000), {from: borrower0});
        await advanceTime(1);

        approxAssertPrint("borrowRate", '61111112098291200', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("supplyRate", '5432099336640000', (await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString());
        accountSnapshot = await erc20Pool.getAccountSnapshot(borrower0);
        approxAssertPrint("accountSnapshot 1",  "10000000977718627436659", accountSnapshot[1].toString())
        approxAssertPrint("accountSnapshot 2",  "3000000140227746687", accountSnapshot[2].toString())

        //Total borrowings
        approxAssertPrint("accountSnapshot 2",  "10000000977718627436659", await erc20Pool.totalBorrows())

        //Update total borrowings and interest
        await erc20Pool.accrueInterest();
        await advanceTime(1);

        approxAssertPrint("borrowRate", '61111112392627200', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("supplyRate", '5432099506934400', (await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString());
        //rate of exchange
        approxAssertPrint("exchangeRateStored", '3000000147979030350', (await erc20Pool.exchangeRateStored()).toString());

        /**
         * Withdrawal partial
         */
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(lender0))[0], {from: lender0});
        await advanceTime(1);

        accountSnapshot = await erc20Pool.getAccountSnapshot(lender0);
        assert.equal(accountSnapshot[0], 0);
        assert.equal(await erc20Pool.totalSupply(), utils.toWei(10000).toString());
        approxAssertPrint("balanceOf", "59999999689948769136987", (await testToken.balanceOf(lender0)).toString());
        approxAssertPrint("borrowRatePerBlock", '83333336796604800', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("supplyRatePerBlock", '22222225455177600', (await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString());
        approxAssertPrint("exchangeRateStored", "3000000155730314277", (await erc20Pool.exchangeRateStored()).toString());
        approxAssertPrint("availableForBorrow", '13999999686777624331795', (await erc20Pool.availableForBorrow()).toString());

        /**
         * repayment
         */
        await utils.mint(testToken, borrower0, 10000);
        await testToken.approve(erc20Pool.address, maxUint(), {from: borrower0});
        await erc20Pool.repayBorrowBehalf(borrower0, maxUint(), {from: borrower0});
        await advanceTime(3);

        accountSnapshot = await erc20Pool.getAccountSnapshot(borrower0);
        assert.equal(accountSnapshot[0], 0);
        assert.equal(accountSnapshot[1], 0);
        //Total deposit
        //Loan interest rate and deposit interest rate
        approxAssertPrint("borrowRatePerBlock", '49999999998268800', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString());
        assert.equal((await erc20Pool.supplyRatePerBlock()).mul(blocksPerYear).toString(), '0');
        //rate of exchange
        approxAssertPrint("exchangeRateStored", "3000000250859709013", (await erc20Pool.exchangeRateStored()).toString());

        /**
         * Withdrawal all
         */
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        await advanceTime(1);

        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 0);
        approxAssertPrint("balanceOf", "30000002508597090130000", (await testToken.balanceOf(accounts[0])).toString());
        m.log("getCashPrior(), totalBorrows, totalReserves--", await  erc20Pool.getCash(), erc20Pool.totalBorrows(), erc20Pool.totalReserves());
        approxPrecisionAssertPrint("borrowRatePerBlock", "49999999998268800", (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), 2);
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
        await advanceTime(5);

        //advance 15000 seconds
        await advanceTime(15000);
        //repay
        await erc20Pool.repayBorrowBehalf(accounts[0], maxUint());
        await advanceTime(1);

        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0].toString(), toWei(9000).toString());
        assert.equal(accountSnapshot[1], 0);

        //withdrawal
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        await advanceTime(1);

        let totalBorrows = await erc20Pool.totalBorrows();
        let totalCash = await erc20Pool.getCash();
        let reserves = await erc20Pool.totalReserves();
        m.log("totalBorrows", totalBorrows);
        m.log("totalCash ", totalCash);
        m.log("reserves", reserves);

        accountSnapshot = await erc20Pool.getAccountSnapshot(accounts[0]);
        assert.equal(accountSnapshot[0], 0);
        approxAssertPrint("balanceOf", '9999994180724674728001', (await testToken.balanceOf(accounts[0])).toString());
        approxPrecisionAssertPrint("Check borrow rate", '1586018095', await erc20Pool.borrowRatePerBlock(), 2);
        assert.equal(toETH(await erc20Pool.supplyRatePerBlock()), 0);
        assert.equal((await erc20Pool.exchangeRateStored()).toString(), 1e18);
        approxPrecisionAssertPrint("reserves", '5819275325263400', reserves.toString(), 2);
        //reduce reserves
        await advanceTime(45);
        await erc20Pool.reduceReserves(accounts[1], '1819275325263400');
        await advanceTime(1);

        let reservesAfterReduce = await erc20Pool.totalReserves();
        approxPrecisionAssertPrint("reservesAfterReduce", '4000000000000000', reservesAfterReduce.toString(), 2);
        approxPrecisionAssertPrint("Check borrow rate", '50011627903833600', (await erc20Pool.borrowRatePerBlock()).mul(blocksPerYear).toString(), 2);
        assert.equal(toETH(await erc20Pool.supplyRatePerBlock()), 0);
        assert.equal((await erc20Pool.exchangeRateStored()).toString(), 1e18);
        approxPrecisionAssertPrint("balanceOf", '1819275325263400', (await testToken.balanceOf(accounts[1])).toString(), 2);
        approxPrecisionAssertPrint("cash", '4000000000008599', (await erc20Pool.getCash()).toString(), 2);
        // add reserves
        await erc20Pool.addReserves('1000000000000000');
        await advanceTime(1);
        approxPrecisionAssertPrint("totalReserves", '5000000000000000', (await erc20Pool.totalReserves()).toString(), 2);
        approxPrecisionAssertPrint("cash", '5000000000008599', (await erc20Pool.getCash()).toString(), 2);

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
        await advanceTime(6);

        // advance 315360 blocks
        await advanceMultipleBlocksAndAssignTime(1, 315360);
        // check borrows=4000+(5%+10%*40%)*4000*315360/31536000
        let borrowsBefore = await erc20Pool.borrowBalanceCurrent(accounts[0]);
        m.log("borrowsBefore =", borrowsBefore.toString());
        approxAssertPrint("borrowsBefore", '4003599999999999999999', borrowsBefore.toString());
        //base interest change to 10% 31536000 blocks
        await erc20Pool.setInterestParams(toBN(10e16).div(toBN(31536000)), toBN(10e16).div(toBN(31536000)), toBN(20e16).div(toBN(31536000)), 50e16 + '');
        await advanceTime(1);

        let borrowsAfterUpdate = await erc20Pool.borrowBalanceCurrent(accounts[0]);
        let totalBorrowsAfterUpdate = await erc20Pool.totalBorrowsCurrent();
        let totalBorrowsStoredAfterUpdate = await erc20Pool.totalBorrows();
        let baseRatePerBlockAfterUpdate = await erc20Pool.baseRatePerBlock();
        // check borrows=4000+(5%+10%*40%)*4000*1001/100000
        m.log("borrowsAfterUpdate =", borrowsAfterUpdate.toString());
        m.log("totalBorrowsAfterUpdate =", totalBorrowsAfterUpdate.toString());
        m.log("totalBorrowsStoredAfterUpdate =", totalBorrowsStoredAfterUpdate.toString());
        m.log("baseRatePerBlockAfterUpdate =", baseRatePerBlockAfterUpdate.toString());
        approxAssertPrint("borrowsAfterUpdate", '4003603599999999999999',  borrowsAfterUpdate.toString());
        approxAssertPrint("totalBorrowsAfterUpdate", '4003603600000000000000', totalBorrowsAfterUpdate.toString());
        assert.equal("3170979198", baseRatePerBlockAfterUpdate.toString());
        // advance 1000 blocks
        await advanceMultipleBlocksAndAssignTime(1, 315360);
        m.log("advance 315360 blocks...");
        // check borrows=4000.36+(10%+10%*40%)*4000.36*315360/31536000
        borrowsAfterUpdate = await erc20Pool.borrowBalanceCurrent(accounts[0]);
        totalBorrowsAfterUpdate = await erc20Pool.totalBorrowsCurrent();
        m.log("borrowsAfterUpdate =", borrowsAfterUpdate.toString());
        m.log("totalBorrowsAfterUpdate =", totalBorrowsAfterUpdate.toString());
        approxAssertPrint("borrowsAfterUpdate", '4009209625819492940633',  borrowsAfterUpdate.toString());
        approxAssertPrint("totalBorrowsAfterUpdate", '4009209625819492940633', totalBorrowsAfterUpdate.toString());

        // repay
        await erc20Pool.repayBorrowBehalf(accounts[0], maxUint());
        await advanceTime(1);

        m.log("after repay...");
        borrowsAfterUpdate = await erc20Pool.borrowBalanceCurrent(accounts[0]);
        totalBorrowsAfterUpdate = await erc20Pool.totalBorrowsCurrent();
        assert.equal("0", borrowsAfterUpdate.toString());
        assert.equal("0", totalBorrowsAfterUpdate.toString());
        // redeem
        await erc20Pool.redeem((await erc20Pool.getAccountSnapshot(accounts[0]))[0]);
        await advanceTime(1);

        let cashInPool = await erc20Pool.getCash();
        let reserves = await erc20Pool.totalReserves();
        //184,3046,3690,6248,6714
        m.log("cashInPool =", cashInPool.toString());
        m.log("reserves =", reserves.toString());
        let avaiableCash = cashInPool.sub(reserves);
        m.log("avaiableCash =", avaiableCash.toString());
        approxPrecisionAssertPrint("cashInPool", '1843046369062493574', cashInPool.toString(), 2);
        approxPrecisionAssertPrint("reserves", '1843046369062486714', reserves.toString(), 2);
    })


})
