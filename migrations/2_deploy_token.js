const OLEToken = artifacts.require("OLEToken");
//kovan

const COREToken = artifacts.require("COREToken");
const DAIToken = artifacts.require("DAIToken");
const DPIToken = artifacts.require("DPIToken");
const FEIToken = artifacts.require("FEIToken");
const FraxToken = artifacts.require("FraxToken");
const RAIToken = artifacts.require("RAIToken");
const UNIToken = artifacts.require("UNIToken");
const USDCToken = artifacts.require("USDCToken");
const USDTToken = artifacts.require("USDTToken");
const WETHToken = artifacts.require("WETHToken");
const WISEToken = artifacts.require("WISEToken");
const XORToken = artifacts.require("XORToken");
const WBTCToken = artifacts.require("WBTCToken");


const utils = require("./util");

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  await deployer.deploy(OLEToken, accounts[0], utils.tokenName(network), utils.tokenSymbol(network), utils.deployOption(accounts));
  if (network == 'kovan') {
    await deployer.deploy(FEIToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(WETHToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(COREToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(DAIToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(DPIToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(FraxToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(RAIToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(UNIToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(USDCToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(USDTToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(WISEToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(XORToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));
    await deployer.deploy(WBTCToken, toBN(100000000).mul(toBN(1e18)), utils.deployOption(accounts));

    //create pair for swap
    await utils.createUniPair_kovan(await FEIToken.at(FEIToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await XORToken.at(XORToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await UNIToken.at(UNIToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await DPIToken.at(DPIToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await RAIToken.at(RAIToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await WISEToken.at(WISEToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await COREToken.at(COREToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await USDTToken.at(USDTToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await WBTCToken.at(WBTCToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await DAIToken.at(DAIToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await FraxToken.at(FraxToken.address), await USDCToken.at(USDCToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await OLEToken.at(OLEToken.address), await WETHToken.at(WETHToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));

    //create pari for usdt price
    await utils.createUniPair_kovan(await FEIToken.at(FEIToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await XORToken.at(XORToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await UNIToken.at(UNIToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await DPIToken.at(DPIToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await RAIToken.at(RAIToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await WISEToken.at(WISEToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await COREToken.at(COREToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await WBTCToken.at(WBTCToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await FraxToken.at(FraxToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await USDCToken.at(USDCToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));
    await utils.createUniPair_kovan(await OLEToken.at(OLEToken.address), await USDTToken.at(USDTToken.address), accounts[0], toBN(2000000).mul(toBN(1e18)));

  }
};

function toBN(bn) {
  return web3.utils.toBN(bn);
}
