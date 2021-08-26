const {toBN, maxUint} = require("../utils/EtheUtil");
const utils = require("../utils/OpenLevUtil");
const m = require('mocha-logger');
const MockERC20 = artifacts.require("MockERC20");

let networkId;
contract("Mdex integration test ", async accounts => {

  before(async () => {
    // runs once before the first test in this block
    networkId = await web3.eth.net.getId();
  });
  it("get price and swap test", async () => {
    if (networkId != '128') {
      m.log("Ignore swap test")
      return;
    }
    m.log("starting....");
    let mdexFactory = '0xb0b670fc1F7724119963018DB0BfA86aDb22d941';
    let hbtc_usdt_pair = '0x78c90d3f8a64474982417cdb490e840c01e516d4';
    let heth = '0x64ff637fb478863b7468bc97d30a5bf3a428a1fd';
    let usdt = '0xa71edc38d189767582c38a3145b5873052c3e47a';

    //获取价格
    //address:0x4dB73993AE94B2c7142aD4a657736204c3c002aB
    let priceOracle = await PriceOracle.at('0x4dB73993AE94B2c7142aD4a657736204c3c002aB');
    m.log("priceOracle.address=", priceOracle.address);
    let price = await priceOracle.getPrice(heth, usdt);
    m.log("eth price=", price[0].div(toBN(1e10)));

    //交易
    //0xf3237795B0C0295341F3eefEa80460b834d1998e
    // let dexCaller = await DexCaller.new(mdexFactory);
    let dexCaller = await DexCaller.at('0xf3237795B0C0295341F3eefEa80460b834d1998e');
    m.log("dexCaller.address=", dexCaller.address);
    let EthToken = await MockERC20.at(heth);
    let UsdtToken = await MockERC20.at(usdt);
    // await EthToken.transfer(dexCaller.address, 1e9 + '');
    m.log("dexCaller eth balanc before", await EthToken.balanceOf(dexCaller.address));
    m.log("dexCaller usdt balance before", await UsdtToken.balanceOf(dexCaller.address));
    await dexCaller.swapLimit(usdt, heth, 1e8 + '', '0');
    m.log("dexCaller eth balance after", await EthToken.balanceOf(dexCaller.address));
    m.log("dexCaller usdt balance after", await UsdtToken.balanceOf(dexCaller.address));

  })
})
