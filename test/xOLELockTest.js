const OLEToken = artifacts.require("OLEToken");
const {
    assertPrint,
    approxAssertPrint,
    createEthDexAgg,
    createUniswapV2Factory,
    createXOLE, assertThrows, toWei
} = require("./utils/OpenLevUtil");
const m = require('mocha-logger');
const {advanceMultipleBlocksAndTime, advanceBlockAndSetTime, toBN} = require("./utils/EtheUtil");
const timeMachine = require("ganache-time-traveler");

contract("xOLE", async accounts => {

    let H = 3600;
    let DAY = 86400;
    let WEEK = 7 * DAY;
    let MAXTIME = 126144000;
    let TOL = 120 / WEEK;

    let decimals = "000000000000000000";
    let _1000 = "1000000000000000000000";
    let _500 = "500000000000000000000";

    let bob = accounts[0];
    let alice = accounts[1];
    let admin = accounts[2];
    let dev = accounts[3];

    let uniswapFactory;

    let ole;
    let stakeLpToken;
    let xole;

    let stages = {};
    let snapshotId;
    beforeEach(async () => {
        ole = await OLEToken.new(admin, accounts[0], "Open Leverage Token", "OLE");
        await ole.mint(bob, _1000);
        await ole.mint(alice, _1000);

        uniswapFactory = await createUniswapV2Factory(admin);
        let dexAgg = await createEthDexAgg(uniswapFactory.address, "0x0000000000000000000000000000000000000000", admin);
        xole = await createXOLE(ole.address, admin, dev, dexAgg.address, admin);
        stakeLpToken = ole.address;
        await xole.setOleLpStakeToken(stakeLpToken, {from: admin});
        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));
        await advanceBlockAndSetTime(timeToMove);
        let snapshot = await timeMachine.takeSnapshot();
        snapshotId = snapshot['result'];
    })

    afterEach(async () => {
        await timeMachine.revertToSnapshot(snapshotId);
    });

    it("Create lock, increase amount, increase lock time", async () => {
        await ole.approve(xole.address, _1000 + "0", {"from": alice});
        await ole.approve(xole.address, _1000 + "0", {"from": bob});
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        let end = lastbk.timestamp + 2 * WEEK;
        m.log("Alice locked start ", lastbk.timestamp);
        m.log("Alice locked end ", end);
        m.log("Alice creates lock with 500 till time ", end, new Date(end));
        await xole.create_lock(_500, end, {"from": alice});
        assertPrint("Alice locked amount", _500, (await xole.locked(alice)).amount);
        approxAssertPrint("Alice locked end", end, (await xole.locked(alice)).end);
        approxAssertPrint("xOLE Total supply", "510400000000000000000", await xole.totalSupply());
        approxAssertPrint("Alice's balance of xOLE", "510400000000000000000", await xole.balanceOf(alice));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOf(bob));

        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        m.log("Alice increase amount with 500");
        await xole.increase_amount(_500, {"from": alice});
        assertPrint("Alice locked amount", _1000, (await xole.locked(alice)).amount);
        approxAssertPrint("Alice locked end", end, (await xole.locked(alice)).end); // end isn't changed
        approxAssertPrint("xOLE Total supply", "1020800000000000000000", await xole.totalSupply());
        approxAssertPrint("Alice's balance of xOLE", "1020800000000000000000", await xole.balanceOf(alice));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOf(bob));

        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        m.log("Alice increase lock time by 1 week");
        await xole.increase_unlock_time(end + WEEK, {"from": alice});
        assertPrint("Alice locked amount", _1000, (await xole.locked(alice)).amount);
        approxAssertPrint("Alice locked end", end + WEEK, (await xole.locked(alice)).end); // end isn't changed
        approxAssertPrint("xOLE Total supply", "1041600000000000000000", await xole.totalSupply());
        approxAssertPrint("Alice's balance of xOLE", "1041600000000000000000", await xole.balanceOf(alice));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOf(bob));
    })

    it("Create lock for other, and withdraw", async () => {
        await ole.approve(xole.address, _1000 + "0", {"from": alice});

        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        let end = lastbk.timestamp + 2 * WEEK;
        m.log("Alice creates lock to bob with 500 till time ", end, new Date(end));
        await xole.create_lock_for(bob, _500, end, {"from": alice});
        let bobBalance = await xole.balanceOf(bob);
        let aliceBalance = await xole.balanceOf(alice);
        assertPrint("Bob's balance of xOLE", "510400000000000000000", bobBalance);
        assertPrint("Alice's balance of xOLE", "0", aliceBalance);
        await advanceBlockAndSetTime(end + 60 * 60 * 24);
        await xole.withdraw({from: bob});
        let withdrawAmount = await (await OLEToken.at(stakeLpToken)).balanceOf(bob);
        assertPrint("Bob's stakeToken amount", "1500000000000000000000", withdrawAmount);
    })

    it("Create lock for other, and withdraw", async () => {
        await ole.approve(xole.address, _1000 + "0", {"from": alice});

        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        let end = lastbk.timestamp + 2 * WEEK;
        m.log("Alice creates lock to bob with 500 till time ", end, new Date(end));
        await xole.create_lock_for(bob, _500, end, {"from": alice});
        let bobBalance = await xole.balanceOf(bob);
        let aliceBalance = await xole.balanceOf(alice);
        assertPrint("Bob's balance of xOLE", "510400000000000000000", bobBalance);
        assertPrint("Alice's balance of xOLE", "0", aliceBalance);
        await advanceBlockAndSetTime(end + 60 * 60 * 24);
        await xole.withdraw({from: bob});
        let withdrawAmount = await (await OLEToken.at(stakeLpToken)).balanceOf(bob);
        assertPrint("Bob's stakeToken amount", "1500000000000000000000", withdrawAmount);
    })
    it("Increase amount lock for other, and withdraw", async () => {
        await ole.approve(xole.address, _1000 + "0", {"from": alice});

        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        let end = lastbk.timestamp + 2 * WEEK;
        m.log("Alice creates lock to bob with 500 till time ", end, new Date(end));
        await xole.create_lock(_500, end, {"from": alice});
        let aliceBalance = await xole.balanceOf(alice);
        assertPrint("Alice's balance of xOLE", "510400000000000000000", aliceBalance);
        await ole.approve(xole.address, _1000 + "0", {"from": bob});
        await xole.increase_amount_for(alice, _1000, {"from": bob});
        aliceBalance = await xole.balanceOf(alice);
        assertPrint("Alice's balance of xOLE", "1531200000000000000000", aliceBalance);
        await advanceBlockAndSetTime(end + 60 * 60 * 24);
        await xole.withdraw({from: alice});
        let withdrawAmount = await (await OLEToken.at(stakeLpToken)).balanceOf(alice);
        assertPrint("Alice's stakeToken amount", "2000000000000000000000", withdrawAmount);
    })
    it("Increase amount lock for other, and withdraw", async () => {
        await ole.approve(xole.address, _1000 + "0", {"from": alice});

        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        let end = lastbk.timestamp + 2 * WEEK;
        m.log("Alice creates lock to bob with 500 till time ", end, new Date(end));
        await xole.create_lock(_500, end, {"from": alice});
        let aliceBalance = await xole.balanceOf(alice);
        assertPrint("Alice's balance of xOLE", "510400000000000000000", aliceBalance);
        await advanceBlockAndSetTime(end + 60 * 60 * 24);
        await assertThrows(xole.withdraw_automator(alice), 'Not automator');
        await xole.setOleLpStakeAutomator(bob, {from: admin});
        await xole.withdraw_automator(alice, {from: bob});
        let withdrawAmount = await (await OLEToken.at(stakeLpToken)).balanceOf(bob);
        assertPrint("Bob's stakeToken amount", "1500000000000000000000", withdrawAmount);
    })
    it("Lock to get voting powers, and withdraw", async () => {

        if (process.env.FASTMODE === 'true') {
            m.log("Skipping this test for FAST Mode");
            return;
        }

        await ole.approve(xole.address, _1000 + "0", {"from": alice});
        await ole.approve(xole.address, _1000 + "0", {"from": bob});

        assertPrint("Total Supply", "0", await xole.totalSupply());
        assertPrint("Alice's Balance", "0", await xole.balanceOf(alice));
        assertPrint("Bob's Balance", "0", await xole.balanceOf(bob));

        let lastbk = await web3.eth.getBlock('latest');
        stages["before_deposits"] = {bknum: lastbk.number, bltime: lastbk.timestamp};

        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        let end = lastbk.timestamp + 2 * WEEK;
        m.log("Alice creates lock with 1000 till time ", end, new Date(end));
        await xole.create_lock(_1000, end, {"from": alice});
        lastbk = await web3.eth.getBlock('latest');
        stages["alice_deposit"] = {bknum: lastbk.number, bltime: lastbk.timestamp};

        approxAssertPrint("xOLE Total supply", "1020800000000000000000", await xole.totalSupply());
        approxAssertPrint("Alice's balance of xOLE", "1020800000000000000000", await xole.balanceOf(alice));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOf(bob));

        lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        end = lastbk.timestamp + WEEK * 3 + 100;

        m.log("Bob creates lock till time ", end, new Date(end));
        await xole.create_lock(_1000, end, {"from": bob});
        lastbk = await web3.eth.getBlock('latest');
        stages["bob_deposit"] = {bknum: lastbk.number, bltime: lastbk.timestamp};
        m.log("xole.totalSupply()", (await xole.totalSupply()).toString());
        approxAssertPrint("xOLE Total supply", "2062400000000000000000", await xole.totalSupply());
        approxAssertPrint("Alice's balance of xOLE", "1020800000000000000000", await xole.balanceOf(alice));
        approxAssertPrint("Bob's balance of xOLE", "1041600000000000000000", await xole.balanceOf(bob));

        await advanceBlockAndSetTime(end + 60 * 60 * 24);
        lastbk = await web3.eth.getBlock('latest');
        stages["check_point"] = {bknum: lastbk.number, bltime: lastbk.timestamp};
        approxAssertPrint("xOLE Total supply", "2062400000000000000000", await xole.totalSupply());
        assertPrint("Alice's balance of xOLE", "1020800000000000000000", await xole.balanceOf(alice));
        approxAssertPrint("Bob's balance of xOLE", "1041600000000000000000", await xole.balanceOf(bob));
        //
        m.log("Alice withdraw");
        await xole.withdraw({from: alice});
        approxAssertPrint("Alice's balance of ole", _1000, await ole.balanceOf(alice));

        approxAssertPrint("xOLE Total supply", "1041600000000000000000", await xole.totalSupply());
        assertPrint("Alice's balance of xOLE", "0", await xole.balanceOf(alice));
        approxAssertPrint("Bob's balance of xOLE", "1041600000000000000000", await xole.balanceOf(bob));


    })

    it("Create lock 2 weeks", async () => {
        await ole.approve(xole.address, _1000 + "0", {"from": alice});
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp + 1);
        let end = lastbk.timestamp + 1 * WEEK;
        m.log("Alice creates lock to bob with 500 till time ", end, new Date(end));
        await assertThrows(xole.create_lock(_500, end, {"from": alice}), 'Can only lock until time in the future');
        end = lastbk.timestamp + 2 * WEEK;
        await assertThrows(xole.create_lock(_500, end, {"from": alice}), 'Can only lock until time in the future');
        await advanceBlockAndSetTime(lastbk.timestamp - 1);
        await xole.create_lock(_500, end, {"from": alice});
        assertPrint("Alice's balance of xOLE", "510400000000000000000", await xole.balanceOf(alice));
        // increase time before unlock time
        await advanceBlockAndSetTime(end - 1 * WEEK + 1);
        await assertThrows(xole.increase_unlock_time(end + 1 * WEEK, {"from": alice}), 'Can only lock until time in the future');
        await advanceBlockAndSetTime(end - 1 * WEEK - 10);
        await xole.increase_unlock_time(end + 3 * WEEK, {"from": alice});
        assertPrint("Alice's balance of xOLE", "531200000000000000000", await xole.balanceOf(alice));
        approxAssertPrint("Alice locked end", end + 3 * WEEK, (await xole.locked(alice)).end);
        // increase time after unlock time
        await advanceBlockAndSetTime(end + 3 * WEEK + 1);
        lastbk = await web3.eth.getBlock('latest');
        await assertThrows(xole.increase_unlock_time(lastbk.timestamp + 1 * WEEK, {"from": alice}), 'Can only lock until time in the future');
        await xole.increase_unlock_time(lastbk.timestamp + 4 * WEEK, {"from": alice});
        approxAssertPrint("Alice locked end", lastbk.timestamp + 4 * WEEK, (await xole.locked(alice)).end);
        assertPrint("Alice's balance of xOLE", "520800000000000000000", await xole.balanceOf(alice));
    })

})
