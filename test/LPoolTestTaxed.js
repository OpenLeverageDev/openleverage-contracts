const utils = require("./utils/OpenLevUtil");
const {toWei, assertPrint, assertThrows} = require("./utils/OpenLevUtil");

const {toBN, maxUint, advanceMultipleBlocks} = require("./utils/EtheUtil");
const m = require('mocha-logger');
const timeMachine = require('ganache-time-traveler');
const LPool = artifacts.require('LPool');
const LPoolDelegator = artifacts.require('LPoolDelegator');
const LPoolDepositor = artifacts.require('LPoolDepositor');

contract("LPoolDelegator", async accounts => {

    // roles
    let admin = accounts[0];

    before(async () => {
        // runs once before the first test in this block
    });

    it("Allowed Repay all more than 0%-5% test", async () => {
        let weth = await utils.createWETH();
        let controller = await utils.createController(accounts[0]);
        let createPoolResult = await utils.createPool(accounts[0], controller, admin, weth);
        let erc20Pool = createPoolResult.pool;
        let poolDepositor = await LPoolDepositor.new();
        let mintAmount = toWei(1);
        //deposit 1
        let ethBegin = await web3.eth.getBalance(admin);
        m.log("ethBegin=", ethBegin);
        let tx = await poolDepositor.depositNative(erc20Pool.address, {value: mintAmount});
        m.log("DepositEth Gas Used: ", tx.receipt.gasUsed);
        assert.equal((await erc20Pool.getCash()).toString(), mintAmount.toString());
        assert.equal((await erc20Pool.totalSupply()).toString(), mintAmount.toString());
        //redeem
        let ethBefore = await web3.eth.getBalance(admin);
        await erc20Pool.redeemUnderlying(mintAmount);
        assert.equal(await erc20Pool.getCash(), 0);
        assert.equal(await erc20Pool.totalSupply(), 0);
        let ethAfter = await web3.eth.getBalance(admin);
        m.log("ethBefore=", ethBefore);
        m.log("ethAfter=", ethAfter);
        assert.equal(toBN(ethAfter).gt(toBN(ethBefore)), true);
    })

})
