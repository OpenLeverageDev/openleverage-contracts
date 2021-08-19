const xOLE = artifacts.require("xOLE");
const OLEToken = artifacts.require("OLEToken");
const {assertPrint, createDexAgg, createUniswapV2Factory} = require("./utils/OpenLevUtil");
const m = require('mocha-logger');
const timeMachine = require('ganache-time-traveler');
const {advanceMultipleBlocksAndTime, toBN} = require("./utils/EtheUtil");

contract("xOLE", async accounts => {

  let H = 3600;
  let DAY = 86400;
  let WEEK = 7 * DAY;
  let MAXTIME = 126144000;
  let TOL = 120 / WEEK;

  let bob = accounts[0];
  let alice = accounts[1];
  let admin = accounts[2];
  let dev = accounts[3];

  let uniswapFactory;

  it("Test voting powers", async () => {

    let decimals = "000000000000000000";
    let _1000 = "1000000000000000000000"; // 10000
    let _500 = "500000000000000000000"; // 10000

    let ole = await OLEToken.new(admin, "Open Leverage Token", "OLE");
    await ole.mint(bob, _1000);
    await ole.mint(alice, _1000);

    let xole = await xOLE.new(admin);

    uniswapFactory = await createUniswapV2Factory(admin);
    let dexAgg = await createDexAgg(uniswapFactory.address);
    await xole.initialize(ole.address, dexAgg.address, 5000, dev, {from: admin});

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


    // await ole.transfer(bob, amount, {"from": alice});
    let stages = {};

    await ole.approve(xole.address, _1000 + "0", {"from": alice});
    await ole.approve(xole.address, _1000 + "0", {"from": bob});

    assert.equal("0", await xole.totalSupply(0));
    assert.equal("0", await xole.balanceOf(alice, 0));
    assert.equal("0", await xole.balanceOf(bob, 0));

    let lastbk = await web3.eth.getBlock('latest');
    stages["before_deposits"] = {bknum: lastbk.number, bltime: lastbk.timestamp};

    m.log("epoch", await xole.epoch());
    let end = + lastbk.timestamp + WEEK;
    m.log("Alice creates lock with 1000 till time " + end);
    await xole.create_lock(_1000, lastbk.timestamp + WEEK, {"from": alice});
    lastbk = await web3.eth.getBlock('latest');
    stages["alice_deposit"] = {bknum: lastbk.number, bltime: lastbk.timestamp};

    m.log("epoch", await xole.epoch());

    m.log("xOLE Total supply", await xole.totalSupply(0));
    m.log("Alice's balance of xOLE", await xole.balanceOf(alice, 0));
    m.log("Bob's balance of xOLE", await xole.balanceOf(bob, 0));

    await advanceMultipleBlocksAndTime(1000);

    m.log("xOLE Total supply", await xole.totalSupply(0));
    m.log("Alice's balance of xOLE", await xole.balanceOf(alice, 0));
    m.log("Bob's balance of xOLE", await xole.balanceOf(bob, 0));

    lastbk = await web3.eth.getBlock('latest');
    end = + lastbk.timestamp + WEEK * 2;
    m.log("Bob creates lock till time " + end);
    await xole.create_lock(_1000, end, {"from": bob});
    lastbk = await web3.eth.getBlock('latest');
    stages["bob_deposit"] = {bknum: lastbk.number, bltime: lastbk.timestamp};
    m.log("epoch", await xole.epoch());

    m.log("xOLE Total supply", await xole.totalSupply(0));
    m.log("Alice's balance of xOLE", await xole.balanceOf(alice, 0));
    m.log("Bob's balance of xOLE", await xole.balanceOf(bob, 0));

    await advanceMultipleBlocksAndTime(2000);

    m.log("xOLE Total supply", await xole.totalSupply(0));
    m.log("Alice's balance of xOLE", await xole.balanceOf(alice, 0));
    m.log("Bob's balance of xOLE", await xole.balanceOf(bob, 0));

    await advanceMultipleBlocksAndTime(39000);
    lastbk = await web3.eth.getBlock('latest');
    stages["check_point"] = {bknum: lastbk.number, bltime: lastbk.timestamp};
    //
    // m.log("xOLE Total supply", await xole.totalSupply(0));
    // m.log("Alice's balance of xOLE", await xole.balanceOf(alice, 0));
    // m.log("Bob's balance of xOLE", await xole.balanceOf(bob, 0));
    //
    // await advanceMultipleBlocksAndTime(3000);
    //
    m.log("xOLE Total supply", await xole.totalSupply(0));
    m.log("Alice's balance of xOLE", await xole.balanceOf(alice, 0));
    m.log("Bob's balance of xOLE", await xole.balanceOf(bob, 0));
    //
    m.log("Alice withdraw");
    await xole.withdraw({from: alice});

    m.log("xOLE Total supply", await xole.totalSupply(0));
    m.log("Alice's balance of xOLE", await xole.balanceOf(alice, 0));
    m.log("Bob's balance of xOLE", await xole.balanceOf(bob, 0));

    m.log("Now check for historical balance for stage [alice_deposit]");
    m.log("xOLE Total supply", await xole.totalSupplyAt(stages.alice_deposit.bknum));
    m.log("Alice's balance of xOLE", await xole.balanceOfAt(alice, stages.alice_deposit.bknum));
    m.log("Bob's balance of xOLE", await xole.balanceOfAt(bob, stages.alice_deposit.bknum));

    m.log("Now check for historical balance for stage [bob_deposit]");
    m.log("xOLE Total supply", await xole.totalSupplyAt(stages.bob_deposit.bknum));
    m.log("Alice's balance of xOLE", await xole.balanceOfAt(alice, stages.bob_deposit.bknum));
    m.log("Bob's balance of xOLE", await xole.balanceOfAt(bob, stages.bob_deposit.bknum));

    //
    // assertPrint("xOLE Total supply", await xole.totalSupply(0), Math.floor(_1000 / MAXTIME) * (WEEK - 2 * H));
    // assert.equal("Alice's balance of xOLE", await xole.balanceOf(alice, 0), Math.floor(_1000 / MAXTIME) * (WEEK - 2 * H));
    // assert.equal("Bob's balance of xOLE", await xole.balanceOf(bob, 0), 0)

  })

})
