const {advanceMultipleBlocks, advanceMultipleBlocksAndTime, advanceBlockAndSetTime} = require("./utils/EtheUtil");
const {toWei, createXOLE} = require("./utils/OpenLevUtil");

const OLEToken = artifacts.require("OLEToken");
const Timelock = artifacts.require("Timelock");
const GovernorAlpha = artifacts.require("GovernorAlpha");
const MockTLAdmin = artifacts.require("MockTLAdmin");

const m = require('mocha-logger');

const timeMachine = require('ganache-time-traveler');

contract("GovernorAlphaTest", async accounts => {
    let xole;
    let ole;
    let gov;
    let tlAdmin;
    let admin = accounts[0];
    let againsAccount = accounts[2];
    let proposeAccount = accounts[3];
    let timeloc;
    let DAY = 86400;
    let WEEK = 4 * 7 * DAY;
    beforeEach(async () => {
        ole = await OLEToken.new(admin, 'OLE', 'OLE');
        timelock = await Timelock.new(admin, 180 + '');
        tlAdmin = await MockTLAdmin.new(timelock.address);

        xole = await createXOLE(ole.address, admin, admin, "0x0000000000000000000000000000000000000000");

        gov = await GovernorAlpha.new(timelock.address, xole.address, admin);
        await timelock.setPendingAdmin(gov.address, {from: admin});
        await gov.__acceptAdmin({from: admin});
        await gov.__abdicate({from: admin});

        assert.equal(await gov.guardian(), "0x0000000000000000000000000000000000000000");
        assert.equal(await timelock.admin(), gov.address);
        assert.equal(await tlAdmin.admin(), timelock.address);
    });


    it('not enough votes to initiate a proposal', async () => {
        try {
            await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount})
            assert.equal("message", 'TokenTimeLock: not time to unlock');
        } catch (error) {
            assert.include(error.message, 'GovernorAlpha::propose: proposer votes below proposal threshold');
        }
    });


    it('Repeat vote', async () => {

        await ole.mint(proposeAccount, toWei(100000));

        await ole.approve(xole.address, toWei(100000), {from: proposeAccount});
        let lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(100000), lastbk.timestamp + WEEK, {from: proposeAccount});
        let vote = await xole.balanceOfAt(proposeAccount, await web3.eth.getBlockNumber());
        m.log("vote=", vote.toString());
        await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);

        await gov.castVote(1, true, {from: proposeAccount});

    try {
      await gov.castVote(1, false, {from: proposeAccount});
      assert.equal("message", 'voter success');
    } catch (error) {
      assert.include(error.message, 'Voter already voted');
    }

    });


    it('Not enough votes to join the queue', async () => {
        await ole.mint(proposeAccount, toWei(100000));
        await ole.approve(xole.address, toWei(100000), {from: proposeAccount});
        let lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(100000), lastbk.timestamp + WEEK, {from: proposeAccount});
        //mint other
        await ole.mint(admin, toWei(500000));
        await ole.approve(xole.address, toWei(500000), {from: admin});
        await xole.create_lock(toWei(500000), lastbk.timestamp + WEEK, {from: admin});
        await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await gov.castVote(1, true, {from: proposeAccount});
        try {
            await gov.queue(1);
            assert.equal("message", 'add queue success');
        } catch (error) {
            assert.include(error.message, 'GovernorAlpha::queue: proposal can only be queued if it is succeeded');
        }
    });
    it('Propose to cancel', async () => {
        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));
        await advanceBlockAndSetTime(timeToMove);
        await ole.mint(proposeAccount, toWei(240000));
        await ole.approve(xole.address, toWei(240000), {from: proposeAccount});
        lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(240000), lastbk.timestamp + (DAY * 7), {from: proposeAccount});
        let vote = await xole.balanceOfAt(proposeAccount, await web3.eth.getBlockNumber());
        m.log("vote=", vote.toString());
        await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await gov.castVote(1, true, {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await advanceMultipleBlocksAndTime(6000);
        vote = await xole.balanceOfAt(proposeAccount, await web3.eth.getBlockNumber());
        m.log("vote=", vote.toString());
        await gov.cancel(1);
        assert.equal(2, (await gov.state(1)).toString());

    });
    it(' negative vote is greater than the affirmative vote', async () => {

        if (process.env.FASTMODE === 'true') {
            m.log("Skipping this test for FAST Mode");
            return;
        }

        await ole.mint(proposeAccount, toWei(100000));
        await ole.approve(xole.address, toWei(100000), {from: proposeAccount});
        let lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(100000), lastbk.timestamp + WEEK, {from: proposeAccount});
        //mint other
        await ole.mint(againsAccount, toWei(100001));
        await ole.approve(xole.address, toWei(100001), {from: againsAccount});
        await xole.create_lock(toWei(100001), lastbk.timestamp + WEEK, {from: againsAccount});
        await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await gov.castVote(1, true, {from: proposeAccount});
        await gov.castVote(1, false, {from: againsAccount});

        await advanceMultipleBlocks(17280);
        assert.equal(3, (await gov.state(1)).toString());
    });


    it('Proposal expired', async () => {

        if (process.env.FASTMODE === 'true') {
            m.log("Skipping this test for FAST Mode");
            return;
        }

        await ole.mint(proposeAccount, toWei(100000));
        await ole.approve(xole.address, toWei(100000), {from: proposeAccount});
        let lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(100000), lastbk.timestamp + WEEK, {from: proposeAccount});
        await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await gov.castVote(1, true, {from: proposeAccount});
        await advanceMultipleBlocks(17280);
        await gov.queue(1);
        await timeMachine.advanceTime(15 * 24 * 60 * 60);
        try {
            await gov.execute(1);
            assert.equal("message", 'add queue success');
        } catch (error) {
            assert.include(error.message, 'GovernorAlpha::execute: proposal can only be executed if it is queued.');
        }

    });

    it('Proposal executed succeed', async () => {

        if (process.env.FASTMODE === 'true') {
            m.log("Skipping this test for FAST Mode");
            return;
        }

        await ole.mint(proposeAccount, toWei(100000));
        await ole.approve(xole.address, toWei(100000), {from: proposeAccount});
        let lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(100000), lastbk.timestamp + WEEK, {from: proposeAccount});
        await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await gov.castVote(1, true, {from: proposeAccount});
        await advanceMultipleBlocks(17280);
        await gov.queue(1);
        await timeMachine.advanceTime(181);
        let state = await gov.state(1);
        m.log("Before execute proposal's  state ", state);
        await gov.execute(1);

    });

    it('Proposal setPending Admin succeed', async () => {

        if (process.env.FASTMODE === 'true') {
            m.log("Skipping this test for FAST Mode");
            return;
        }

        await ole.mint(proposeAccount, toWei(100000));
        await ole.approve(xole.address, toWei(100000), {from: proposeAccount});
        let lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(100000), lastbk.timestamp + WEEK, {from: proposeAccount});
        let pendingAdmin = accounts[7];
        await gov.propose([timelock.address], [0], ['setPendingAdmin(address)'], [web3.eth.abi.encodeParameters(['address'], [pendingAdmin])], 'proposal 1', {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await gov.castVote(1, true, {from: proposeAccount});
        await advanceMultipleBlocks(17280);
        await gov.queue(1);
        await timeMachine.advanceTime(181);
        await gov.execute(1);
        assert.equal(pendingAdmin, await timelock.pendingAdmin());
    });
});
