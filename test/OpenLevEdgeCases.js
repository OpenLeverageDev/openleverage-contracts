const utils = require("./utils/OpenLevUtil");
const {Uni2DexData, assertThrows} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocksAndTime, toBN} = require("./utils/EtheUtil");
const Controller = artifacts.require("ControllerV1");
const ControllerDelegator = artifacts.require("ControllerDelegator");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");
const m = require('mocha-logger');
const LPool = artifacts.require("LPool");
const TestToken = artifacts.require("MockERC20");
const MockTaxToken = artifacts.require("MockTaxToken");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");
const UniswapV2Router = artifacts.require("UniswapV2Router02");
const OpenLevV1Lib = artifacts.require("OpenLevV1Lib")

// list all cases for tax token since there is no smaller unit to divide.
contract("OpenLev UniV2", async accounts => {
    // components
    let openLev;
    let ole;
    let xole;
    let treasury;
    let factory;
    let router;
    let gotPair;
    let dexAgg;
    let pool0;
    let poolEth;

    // roles
    let admin = accounts[0];
    let saver = accounts[1];
    let trader = accounts[2];

    let dev = accounts[3];
    let liquidator2 = accounts[8];
    let token0;
    let delegatee;
    let weth;

    let pairId = 0;

    beforeEach(async () => {
        controller = await utils.createController(admin);
        ole = await TestToken.new('OpenLevERC20', 'OLE');
        token0 = await TestToken.new('TokenA', 'TKA');
        token1 = await TestToken.new('TokenB', 'TKB');
        weth = await utils.createWETH();

        uniswapFactory = await utils.createUniswapV2Factory();
        gotPair = await utils.createUniswapV2Pool(uniswapFactory, token0, token1);

        dexAgg = await utils.createEthDexAgg(uniswapFactory.address, "0x0000000000000000000000000000000000000000", accounts[0]);
        xole = await utils.createXOLE(ole.address, admin, dev, dexAgg.address);

        openLevV1Lib = await OpenLevV1Lib.new();
        await OpenLevV1.link("OpenLevV1Lib", openLevV1Lib.address);
        delegatee = await OpenLevV1.new();
        
        openLev = await OpenLevDelegator.new(controller.address, dexAgg.address, [token0.address, token1.address], weth.address, xole.address, [1, 2], accounts[0], delegatee.address);
        openLev = await OpenLevV1.at(openLev.address);
        await openLev.setCalculateConfig(30, 33, 3000, 5, 25, 25, (30e18) + '', 300, 10, 60);
        await controller.setOpenLev(openLev.address);
        await controller.setLPoolImplementation((await utils.createLPoolImpl()).address);
        await controller.setInterestParam(toBN(90e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '');
        await dexAgg.setOpenLev(openLev.address);

        let createPoolTx = await controller.createLPoolPair(token0.address, token1.address, 3000, Uni2DexData); // 30% margin ratio by default
        m.log("Create Market Gas Used: ", createPoolTx.receipt.gasUsed);

        market = await openLev.markets(0);
        let pool0Address = market.pool0;
        let pool1Address = market.pool1;
        pool0 = await LPool.at(pool0Address);
        pool1 = await LPool.at(pool1Address);

        await utils.mint(token0, accounts[0], utils.toWei(10000));
        await utils.mint(token1, accounts[0], utils.toWei(10000));
        await token0.approve(pool0.address, utils.toWei(1));
        await pool0.mint(utils.toWei(1));

        await token1.approve(pool1.address, utils.toWei(1));
        await pool1.mint(utils.toWei(1));

        await token0.transfer(trader, utils.toWei(1));
        await token0.approve(openLev.address, utils.toWei(1), {from: trader});
        await token1.transfer(trader, utils.toWei(1));
        await token1.approve(openLev.address, utils.toWei(1), {from: trader});

        await advanceMultipleBlocksAndTime(30);
    });

    it("create lpool pair from using unsupportDex", async() => {
        let lPool0 = await LPool.new();
        let lPool1 = await LPool.new();
        await assertThrows(openLev.addMarket(lPool0.address, lPool1.address, 3000, Uni2DexData), 'UDX');
    })


    it('should revert margin trade with too little deposit', async() => {
        await assertThrows(openLev.marginTrade(0, 0, 0, 1000000000000000, 2000000000000000, 0, '0x03', {from: trader}), 'UDX');
    })

    it('should revert margin trade with too little deposit', async() => {
        await assertThrows(openLev.marginTrade(0, 0, 0, 100000000000000, 200000000000000, 0, Uni2DexData, {from: trader}), 'DTS');
    })

    it('should revert margin trade with no leverage', async() => {
        await assertThrows(openLev.marginTrade(0, 0, 0, 1000000000000000, 0, 0, Uni2DexData, {from: trader}), 'BB0');
    })

    it('should revert margin trade exceed margin limit', async() => {
        await assertThrows(openLev.marginTrade(0, 0, 0, 1000000000000000, 4000000000000000, 0, Uni2DexData, {from: trader}), 'MAM');
    })

    it('should revert close trade with no sufficient helds', async() => {
        await openLev.marginTrade(0, 0, 0, 1000000000000000, 2000000000000000, 0, Uni2DexData, {from: trader})
        let trade = await openLev.activeTrades(trader, 0, false);
        m.log("held:", trade.held);
        await assertThrows(openLev.closeTrade(0, 0, 4000000000000000, 0, Uni2DexData, {from: trader}), "CBH");
    })

    it('should revert close trade with no helds', async() => {
        await assertThrows(openLev.closeTrade(0, 0, 0, 0, Uni2DexData, {from: trader}), "HI0");
    })

    it('should liquidate close trade with no helds', async() => {
        await assertThrows(openLev.liquidate(trader, 0, 0, 0, 0, Uni2DexData), "HI0");
    })

    it('should revert close trade with no sufficient helds', async() => {
        await openLev.marginTrade(0, 0, 0, 1000000000000000, 2000000000000000, 0, Uni2DexData, {from: trader})
        let trade = await openLev.activeTrades(trader, 0, false);
        m.log("held:", trade.held);
        await assertThrows(openLev.liquidate(trader, 0, 0, 0, utils.maxUint(), Uni2DexData), "PIH");
    })
})