const utils = require("./utils/OpenLevUtil");
const {
    last8,
    Uni2DexData,
    assertThrows,
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocksAndTime, toBN} = require("./utils/EtheUtil");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");
const TestToken = artifacts.require("MockERC20");
const m = require('mocha-logger');
const OpenLevV1Lib = artifacts.require("OpenLevV1Lib")
const Mock1inchRouter = artifacts.require("Mock1inchRouter");


contract("1inch router", async accounts => {

    // components
    let openLev;
    let ole;
    let treasury;
    let uniswapFactory;
    let gotPair;
    let dexAgg;
    // roles
    let admin = accounts[0];
    let saver = accounts[1];
    let trader = accounts[2];
    let dev = accounts[3];
    let token0;
    let token1;
    let controller;
    let delegatee;
    let weth;

    beforeEach(async () => {

        // runs once before the first test in this block
        controller = await utils.createController(admin);
        m.log("Created Controller", last8(controller.address));

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
    });

    it("verify call 1inch data, receive buyToken address is not openLevV1, revert", async () => {

    })

    it("verify call 1inch data, sellToken address is another token, revert", async () => {

    })

    it("verify call 1inch data, buyToken address is another token, revert", async () => {

    })

    it("verify call 1inch data, sellAmount more than actual amount, revert", async () => {

    })

    it("verify call 1inch data, buyAmount less than minBuyAmount, revert", async () => {

    })





})