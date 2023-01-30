const utils = require("./utils/OpenLevUtil");
const {assertThrows} = require("./utils/OpenLevUtil");
const TestToken = artifacts.require("MockERC20");


contract("DexAggregator", async accounts => {
    let add0 = "0x0000000000000000000000000000000000000000";
    let add1 = "0x0000000000000000000000000000000000000001";
    let admin = accounts[0];
    beforeEach(async () => {

    });

    it("Admin setOpenLev test ", async () => {
        let bscDexAgg = await utils.createBscDexAgg(add0, add0, admin);
        await assertThrows(bscDexAgg.setOpenLev(add0, {from: accounts[1]}), 'caller must be admin');
        await bscDexAgg.setOpenLev(add1, {from: admin})
        assert.equal(add1, await bscDexAgg.openLev());
        let ethDexAgg = await utils.createEthDexAgg(add0, add0, admin);
        await assertThrows(ethDexAgg.setOpenLev(add0, {from: accounts[1]}), 'caller must be admin');
        await ethDexAgg.setOpenLev(add1, {from: admin})
        assert.equal(add1, await ethDexAgg.openLev());
    })
    it("Admin setDexInfo test", async () => {
        let bscDexAgg = await utils.createBscDexAgg(add0, add0, admin);
        await assertThrows(bscDexAgg.setDexInfo([1], [add1], [25], {from: accounts[1]}), 'caller must be admin');
        await bscDexAgg.setDexInfo([1], [add1], [25], {from: admin})
        assert.equal(add1, (await bscDexAgg.dexInfo(1)).factory);
        assert.equal(25, (await bscDexAgg.dexInfo(1)).fees);

        let ethDexAgg = await utils.createEthDexAgg(add0, add0, admin);
        await assertThrows(ethDexAgg.setDexInfo([1], [add1], [25], {from: accounts[1]}), 'caller must be admin');
        await ethDexAgg.setDexInfo([1], [add1], [25], {from: admin})
        assert.equal(add1, (await ethDexAgg.dexInfo(1)).factory);
        assert.equal(25, (await ethDexAgg.dexInfo(1)).fees);
    })

    it("Admin setOpBorrowing test", async () => {
        let opBorrowing = accounts[1];
        let bscDexAgg = await utils.createBscDexAgg(add0, add0, admin);
        await assertThrows(bscDexAgg.setOpBorrowing(opBorrowing, {from: accounts[1]}), 'caller must be admin');
        await bscDexAgg.setOpBorrowing(opBorrowing, {from: admin})
        assert.equal(opBorrowing, (await bscDexAgg.opBorrowing()));

        let ethDexAgg = await utils.createEthDexAgg(add0, add0, admin);
        await assertThrows(ethDexAgg.setOpBorrowing(opBorrowing, {from: accounts[1]}), 'caller must be admin');
        await ethDexAgg.setOpBorrowing(opBorrowing, {from: admin})
        assert.equal(opBorrowing, (await ethDexAgg.opBorrowing()));

    })

    it("Get liquidity test", async () => {
        let uniswapFactory = await utils.createUniswapV2Factory();
        let token0 = await TestToken.new('TokenA', 'TKA');
        let token1 = await TestToken.new('TokenB', 'TKB');
        let gotPair = await utils.createUniswapV2Pool(uniswapFactory, token0, token1);
        let bscDexAgg = await utils.createBscDexAgg(uniswapFactory.address, "0x0000000000000000000000000000000000000000", accounts[0]);
        await token0.mint(gotPair.address, 1);
        await token1.mint(gotPair.address, 2);

        let liquidity = await bscDexAgg.getToken0Liquidity(token0.address, token1.address, "0x03");
        assert.equal((await token0.balanceOf(gotPair.address)).toString(), liquidity.toString());

        let liquiditys = await bscDexAgg.getPairLiquidity(token0.address, token1.address, "0x03");
        assert.equal((await token0.balanceOf(gotPair.address)).toString(), liquiditys[0].toString());
        assert.equal((await token1.balanceOf(gotPair.address)).toString(), liquiditys[1].toString());

        let uniswapV3Factory = await utils.createUniswapV3Factory();
        let v3Pair = await utils.createUniswapV3Pool(uniswapV3Factory, token0, token1, accounts[0]);
        let ethDexAgg = await utils.createEthDexAgg(uniswapFactory.address, uniswapV3Factory.address, accounts[0]);
        await token0.mint(v3Pair.address, 1);
        await token1.mint(v3Pair.address, 2);
        liquidity = await ethDexAgg.getToken0Liquidity(token0.address, token1.address, "0x01");
        liquiditys = await ethDexAgg.getPairLiquidity(token0.address, token1.address, "0x01");
        assert.equal((await token0.balanceOf(gotPair.address)).toString(), liquiditys[0].toString());
        assert.equal((await token1.balanceOf(gotPair.address)).toString(), liquiditys[1].toString());

        assert.equal((await token0.balanceOf(gotPair.address)).toString(), liquidity.toString());
        let liquidityV3 = await ethDexAgg.getToken0Liquidity(token0.address, token1.address, "0x02000bb8");
        let liquiditysV3 = await ethDexAgg.getPairLiquidity(token0.address, token1.address, "0x02000bb8");
        assert.equal((await token0.balanceOf(v3Pair.address)).toString(), liquidityV3.toString());
        assert.equal((await token0.balanceOf(v3Pair.address)).toString(), liquiditysV3[0].toString());
        assert.equal((await token1.balanceOf(v3Pair.address)).toString(), liquiditysV3[1].toString());
    })

});
