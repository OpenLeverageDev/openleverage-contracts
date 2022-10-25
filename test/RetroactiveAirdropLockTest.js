const {toBN} = require("./utils/EtheUtil");

const {toWei, lastBlockTime, toETH, firstStr, assertThrows} = require("./utils/OpenLevUtil");
const RetroactiveAirdropLock = artifacts.require("RetroactiveAirdropLock");
const OLEToken = artifacts.require("OLEToken");


const m = require('mocha-logger');

const timeMachine = require('ganache-time-traveler');
const utils = require("./utils/OpenLevUtil");
const {from} = require("truffle/build/987.bundled");

contract("RetroactiveAirdropLock", async accounts => {
    let oleToken;
    let currentBlockTime;
    let timeLock;
    
    beforeEach(async () => {
        oleToken = await OLEToken.new(accounts[0], accounts[0], 'TEST', 'TEST');
        currentBlockTime =  parseInt(await lastBlockTime());
        timeLock = await utils.createTimelock(accounts[0]);
    });

    it("Claim before start time", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, currentBlockTime + 1000000, currentBlockTime + 2000000, currentBlockTime + 3000000);
        await timeLock.executeTransaction(lock.address, 0, 'setReleaseBatch(address[],uint256[])',
            web3.eth.abi.encodeParameters(['address[]', 'uint256[]'], [[accounts[1]], [toWei(100000)]]), 0);
        await oleToken.transfer(lock.address, toWei(100000));
        await assertThrows(lock.release({from: accounts[1]}), 'not time to unlock');
    });

    it("Claim after end time and before expire time", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, '1599372311', currentBlockTime, currentBlockTime + 10000000);
        await timeLock.executeTransaction(lock.address, 0, 'setReleaseBatch(address[],uint256[])',
            web3.eth.abi.encodeParameters(['address[]', 'uint256[]'], [[accounts[1]], [toWei(100000)]]), 0);
        await oleToken.transfer(lock.address, toWei(100000));
        await lock.release({from: accounts[1]});
        assert.equal((await lock.releaseAbleAmount(accounts[1])), 0);
        assert.equal(toBN(100000).mul(toBN(1e18)).toString(), (await oleToken.balanceOf(accounts[1])).toString());
    });

    it("Claim after expire time", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, '1599372311', currentBlockTime - 10000000, currentBlockTime - 1);
        await timeLock.executeTransaction(lock.address, 0, 'setReleaseBatch(address[],uint256[])',
            web3.eth.abi.encodeParameters(['address[]', 'uint256[]'], [[accounts[1]], [toWei(100000)]]), 0);
        await oleToken.transfer(lock.address, toWei(100000));
        await assertThrows(lock.release({from: accounts[1]}), 'time expired');
    });

    it("Claim address is non beneficiary: ", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, '1599372311', currentBlockTime, currentBlockTime + 10000000);
        await timeLock.executeTransaction(lock.address, 0, 'setReleaseBatch(address[],uint256[])',
            web3.eth.abi.encodeParameters(['address[]', 'uint256[]'], [[accounts[1]], [toWei(100000)]]), 0);
        await oleToken.transfer(lock.address, toWei(100000));
        await assertThrows(lock.release({from: accounts[2]}), 'beneficiary does not exist');
    });

    it("Claim many times, is the amount correct each time: ", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, currentBlockTime - 100000, currentBlockTime + 100000, currentBlockTime + 200000);
        await timeLock.executeTransaction(lock.address, 0, 'setReleaseBatch(address[],uint256[])',
            web3.eth.abi.encodeParameters(['address[]', 'uint256[]'], [[accounts[1]], [toWei(100000)]]), 0);
        await oleToken.transfer(lock.address, toWei(100000));
        await lock.release({from: accounts[1]});
        assert.equal(50000, (await oleToken.balanceOf(accounts[1])).div(toBN(1e18)));

        m.log("Wait for 50000 seconds ....");
        let takeSnapshot = await timeMachine.takeSnapshot();
        let shotId = takeSnapshot['result'];
        await timeMachine.advanceTime(50000);
        await lock.release({from: accounts[1]});
        assert.equal(75000, (await oleToken.balanceOf(accounts[1])).div(toBN(1e18)));

        m.log("Wait for 50000 seconds again....");
        await timeMachine.advanceTime(50000);
        await lock.release({from: accounts[1]});
        assert.equal(toBN(100000).mul(toBN(1e18)).toString(), (await oleToken.balanceOf(accounts[1])).toString());
        // check lastUpdateTime
        let accountReleaseVar = await lock.releaseVars(accounts[1]);
        assert.equal(currentBlockTime + 100000, accountReleaseVar[1]);
        await timeMachine.revertToSnapshot(shotId);
    });

    it("If the claim is completed, is it wrong to claim again: ", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, '1599372311', currentBlockTime - 1, currentBlockTime + 30000);
        await timeLock.executeTransaction(lock.address, 0, 'setReleaseBatch(address[],uint256[])',
            web3.eth.abi.encodeParameters(['address[]', 'uint256[]'], [[accounts[1]], [toWei(100000)]]), 0);
        await oleToken.transfer(lock.address, toWei(100000));
        await lock.release({from: accounts[1]});
        assert.equal(toWei(100000).toString(), (await oleToken.balanceOf(accounts[1])).toString());
        await assertThrows(lock.release({from: accounts[1]}), 'no releasable amount');
    });

    it("Two accounts, two addresses, partial claim: ", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, '1599372311', currentBlockTime, currentBlockTime + 60000);
        await timeLock.executeTransaction(lock.address, 0, 'setReleaseBatch(address[],uint256[])',
            web3.eth.abi.encodeParameters(['address[]', 'uint256[]'], [[accounts[1], accounts[2]], [toWei(100000), toWei(100000)]]), 0);
        await oleToken.transfer(lock.address, toWei(100000));
        await lock.release({from: accounts[1]});
        await oleToken.transfer(lock.address, toWei(100000));
        await lock.release({from: accounts[2]})

        assert.equal(toWei(100000).toString(), (await oleToken.balanceOf(accounts[1])).toString());
        assert.equal(toWei(100000).toString(), (await oleToken.balanceOf(accounts[2])).toString());
    });

    it("Withdraw not by timeLock", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, '1599372311', currentBlockTime, currentBlockTime + 10000000);
        await oleToken.transfer(lock.address, toWei(100000));
        await assertThrows(lock.withdraw(accounts[1], {from: accounts[1]}), 'caller must be admin');
    });

    it("Set release not by timeLock", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, '1599372311', currentBlockTime, currentBlockTime + 10000000);
        await oleToken.transfer(lock.address, toWei(100000));
        await assertThrows(lock.setReleaseBatch([accounts[1]], [toWei(100000)], {from: accounts[3]}), 'caller must be admin');
    });

    it("Withdraw by timeLock", async () => {
        let lock = await RetroactiveAirdropLock.new(oleToken.address, timeLock.address, '1599372311', currentBlockTime, currentBlockTime + 10000000);
        await oleToken.transfer(lock.address, toWei(100000));
        let beforeWithdraw = await oleToken.balanceOf(accounts[1]);
        await timeLock.executeTransaction(lock.address, 0, 'withdraw(address)', web3.eth.abi.encodeParameters(['address'], [accounts[1]]), 0);
        let afterWithdraw = await oleToken.balanceOf(accounts[1]);
        assert.equal(toBN(100000).mul(toBN(1e18)), afterWithdraw - beforeWithdraw);
    });
})


