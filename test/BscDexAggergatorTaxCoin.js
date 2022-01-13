const utils = require("./utils/OpenLevUtil");
const {
    last8,
    checkAmount,
    printBlockNum,
    Uni2DexData,
    assertPrint, assertThrows,
} = require("./utils/OpenLevUtil");
const TestToken = artifacts.require("MockERC20");
const m = require('mocha-logger');
const {advanceMultipleBlocksAndTime, toBN} = require("./utils/EtheUtil");
const { result } = require("lodash");

contract("DexAggregator BSC", async accounts => {
    // components
    let openLev;
    let pancakeFactory;
    let pair;
    let dexAgg;
    // roles
    let admin = accounts[0];

    let token0;
    let token1;

    beforeEach(async () => {
        token0 = await TestToken.new('TokenA', 'TKA', 1000);
        token1 = await TestToken.new('TokenB', 'TKB', 500);
        dexData = utils.PancakeDexData + "0001F40003E80001F40003E8"
        pancakeFactory = await utils.createUniswapV2Factory();
        pair = await utils.createUniswapV2Pool(pancakeFactory, token0, token1);
        dexAgg = await utils.createBscDexAgg(pancakeFactory.address, "0x0000000000000000000000000000000000000000", accounts[0]);
        await dexAgg.setOpenLev(admin);
        openLev = await dexAgg.openLev();

        m.log("Reset BscDexAggregator: ", last8(dexAgg.address));
    });

    it("calulate Buy Amount", async () => {
        let swapIn = 1;
        r = await dexAgg.calBuyAmount(token1.address, token0.address, utils.toWei(swapIn), dexData);
        assert.equal(r.toString(), "997490050036750883", "sell exact amount");
    })

    it("calulate Sell Amount", async () => {
        let swapOut = 1;
        r = await dexAgg.calSellAmount(token1.address, token0.address, utils.toWei(swapOut), dexData);
        assert.equal(r.toString(), "1004021826571151290", "buy exact amount");
    })

    it("sell exact amount", async () => {
        let swapIn = 1;
        let swapper = accounts[1];
        let minOut = "997490050036750883";

        await utils.mint(token0, swapper, swapIn);
        await token0.approve(dexAgg.address, utils.toWei(swapIn), {from: swapper});

        r = await dexAgg.sell(token1.address, token0.address, utils.toWei(swapIn), minOut, dexData, {from: swapper});     
        m.log("sell exact amount Gas Used:", r.receipt.gasUsed);
        assert.equal(await token1.balanceOf(swapper), "997490050036750883", "sell exact amount");
    })

    it("sell exact amount through path", async () => {
        let swapIn = 1;
        let swapper = accounts[1];
        let minOut = "997490050036750883";

        await utils.mint(token0, swapper, swapIn);
        await token0.approve(dexAgg.address, utils.toWei(swapIn), {from: swapper});

        let path = utils.PancakeDexData + "0003E80001F40003E80001F4" + token0.address.slice(2) + token1.address.slice(2);
        r = await dexAgg.sellMul(utils.toWei(swapIn), minOut, path, {from: swapper});     
        m.log("sell exact amount through path Gas Used:", r.receipt.gasUsed);
        assert.equal(await token1.balanceOf(swapper), "997490050036750883", "sell exact amount failed");
    })

    it("buy exact amount", async () => {
        let swapOut = 1;
        let swapper = accounts[1];
        let maxIn = "1004021826571151290";

        await utils.mint(token0, swapper, 2);
        await token0.approve(dexAgg.address, maxIn, {from: swapper});
        m.log(swapOut)
        r = await dexAgg.buy(token1.address, token0.address, utils.toWei(swapOut), maxIn, dexData, {from: swapper});     
        m.log("buy exact amount Gas Used:", r.receipt.gasUsed);
        assert.equal(await token1.balanceOf(swapper), "1000000000000000000", "sell exact amount");
    }) 
});