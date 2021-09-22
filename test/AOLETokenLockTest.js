const {toBN, maxUint} = require("./utils/EtheUtil");

const {toWei, lastBlockTime} = require("./utils/OpenLevUtil");
const TimeLock = artifacts.require("OLETokenLock");
const OLEToken = artifacts.require("OLEToken");


const m = require('mocha-logger');

const timeMachine = require('ganache-time-traveler');

contract("OLETokenLock", async accounts => {
  before(async () => {

  });

  it("Take out all at one time, the time has expired: ", async () => {
    let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');
    let timeLock = await TimeLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [new Date().getTime().toString().substr(0, 10)]);
    await oleToken.transfer(timeLock.address, toWei(100000));
    await timeLock.release(accounts[1]);
    assert.equal((await timeLock.releaseVars(accounts[1])).released, toBN(100000).mul(toBN(1e18)).toString());
    // Comparison of results
    assert.equal((await timeLock.releaseVars(accounts[1])).released, (await oleToken.balanceOf(accounts[1])).toString());

  });

  it("The withdrawal address is non beneficiary: ", async () => {
    let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');
    let timeLock = await TimeLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [new Date().getTime().toString().substr(0, 10)]);
    await oleToken.transfer(timeLock.address, toWei(100000));
    try {
      await timeLock.release(accounts[2]);
      assert.equal("message", 'not time to unlock');
    } catch (error) {
      assert.include(error.message, 'beneficiary does not exist');
    }

  });

  it("Cash withdrawal before start time:", async () => {
    let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');
    let timeLock = await TimeLock.new(oleToken.address, [accounts[1]], [toWei(100000)], [(new Date().getTime() + 30000).toString().substr(0, 10)], [(new Date().getTime() + 60000).toString().substr(0, 10)]);
    await oleToken.transfer(timeLock.address, toWei(100000));
    try {
      await timeLock.release(accounts[1]);
      assert.equal("message", 'not time to unlock');
    } catch (error) {
      assert.include(error.message, 'not time to unlock');
    }

  });


  it("Withdraw twice, is the amount correct each time: ", async () => {
    let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');
    let timeLock = await TimeLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [(parseInt(await lastBlockTime()) + 30000) + ""]);
    await oleToken.transfer(timeLock.address, toWei(100000));
    await timeLock.release(accounts[1]);
    assert.equal((await timeLock.releaseVars(accounts[1])).released, (await oleToken.balanceOf(accounts[1])).toString());

    m.log("Wait for 10 seconds ....");
    let takeSnapshot = await timeMachine.takeSnapshot();
    let shotId = takeSnapshot['result'];
    await timeMachine.advanceTime(10000);
    await timeLock.release(accounts[1]);

    // Comparison of results
    assert.equal((await timeLock.releaseVars(accounts[1])).released, (await oleToken.balanceOf(accounts[1])).toString());
    await timeMachine.revertToSnapshot(shotId);

  });


  it("At Endtime, is the one-time withdrawal result correct: ", async () => {
    let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');
    let timeLock = await TimeLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [new Date().getTime().toString().substr(0, 10)]);
    await oleToken.transfer(timeLock.address, toWei(100000));
    await timeLock.release(accounts[1]);
    assert.equal((await timeLock.releaseVars(accounts[1])).released, toBN(100000).mul(toBN(1e18)).toString());
    // Comparison of results
    assert.equal((await timeLock.releaseVars(accounts[1])).released, (await oleToken.balanceOf(accounts[1])).toString());

  });


  it("After one withdrawal, is the result correct at end time", async () => {
    let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');

    let timeLock = await TimeLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [(parseInt(await lastBlockTime()) + 30000) + ""]);
    await oleToken.transfer(timeLock.address, toWei(100000));
    await timeLock.release(accounts[1]);
    // comparison of results
    assert.equal((await timeLock.releaseVars(accounts[1])).released, (await oleToken.balanceOf(accounts[1])).toString());

    m.log("Wait for 10 seconds ....");
    let takeSnapshot = await timeMachine.takeSnapshot();
    let shotId = takeSnapshot['result'];
    await timeMachine.advanceTime(30000);
    await timeLock.release(accounts[1]);

    assert.equal((await timeLock.releaseVars(accounts[1])).released, toBN(100000).mul(toBN(1e18)).toString());

    //comparison of results
    assert.equal((await timeLock.releaseVars(accounts[1])).released, (await oleToken.balanceOf(accounts[1])).toString());
    await timeMachine.revertToSnapshot(shotId);


  });


  it("If the withdrawal is completed, is it wrong to withdraw again: ", async () => {
    let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');
    // 2020-09-06 14:05:11  2021-01-01 14:05:11
    let timeLock = await TimeLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [new Date().getTime().toString().substr(0, 10)]);
    await oleToken.transfer(timeLock.address, toWei(100000));
    await timeLock.release(accounts[1]);
    assert.equal((await timeLock.releaseVars(accounts[1])).released, toBN(100000).mul(toBN(1e18)).toString());

    // comparison of results
    assert.equal((await timeLock.releaseVars(accounts[1])).released, (await oleToken.balanceOf(accounts[1])).toString());


    try {
      await timeLock.release(accounts[1]);
      assert.equal("message", 'not time to unlock');
    } catch (error) {
      assert.include(error.message, 'no amount available');
    }
  });


  it("Two accounts, two addresses, partial withdrawal: ", async () => {
    let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');
    // 2020-09-06 14:05:11  2021-01-01 14:05:11
    let timeLock = await TimeLock.new(oleToken.address, [accounts[1], accounts[3]], [toWei(100000), toWei(100000)],
      ['1599372311', '1599372311'], [(new Date().getTime() + 20000).toString().substr(0, 10), (new Date().getTime() + 20000).toString().substr(0, 10)]);

    await oleToken.transfer(timeLock.address, toWei(100000));

    await timeLock.release(accounts[1]);

    await oleToken.transfer(timeLock.address, toWei(100000));
    await timeLock.release(accounts[3])

    // comparison of results
    assert.equal((await timeLock.releaseVars(accounts[1])).released, (await oleToken.balanceOf(accounts[1])).toString());

    assert.equal((await timeLock.releaseVars(accounts[3])).released, (await oleToken.balanceOf(accounts[3])).toString());


  });


  it("Two accounts, two addresses, all withdrawals: ", async () => {
    let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');
    let timeLock = await TimeLock.new(oleToken.address, [accounts[1], accounts[3]], [toWei(100000), toWei(100000)], ['1599372311', '1599372311'],
      [(new Date().getTime()).toString().substr(0, 10), (new Date().getTime()).toString().substr(0, 10)]);
    await oleToken.transfer(timeLock.address, toWei(100000));
    await timeLock.release(accounts[1]);

    await oleToken.transfer(timeLock.address, toWei(100000));
    await timeLock.release(accounts[3]);

    assert.equal((await timeLock.releaseVars(accounts[1])).released, toBN(100000).mul(toBN(1e18)).toString());
    assert.equal((await timeLock.releaseVars(accounts[3])).released, toBN(100000).mul(toBN(1e18)).toString());

    assert.equal((await timeLock.releaseVars(accounts[1])).released, (await oleToken.balanceOf(accounts[1])).toString());
    assert.equal((await timeLock.releaseVars(accounts[3])).released, (await oleToken.balanceOf(accounts[3])).toString());

  });


  // it("delegate test: ", async () => {
  //   let oleToken = await OLEToken.new(accounts[0], 'TEST', 'TEST');
  //   let timeLock = await TimeLock.new(oleToken.address, [accounts[1]], [toWei(100000)], ['1599372311'], [new Date().getTime().toString().substr(0, 10)], accounts[2]);
  //   let votesBefore = await oleToken.getCurrentVotes(accounts[2]);
  //   assert.equal("0", votesBefore);
  //   await oleToken.transfer(timeLock.address, toWei(100000));
  //   let votesAfter = await oleToken.getCurrentVotes(accounts[2]);
  //   assert.equal(toWei(100000).toString(), votesAfter.toString());
  //   await timeLock.release(accounts[1]);
  //   let votesAfterRelease = await oleToken.getCurrentVotes(accounts[2]);
  //   assert.equal("0", votesAfterRelease);
  //   await oleToken.delegate(accounts[1], {from: accounts[1]});
  //   let votesAfterReleaseAcc1 = await oleToken.getCurrentVotes(accounts[1]);
  //
  //   assert.equal(toWei(100000).toString(), votesAfterReleaseAcc1.toString());
  //
  // });
})


