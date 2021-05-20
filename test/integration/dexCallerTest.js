const {toBN, maxUint} = require("../utils/EtheUtil");
const DexCaller = artifacts.require("MockDexCaller");
const TestToken = artifacts.require("MockERC20");
const utils = require("../utils/OpenLevUtil");
const m = require('mocha-logger');

let networkId;
contract("DexCaller integration test ", async accounts => {

  before(async () => {
    // runs once before the first test in this block
    networkId = await web3.eth.net.getId();
  });
  it("swapSell succeed test", async () => {
    if (networkId != '42') {
      m.log("Ignore swap test because it should run on Kovan network")
      return;
    }
    let token0 = await TestToken.new('TestToken', 'TEST0');
    let token1 = await TestToken.new('TestToken', 'TEST1');
    await token0.mint(accounts[0], toBN(1000000).mul(toBN(1e18)));
    await token1.mint(accounts[0], toBN(1000000).mul(toBN(1e18)));
    await token0.approve(utils.uniRouterV2Address_kovan, maxUint());
    await token1.approve(utils.uniRouterV2Address_kovan, maxUint());
    await utils.createUniPair_kovan(token0, token1, accounts[0], await utils.toWei(100));
    let dexCaller = await DexCaller.new(utils.uniFactoryV2Address_kovan);
    await token1.transfer(dexCaller.address, toBN(20).mul(toBN(1e18)).toString());
    m.log("starting swapSell");
    await dexCaller.swapSell(token0.address, token1.address, toBN(20).mul(toBN(1e18)).toString());
    m.log("finished swapSell");
    assert.equal(await token1.balanceOf(dexCaller.address), 0);
    assert.equal(await token0.balanceOf(dexCaller.address), '16624979156244789061');
    m.log("finished verify");
  })

  it("swapBuy succeed test", async () => {
    if (networkId != '42') {
      m.log("Ignore swap test because it should run on Kovan network")
      return;
    }
    let token0 = await TestToken.new('TestToken', 'TEST0');
    let token1 = await TestToken.new('TestToken', 'TEST1');
    await token0.mint(accounts[0], toBN(1000000).mul(toBN(1e18)));
    await token1.mint(accounts[0], toBN(1000000).mul(toBN(1e18)));
    await token0.approve(utils.uniRouterV2Address_kovan, maxUint());
    await token1.approve(utils.uniRouterV2Address_kovan, maxUint());
    await utils.createUniPair_kovan(token0, token1, accounts[0], await utils.toWei(100));
    let dexCaller = await DexCaller.new(utils.uniFactoryV2Address_kovan);
    await token1.transfer(dexCaller.address, toBN(20).mul(toBN(1e18)).toString());
    m.log("starting swapBuy");
    await dexCaller.swapBuy(token0.address, token1.address, toBN(1).mul(toBN(1e18)).toString());
    m.log("finished swapBuy");
    assert.equal((await token0.balanceOf(dexCaller.address)).toString(), toBN(1).mul(toBN(1e18)).toString());
    m.log("token1.balanceOf(dexCaller.address)=", await token1.balanceOf(dexCaller.address));
    assert.equal((await token1.balanceOf(dexCaller.address)).toString(), '18986859568604804311');
    m.log("finished verify");

  })
  it("swapSell failured test", async () => {
    if (networkId != '42') {
      m.log("Ignore swap test because it should run on Kovan network")
      return;
    }
    let token0 = await TestToken.new('TestToken', 'TEST0');
    let token1 = await TestToken.new('TestToken', 'TEST1');
    await token0.mint(accounts[0], toBN(1000000).mul(toBN(1e18)));
    await token1.mint(accounts[0], toBN(1000000).mul(toBN(1e18)));
    await token0.approve(utils.uniRouterV2Address_kovan, maxUint());
    await token1.approve(utils.uniRouterV2Address_kovan, maxUint());
    await utils.createUniPair_kovan(token0, token1, accounts[0], await utils.toWei(100));
    let dexCaller = await DexCaller.new(utils.uniFactoryV2Address_kovan);
    await token1.transfer(dexCaller.address, toBN(20).mul(toBN(1e18)).toString());
    let maxBuyAmount = await dexCaller.calBuyAmount(token0.address, token1.address, toBN(20).mul(toBN(1e18)).toString());
    m.log("starting flashSell");
    try {
      await dexCaller.swapLimit(token0.address, token1.address, toBN(20).mul(toBN(1e18)).toString(), maxBuyAmount.add(toBN(1)).toString());
      assert.fail("should thrown buy amount less than min error");
    } catch (error) {
      assert.include(error.message, ' with an error', 'throws exception with buy amount less than min.');
    }
  })

  it("swapBuyLimit failured test", async () => {
    if (networkId != '42') {
      m.log("Ignore swap test because it should run on Kovan network")
      return;
    }
    let token0 = await TestToken.new('TestToken', 'TEST0');
    let token1 = await TestToken.new('TestToken', 'TEST1');
    await token0.mint(accounts[0], toBN(1000000).mul(toBN(1e18)));
    await token1.mint(accounts[0], toBN(1000000).mul(toBN(1e18)));
    await token0.approve(utils.uniRouterV2Address_kovan, maxUint());
    await token1.approve(utils.uniRouterV2Address_kovan, maxUint());
    await utils.createUniPair_kovan(token0, token1, accounts[0], await utils.toWei(100));
    let dexCaller = await DexCaller.new(utils.uniFactoryV2Address_kovan);
    await token1.transfer(dexCaller.address, toBN(20).mul(toBN(1e18)).toString());
    m.log("starting swapBuyLimit");
    try {
      await dexCaller.swapBuyLimit(token0.address, token1.address, toBN(1).mul(toBN(1e18)).toString(),  toBN(1).mul(toBN(1e18)).toString());
      assert.fail("should thrown sell amount not enough error");
    } catch (error) {
      assert.include(error.message, ' with an error', 'throws exception with sell amount not enough.');
    }
  })
})
