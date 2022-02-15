const {toBN} = require("./utils/EtheUtil");

const {toWei, lastBlockTime, toETH, firstStr, assertThrows} = require("./utils/OpenLevUtil");
const OLETokenLock = artifacts.require("OLETokenLock");
const OLEToken = artifacts.require("OLEToken");


const m = require('mocha-logger');

const timeMachine = require('ganache-time-traveler');

contract("OLETokenLock", async accounts => {
    let oleToken;

    beforeEach(async () => {
        oleToken = await OLEToken.new(accounts[0], accounts[0], 'TEST', 'TEST');
    });

    it("Take out all at one time, the time has expired: ", async () => {
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [(parseInt(await lastBlockTime()))]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        assert.equal((await oleTokenLock.releaseAbleAmount(accounts[1])), toWei(100000).toString());
        await oleTokenLock.releaseAll({from: accounts[1]});
        assert.equal((await oleTokenLock.releaseAbleAmount(accounts[1])), 0);
        // Comparison of results
        assert.equal(toBN(100000).mul(toBN(1e18)).toString(), (await oleToken.balanceOf(accounts[1])).toString());
    });

    it("The withdrawal address is non beneficiary: ", async () => {
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [(parseInt(await lastBlockTime()))]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        await assertThrows(oleTokenLock.releaseAll({from: accounts[2]}), 'nothing to release');
    });

    it("Cash withdrawal before start time:", async () => {
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)], [(parseInt(await lastBlockTime()) + 30000).toString().substr(0, 10)], [(parseInt(await lastBlockTime()) + 60000) + ""]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        await assertThrows(oleTokenLock.releaseAll({from: accounts[1]}), 'nothing to release');
    });

    it("Withdraw twice, is the amount correct each time: ", async () => {
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [(parseInt(await lastBlockTime()) + 30000)]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        await oleTokenLock.releaseAll({from: accounts[1]});
        assert.equal(firstStr("999", 3), firstStr((await oleToken.balanceOf(accounts[1])).toString(), 3));

        m.log("Wait for 10 seconds ....");
        let takeSnapshot = await timeMachine.takeSnapshot();
        let shotId = takeSnapshot['result'];
        await timeMachine.advanceTime(30000);
        await oleTokenLock.releaseAll({from: accounts[1]});

        // Comparison of results
        assert.equal(firstStr("99999", 5), firstStr((await oleToken.balanceOf(accounts[1])).toString(), 5));
        await timeMachine.revertToSnapshot(shotId);
    });

    it("After one withdrawal, is the result correct at end time", async () => {
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [(parseInt(await lastBlockTime()) + 30000)]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        await oleTokenLock.releaseAll({from: accounts[1]});
        // comparison of results
        assert.equal(firstStr("999", 3), firstStr((await oleToken.balanceOf(accounts[1])).toString(), 3));

        m.log("Wait for 10 seconds ....");
        let takeSnapshot = await timeMachine.takeSnapshot();
        let shotId = takeSnapshot['result'];
        await timeMachine.advanceTime(30000);
        await oleTokenLock.releaseAll({from: accounts[1]});

        //comparison of results
        assert.equal(firstStr("99999999", 8), firstStr((await oleToken.balanceOf(accounts[1])).toString(), 8));
        await timeMachine.revertToSnapshot(shotId);
    });

    it("If the withdrawal is completed, is it wrong to withdraw again: ", async () => {
        // 2020-09-06 14:05:11  2021-01-01 14:05:11
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [(parseInt(await lastBlockTime()))]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        await oleTokenLock.releaseAll({from: accounts[1]});
        // comparison of results
        assert.equal(toWei(100000).toString(), (await oleToken.balanceOf(accounts[1])).toString());
        await assertThrows(oleTokenLock.releaseAll({from: accounts[1]}), 'nothing to release');
    });


    it("Two accounts, two addresses, partial withdrawal: ", async () => {
        // 2020-09-06 14:05:11  2021-01-01 14:05:11
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1], accounts[3]], [toWei(100000), toWei(100000)],
            ['1599372311', '1599372311'], [(parseInt(await lastBlockTime()) + 0) + "", (parseInt(await lastBlockTime()) + 0) + ""]);

        m.log("userHoldings account1:", await oleTokenLock.getUserHoldings(accounts[1]));
        m.log("userHoldings account3:", await oleTokenLock.getUserHoldings(accounts[3]));

        await oleToken.transfer(oleTokenLock.address, toWei(100000));

        await oleTokenLock.releaseAll({from: accounts[1]});

        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        await oleTokenLock.releaseAll({from: accounts[3]})

        // comparison of results
        assert.equal(toWei(100000).toString(), (await oleToken.balanceOf(accounts[1])).toString());

        assert.equal(toWei(100000).toString(), (await oleToken.balanceOf(accounts[3])).toString());

    });

    it("transfer to A error with beneficiary does not exist test", async () => {
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)],
            [parseInt(await lastBlockTime())], [parseInt(await lastBlockTime()) + 10000]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        await timeMachine.advanceTime(5000);
        await assertThrows(oleTokenLock.transferTo(accounts[2], 0, toWei(20000), {from: accounts[3]}), 'release ID not found');
    });

    it("transfer to A  error with locked end test", async () => {
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)],
            [parseInt(await lastBlockTime())], [parseInt(await lastBlockTime()) + 1000]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        await timeMachine.advanceTime(1001);
        await assertThrows(oleTokenLock.transferTo(accounts[2], 0, toWei(20000), {from: accounts[1]}), 'nothing to transfer');
    });
    
    it("transfer to A succeed test", async () => {
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)],
            [parseInt(await lastBlockTime())], [parseInt(await lastBlockTime()) + 10000]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        let shotId = (await timeMachine.takeSnapshot())['result'];
        await timeMachine.advanceTime(5000);
        await oleTokenLock.releaseAll({from: accounts[1]});
        await timeMachine.advanceTime(1000);
        await oleTokenLock.transferTo(accounts[2], 0, toWei(20000), {from: accounts[1]});
        await timeMachine.advanceTime(4000);
        await oleTokenLock.releaseAll({from: accounts[1]});
        await oleTokenLock.releaseAll({from: accounts[2]});
        assert.equal((await oleTokenLock.releaseVars(accounts[1])).end,(await oleTokenLock.releaseVars(accounts[2])).end);

        // comparison of results
        assert.equal(toWei(80000).toString(), (await oleToken.balanceOf(accounts[1])).toString());
        assert.equal(toWei(20000).toString(), (await oleToken.balanceOf(accounts[2])).toString());
        await timeMachine.revertToSnapshot(shotId);
    });

    it("transfer to A,A transfer to B test", async () => {
        let oleTokenLock = await OLETokenLock.new(oleToken.address, [accounts[1]], [toWei(100000)],
            [parseInt(await lastBlockTime())], [parseInt(await lastBlockTime()) + 10000]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(100000));
        let shotId = (await timeMachine.takeSnapshot())['result'];
        await timeMachine.advanceTime(5000);
        await oleTokenLock.releaseAll({from: accounts[1]});
        await timeMachine.advanceTime(1000);
        await oleTokenLock.transferTo(accounts[2], 0, toWei(20000), {from: accounts[1]});
        await timeMachine.advanceTime(2000);
        await oleTokenLock.transferTo(accounts[3], 1, toWei(5000), {from: accounts[2]});
        await timeMachine.advanceTime(2000);
        assert.equal((await oleTokenLock.releaseVars(accounts[1])).end,(await oleTokenLock.releaseVars(accounts[2])).end);
        assert.equal((await oleTokenLock.releaseVars(accounts[2])).end,(await oleTokenLock.releaseVars(accounts[3])).end);

        await oleTokenLock.releaseAll({from: accounts[1]});
        await oleTokenLock.releaseAll({from: accounts[2]});
        await oleTokenLock.releaseAll({from: accounts[3]});
        // comparison of results
        assert.equal(toWei(80000).toString(), (await oleToken.balanceOf(accounts[1])).toString());
        assert.equal(toWei(15000).sub(await oleToken.balanceOf(accounts[2])).lt(toBN(100)), true);
        assert.equal(toWei(5000).sub(await oleToken.balanceOf(accounts[2])).lt(toBN(100)), true);

        await timeMachine.revertToSnapshot(shotId);

    });

    it("transfer to a exsited account success with 2 releases", async () => {
        let oleTokenLock = await OLETokenLock.new(
            oleToken.address, 
            [accounts[1], accounts[2]], 
            [toWei(100000), toWei(100000)],
            [parseInt(await lastBlockTime()) + 100, parseInt(await lastBlockTime()) + 100], 
            [parseInt(await lastBlockTime()) + 1100, parseInt(await lastBlockTime()) + 1100]);
        m.log("userHoldings:", await oleTokenLock.getUserHoldings(accounts[1]));
        await oleToken.transfer(oleTokenLock.address, toWei(200000));
        await timeMachine.advanceTime(10);
        await oleTokenLock.transferTo(accounts[2], 0, toWei(20000), {from: accounts[1]});

        await assert.equal((await oleTokenLock.lockedAmount(accounts[1])).toString(), toWei(80000).toString());
        await assert.equal((await oleTokenLock.lockedAmount(accounts[2])).toString(), toWei(120000).toString());
    });
})


