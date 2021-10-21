const {
    advanceMultipleBlocks,
    advanceMultipleBlocksAndTime,
    advanceBlockAndSetTime,
    unlockedAccount
} = require("./utils/EtheUtil");
const {toWei, createXOLE} = require("./utils/OpenLevUtil");

const OLEToken = artifacts.require("OLEToken");
const Timelock = artifacts.require("Timelock");
const GovernorAlpha = artifacts.require("GovernorAlpha");
const MockTLAdmin = artifacts.require("MockTLAdmin");

const m = require('mocha-logger');

const timeMachine = require('ganache-time-traveler');
const EIP712 = require("./utils/EIP712");

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
        ole = await OLEToken.new(admin, admin, 'OLE', 'OLE');
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
        let lastBlockNum = await web3.eth.getBlockNumber();
        await advanceMultipleBlocksAndTime(1);
        let vote = await xole.getPriorVotes(proposeAccount, lastBlockNum);
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

    it.skip('delegate vote to other', async () => {
        await ole.mint(proposeAccount, toWei(300));
        let delegateAcc = accounts[5];
        await ole.mint(delegateAcc, toWei(200000));

        await ole.approve(xole.address, toWei(300), {from: proposeAccount});
        await ole.approve(xole.address, toWei(200000), {from: delegateAcc});

        let lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(100), lastbk.timestamp + WEEK, {from: proposeAccount});
        await xole.create_lock(toWei(100000), lastbk.timestamp + WEEK, {from: delegateAcc});
        await xole.delegate(proposeAccount, {from: delegateAcc});

        let lastBlockNum = await web3.eth.getBlockNumber();
        await advanceMultipleBlocksAndTime(1);
        let vote = await xole.getPriorVotes(proposeAccount, lastBlockNum);
        assert.equal("104264160000000000000000", vote.toString());
        assert.equal("104264160000000000000000", (await xole.totalSupplyAt(lastBlockNum)).toString());
        await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount});
        lastBlockNum = await web3.eth.getBlockNumber();
        // delegate not change vote
        m.log("delegateAcc.delegatee before", await xole.delegates(delegateAcc));
        await xole.delegate(delegateAcc, {from: delegateAcc});
        m.log("delegateAcc.delegatee after", await xole.delegates(delegateAcc));
        m.log("votes before ", (await xole.getCurrentVotes(proposeAccount)).toString());
        vote = await xole.getPriorVotes(proposeAccount, lastBlockNum);
        assert.equal("104264160000000000000000", vote.toString());
        assert.equal("104264160000000000000000", (await xole.totalSupplyAt(lastBlockNum)).toString());
        //delegate by sign
        const Domain = {
            name: 'xOLE',
            chainId: 1,
            verifyingContract: xole.address
        };
        const Types = {
            Delegation: [
                {name: 'delegatee', type: 'address'},
                {name: 'nonce', type: 'uint256'},
                {name: 'expiry', type: 'uint256'}
            ]
        };
        const {v, r, s} = EIP712.sign(Domain, 'Delegation', {
            delegatee: proposeAccount,
            nonce: 0,
            expiry: 10e9
        }, Types, "0x4fcd6a2d18a6731703461436c8d6b0e0825f646a78e4fead34e0e4df1e3c1892");
        await xole.delegateBySig(proposeAccount, 0, 10e9, v, r, s);
        assert.equal("104264160000000000000000", (await xole.getCurrentVotes(proposeAccount)).toString());
        assert.equal("0", (await xole.getCurrentVotes(delegateAcc)).toString());
        // delegatorAcc lock more
        await xole.increase_amount(toWei(100), {from: delegateAcc});
        assert.equal("104368320000000000000000", (await xole.getCurrentVotes(proposeAccount)).toString());
        assert.equal("0", (await xole.getCurrentVotes(delegateAcc)).toString());
        // delegatorAcc withraw all
        await advanceBlockAndSetTime(lastbk.timestamp + 2 * WEEK);
        await xole.withdraw({from: delegateAcc});
        assert.equal("104160000000000000000", (await xole.getCurrentVotes(proposeAccount)).toString());
        assert.equal("0", (await xole.getCurrentVotes(delegateAcc)).toString());
        // proposeAccount withraw all
        await xole.withdraw({from: proposeAccount});
        assert.equal("0", (await xole.getCurrentVotes(proposeAccount)).toString());
        assert.equal("0", (await xole.getCurrentVotes(delegateAcc)).toString());
    });

    it.skip('Cast Vote BySig', async () => {
        await ole.mint(proposeAccount, toWei(2000));
        let delegateAcc = accounts[5];
        await ole.mint(delegateAcc, toWei(100000));

        await ole.approve(xole.address, toWei(2000), {from: proposeAccount});
        await ole.approve(xole.address, toWei(100000), {from: delegateAcc});

        let lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(2000), lastbk.timestamp + WEEK, {from: proposeAccount});
        await xole.create_lock(toWei(100000), lastbk.timestamp + WEEK, {from: delegateAcc});
        // await xole.delegate(proposeAccount, {from: delegateAcc});

        let lastBlockNum = await web3.eth.getBlockNumber();
        await advanceMultipleBlocksAndTime(1);
        let vote = await xole.getPriorVotes(proposeAccount, lastBlockNum);
        assert.equal("2083200000000000000000", vote.toString());
        assert.equal("106243200000000000000000", (await xole.totalSupplyAt(lastBlockNum)).toString());
        await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await gov.castVote(1, true, {from: proposeAccount});
        //0xB8b55BDBC81b62f49ae134205a1A3F16c82B0BaE
        const Domain = {
            name: 'Open Leverage Governor Alpha',
            chainId: 1,
            verifyingContract: gov.address
        };
        const Types = {
            Ballot: [
                {name: 'proposalId', type: 'uint256'},
                {name: 'support', type: 'bool'}
            ]
        };
        const {v, r, s} = EIP712.sign(Domain, 'Ballot', {
            proposalId: 1,
            support: true
        }, Types, "0x4fcd6a2d18a6731703461436c8d6b0e0825f646a78e4fead34e0e4df1e3c1892");
        await gov.castVoteBySig(1, true, v, r, s);
        assert.equal((await xole.totalSupplyAt(lastBlockNum)).toString(), (await gov.proposals(1)).forVotes);
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
        let lastBlockNum = await web3.eth.getBlockNumber();
        await advanceMultipleBlocksAndTime(1);
        let vote = await xole.getPriorVotes(proposeAccount, lastBlockNum);
        m.log("vote=", vote.toString());
        await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1', {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await gov.castVote(1, true, {from: proposeAccount});
        //delay 1 block
        await ole.transfer(accounts[1], 0);
        await gov.cancel(1, {from: proposeAccount});
        assert.equal(2, (await gov.state(1)).toString());

    });
    it('Negative vote is greater than the affirmative vote', async () => {

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
