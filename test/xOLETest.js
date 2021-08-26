const xOLE = artifacts.require("XOLE");
const OLEToken = artifacts.require("OLEToken");
const {assertPrint, approxAssertPrint, createDexAgg, createUniswapV2Factory, createXOLE} = require("./utils/OpenLevUtil");
const m = require('mocha-logger');
const timeMachine = require('ganache-time-traveler');
const {advanceMultipleBlocksAndTime, advanceBlockAndSetTime, toBN} = require("./utils/EtheUtil");

contract("xOLE", async accounts => {

    let H = 3600;
    let DAY = 86400;
    let WEEK = 7 * DAY;
    let MAXTIME = 126144000;
    let TOL = 120 / WEEK;

    let decimals = "000000000000000000";
    let _1000 = "1000000000000000000000"; // 10000
    let _500 = "500000000000000000000"; // 10000

    let bob = accounts[0];
    let alice = accounts[1];
    let admin = accounts[2];
    let dev = accounts[3];

    let uniswapFactory;

    let ole
    let xole;

    let stages = {};

    beforeEach(async () => {
        ole = await OLEToken.new(admin, "Open Leverage Token", "OLE");
        await ole.mint(bob, _1000);
        await ole.mint(alice, _1000);

        uniswapFactory = await createUniswapV2Factory(admin);
        let dexAgg = await createDexAgg(uniswapFactory.address,"0x0000000000000000000000000000000000000000",admin);
        xole = await createXOLE(ole.address, admin, dev, dexAgg.address, {from: admin});

        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));
        await advanceBlockAndSetTime(timeToMove);
    })

    it("Create lock, increase amount, increase lock time", async () => {
        await ole.approve(xole.address, _1000 + "0", {"from": alice});
        await ole.approve(xole.address, _1000 + "0", {"from": bob});

        let lastbk = await web3.eth.getBlock('latest');
        let end = lastbk.timestamp + WEEK;
        m.log("Alice creates lock with 500 till time ", end, new Date(end));
        await xole.create_lock(_500, end, {"from": alice});
        assertPrint("Alice locked amount", _500, (await xole.locked(alice)).amount);
        approxAssertPrint("Alice locked end", end, (await xole.locked(alice)).end);
        approxAssertPrint("xOLE Total supply", "2397256310248258030", await xole.totalSupply(0));
        approxAssertPrint("Alice's balance of xOLE", "2397256310248258030", await xole.balanceOf(alice, 0));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOf(bob, 0));

        await advanceMultipleBlocksAndTime(10);
        m.log("Alice increase amount with 500");
        await xole.increase_amount(_500, {"from": alice});
        assertPrint("Alice locked amount", _1000, (await xole.locked(alice)).amount);
        approxAssertPrint("Alice locked end", end, (await xole.locked(alice)).end); // end isn't changed
        approxAssertPrint("xOLE Total supply", "4793323503297729709", await xole.totalSupply(0));
        approxAssertPrint("Alice's balance of xOLE", "4793323503297729709", await xole.balanceOf(alice, 0));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOf(bob, 0));

        await advanceMultipleBlocksAndTime(10);
        m.log("Alice increase lock time by 1 week");
        await xole.increase_unlock_time(end + WEEK, {"from": alice});
        assertPrint("Alice locked amount", _1000, (await xole.locked(alice)).amount);
        approxAssertPrint("Alice locked end", end + WEEK, (await xole.locked(alice)).end); // end isn't changed
        approxAssertPrint("xOLE Total supply", "9586647006595459418", await xole.totalSupply(0));
        approxAssertPrint("Alice's balance of xOLE", "9586647006595459418", await xole.balanceOf(alice, 0));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOf(bob, 0));
    })


    it("Lock to get voting powers, and withdraw", async () => {
        /*
        Test voting power in the following scenario.
        Alice:
        ~~~~~~~
        ^sona
        | *       *
        | | \     |  \
        | |  \    |    \
        +-+---+---+------+---> t
        Bob:
        ~~~~~~~
        ^
        |         *
        |         | \
        |         |  \
        +-+---+---+---+--+---> t
        Alice has 100% of voting power in the first period.
        She has 2/3 power at the start of 2nd period, with Bob having 1/2 power
        (due to smaller locktime).
        Alice's power grows to 100% by Bob's unlock.
        Checking that totalSupply is appropriate.
        After the test is done, check all over again with balanceOfAt / totalSupplyAt
        */

        await ole.approve(xole.address, _1000 + "0", {"from": alice});
        await ole.approve(xole.address, _1000 + "0", {"from": bob});

        assertPrint("Totol Supply", "0", await xole.totalSupply(0));
        assertPrint("Alice's Balance", "0", await xole.balanceOf(alice, 0));
        assertPrint("Bob's Balance", "0", await xole.balanceOf(bob, 0));

        let lastbk = await web3.eth.getBlock('latest');
        stages["before_deposits"] = {bknum: lastbk.number, bltime: lastbk.timestamp};

        m.log("epoch", await xole.epoch());
        let end = lastbk.timestamp + WEEK;
        m.log("Alice creates lock with 1000 till time ", end, new Date(end));
        await xole.create_lock(_1000, end, {"from": alice});
        lastbk = await web3.eth.getBlock('latest');
        stages["alice_deposit"] = {bknum: lastbk.number, bltime: lastbk.timestamp};

        approxAssertPrint("xOLE Total supply", "4794520547945116800", await xole.totalSupply(0));
        approxAssertPrint("Alice's balance of xOLE", "4794520547945116800", await xole.balanceOf(alice, 0));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOf(bob, 0));

        m.log("epoch", await xole.epoch());

        await advanceMultipleBlocksAndTime(1000);

        approxAssertPrint("xOLE Total supply", "4675608828006001800", await xole.totalSupply(0));
        approxAssertPrint("Alice's balance of xOLE", "4675600900558006000", await xole.balanceOf(alice, 0));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOf(bob, 0));

        lastbk = await web3.eth.getBlock('latest');
        end = lastbk.timestamp + WEEK * 2;
        m.log("Bob creates lock till time ", end, new Date(end));
        await xole.create_lock(_1000, end, {"from": bob});
        lastbk = await web3.eth.getBlock('latest');
        stages["bob_deposit"] = {bknum: lastbk.number, bltime: lastbk.timestamp};
        m.log("epoch", await xole.epoch());

        approxAssertPrint("xOLE Total supply", "14145722349061128518", await xole.totalSupply(0));
        approxAssertPrint("Alice's balance of xOLE", "4675600900558005859", await xole.balanceOf(alice, 0));
        approxAssertPrint("Bob's balance of xOLE", "9470121448503122659", await xole.balanceOf(bob, 0));

        await advanceMultipleBlocksAndTime(2000);

        m.log("xOLE Total supply", await xole.totalSupply(0));
        m.log("Alice's balance of xOLE", await xole.balanceOf(alice, 0));
        m.log("Bob's balance of xOLE", await xole.balanceOf(bob, 0));

        await advanceMultipleBlocksAndTime(39000);
        lastbk = await web3.eth.getBlock('latest');
        stages["check_point"] = {bknum: lastbk.number, bltime: lastbk.timestamp};
        approxAssertPrint("xOLE Total supply", "4594748858447403600", await xole.totalSupply(0));
        assertPrint("Alice's balance of xOLE", "0", await xole.balanceOf(alice, 0));
        approxAssertPrint("Bob's balance of xOLE", "4594748858447403600", await xole.balanceOf(bob, 0));
        //
        m.log("Alice withdraw");
        await xole.withdraw({from: alice});

        approxAssertPrint("xOLE Total supply", "4594748858447403600", await xole.totalSupply(0));
        assertPrint("Alice's balance of xOLE", "0", await xole.balanceOf(alice, 0));
        approxAssertPrint("Bob's balance of xOLE", "4594748858447403600", await xole.balanceOf(bob, 0));

        m.log("Now check for historical balance for stage [alice_deposit]");
        approxAssertPrint("xOLE Total supply", "4794520547945116800", await xole.totalSupplyAt(stages.alice_deposit.bknum));
        approxAssertPrint("Alice's balance of xOLE", "4794520547945116800", await xole.balanceOfAt(alice, stages.alice_deposit.bknum));
        assertPrint("Bob's balance of xOLE", "0", await xole.balanceOfAt(bob, stages.alice_deposit.bknum));

        m.log("Now check for historical balance for stage [bob_deposit]");
        approxAssertPrint("xOLE Total supply", "14145738203957120400", await xole.totalSupplyAt(stages.bob_deposit.bknum));
        approxAssertPrint("Alice's balance of xOLE", "4675608828006001800", await xole.balanceOfAt(alice, stages.bob_deposit.bknum));
        approxAssertPrint("Bob's balance of xOLE", "9470129375951118600", await xole.balanceOfAt(bob, stages.bob_deposit.bknum));

    })

})
