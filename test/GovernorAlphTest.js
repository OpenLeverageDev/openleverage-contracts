const {toBN, maxUint, advanceMultipleBlocks} = require("./utils/EtheUtil");
const EIP712 = require('./utils/EIP712');
const {toWei} = require("./utils/OpenLevUtil");

const LToken = artifacts.require("OLEToken");

const Timelock = artifacts.require("Timelock");


const GovernorAlpha = artifacts.require("GovernorAlpha");


const MockTLAdmin = artifacts.require("MockTLAdmin");

const m = require('mocha-logger');

const timeMachine = require('ganache-time-traveler');

contract("GovernorAlphaTest", async accounts => {

    before(async () => {

  });

    async function beforeAll(initBalanceAccount, proposalAccount, lToken, tlAdmin, timelock, vote) {

    let gov = await GovernorAlpha.new(timelock.address, lToken.address, initBalanceAccount);
    await timelock.setPendingAdmin(gov.address, {from: initBalanceAccount});
    await gov.__acceptAdmin({from: initBalanceAccount});
    await gov.__abdicate({from: initBalanceAccount});

    assert.equal(await gov.guardian(), "0x0000000000000000000000000000000000000000");
    assert.equal(await timelock.admin(), gov.address);
    assert.equal(await tlAdmin.admin(), timelock.address);

    await lToken.transfer(proposalAccount, toWei(vote), {from: initBalanceAccount});
    await lToken.delegate(proposalAccount, {from: proposalAccount});

    return gov;
  }


  it('not enough votes to initiate a proposal', async () => {
    let initBalanceAccount = accounts[3];
    let proposalAccount = accounts[0];

    let lToken = await LToken.new(initBalanceAccount, 'TEST', 'TEST');
    let timelock = await Timelock.new(initBalanceAccount, 180 + '');
    // timelock.address
    let tlAdmin = await MockTLAdmin.new(timelock.address);


    let gov = await beforeAll(initBalanceAccount, proposalAccount, lToken, tlAdmin, timelock, 10001);

    try {
      await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1')
      assert.equal("message", 'TokenTimeLock: not time to unlock');
    } catch (error) {
      assert.include(error.message, 'GovernorAlpha::propose: proposer votes below proposal threshold');
    }
    //
    // let encodeParameters1=web3.eth.abi.encodeParameters(['address', 'uint256', 'uint256', 'uint64', 'uint64'],
    //   ['0xbf28726f535f0fbd10d11c00476a67329bab73ca', '100000000000000000000000', '100000000000000000000000', '1619366400', '15552000']);
    // m.log("encodeParameters1=",encodeParameters1);
    // let encodeParameters2=web3.eth.abi.encodeParameters(['address', 'uint256', 'uint256', 'uint64', 'uint64'],
    //   ['0xbdbd1ebad3d786b3b7a6e313c48b41f5e9d7a8a0', '100000000000000000000000', '100000000000000000000000', '1619366400', '15552000']);
    // m.log("encodeParameters2=",encodeParameters2);
  });


  it('Repeat vote', async () => {

    let initBalanceAccount = accounts[3];
    let proposalAccount = accounts[0];

    let lToken = await LToken.new(initBalanceAccount, 'TEST', 'TEST');
    let timelock = await Timelock.new(initBalanceAccount, 180 + '');
    let tlAdmin = await MockTLAdmin.new(timelock.address);


    let gov = await beforeAll(initBalanceAccount, proposalAccount, lToken, tlAdmin, timelock, 100001);

    await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1');

    await lToken.transfer(accounts[1], toWei(10));


    await gov.castVote(1, true, {from: proposalAccount});

    try {
      await gov.castVote(1, false, {from: proposalAccount});
      assert.equal("message", 'voter success');
    } catch (error) {
      assert.include(error.message, 'GovernorAlpha::_castVote: voter already voted.');
    }

  });


  it('Not enough votes to join the queue', async () => {

    let initBalanceAccount = accounts[3];
    let proposalAccount = accounts[0];

    let lToken = await LToken.new(initBalanceAccount, 'TEST', 'TEST');
    let timelock = await Timelock.new(initBalanceAccount, 180 + '');
    let tlAdmin = await MockTLAdmin.new(timelock.address);


    let gov = await beforeAll(initBalanceAccount, proposalAccount, lToken, tlAdmin, timelock, 100001);

    await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1');

    await lToken.transfer(accounts[1], toWei(10));


    await gov.castVote(1, true, {from: proposalAccount});


    try {
      await gov.queue(1);
      assert.equal("message", 'add queue success');
    } catch (error) {
      assert.include(error.message, 'GovernorAlpha::queue: proposal can only be queued if it is succeeded');
    }
  });


  it(' proposal is not over. can\'t join the queue', async () => {

    let initBalanceAccount = accounts[3];
    let proposalAccount = accounts[0];

    let lToken = await LToken.new(initBalanceAccount, 'TEST', 'TEST');
    let timelock = await Timelock.new(initBalanceAccount, 180 + '');
    let tlAdmin = await MockTLAdmin.new(timelock.address);


    let gov = await beforeAll(initBalanceAccount, proposalAccount, lToken, tlAdmin, timelock, 410001);


    await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1');
    await lToken.transfer(accounts[1], toWei(10));

    await gov.castVote(1, true, {from: proposalAccount});

    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));

    try {
      await gov.queue(1);
      assert.equal("message", 'add queue success');
    } catch (error) {

      assert.include(error.message, 'GovernorAlpha::queue: proposal can only be queued if it is succeeded');
    }

  });


  it(' negative vote is greater than the affirmative vote', async () => {

    let proposalAccount_two = accounts[1];
    let initBalanceAccount = accounts[3];
    let proposalAccount = accounts[0];

    let lToken = await LToken.new(initBalanceAccount, 'TEST', 'TEST');
    let timelock = await Timelock.new(initBalanceAccount, 180 + '');
    let tlAdmin = await MockTLAdmin.new(timelock.address);

    await lToken.transfer(proposalAccount_two, toWei(200000), {from: initBalanceAccount});
    await lToken.delegate(proposalAccount_two, {from: proposalAccount_two});

    let gov = await beforeAll(initBalanceAccount, proposalAccount, lToken, tlAdmin, timelock, 100001);

    await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1');


    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));


    await gov.castVote(1, true, {from: proposalAccount});
    await gov.castVote(1, false, {from: proposalAccount_two});

    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));

    await advanceMultipleBlocks(17280);

    assert.equal(3, (await gov.state(1)).toString());
  });

  it('Propose to cancel', async () => {
    let initBalanceAccount = accounts[3];
    let proposalAccount = accounts[0];

    let lToken = await LToken.new(initBalanceAccount, 'TEST', 'TEST');
    let timelock = await Timelock.new(initBalanceAccount, 180 + '');
    let tlAdmin = await MockTLAdmin.new(timelock.address);


    let gov = await beforeAll(initBalanceAccount, proposalAccount, lToken, tlAdmin, timelock, 100001);


    await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1');
    await lToken.transfer(accounts[1], toWei(10));

    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));

    await gov.cancel(1);
    assert.equal(2, (await gov.state(1)).toString());

  });

  it('Proposal expired', async () => {

    let initBalanceAccount = accounts[3];
    let proposalAccount = accounts[0];

    let lToken = await LToken.new(initBalanceAccount, 'TEST', 'TEST');
    let timelock = await Timelock.new(initBalanceAccount, 180 + '');
    let tlAdmin = await MockTLAdmin.new(timelock.address);


    let gov = await beforeAll(initBalanceAccount, proposalAccount, lToken, tlAdmin, timelock, 410001);


    await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1');
    await lToken.transfer(accounts[1], toWei(10));

    await gov.castVote(1, true, {from: proposalAccount});

    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));
    await lToken.transfer(accounts[1], toWei(10));

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

    let initBalanceAccount = accounts[3];
    let proposalAccount = accounts[0];

    let lToken = await LToken.new(initBalanceAccount, 'TEST', 'TEST');
    let timelock = await Timelock.new(initBalanceAccount, 180 + '');
    let tlAdmin = await MockTLAdmin.new(timelock.address);


    let gov = await beforeAll(initBalanceAccount, proposalAccount, lToken, tlAdmin, timelock, 410001);


    await gov.propose([tlAdmin.address], [0], ['changeDecimal(uint256)'], [web3.eth.abi.encodeParameters(['uint256'], [10])], 'proposal 1');

    await lToken.transfer(accounts[1], toWei(10));

    await gov.castVote(1, true, {from: proposalAccount});

    await advanceMultipleBlocks(17280);

    let state = await gov.state(1);

    m.log("Before queue proposal's  state ", state);

    await gov.queue(1);

    await timeMachine.advanceTime(181);

    state = await gov.state(1);

    m.log("Before execute proposal's  state ", state);
    await gov.execute(1);

  });
});
