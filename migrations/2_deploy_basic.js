const OLEToken = artifacts.require("OLEToken");
const xOLE = artifacts.require("XOLE");
const xOLEDelegator = artifacts.require("XOLEDelegator");
const EthDexAggregatorV1 = artifacts.require("EthDexAggregatorV1");
const BscDexAggregatorV1 = artifacts.require("BscDexAggregatorV1");
const DexAggregatorDelegator = artifacts.require("DexAggregatorDelegator");
const Gov = artifacts.require("GovernorAlpha");
const Timelock = artifacts.require("Timelock");
const ControllerV1 = artifacts.require("ControllerV1");
const ControllerDelegator = artifacts.require("ControllerDelegator");
const LPool = artifacts.require("LPool");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");
const utils = require("./util");
const m = require('mocha-logger');

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  let adminAccount = accounts[0];
  let dev = accounts[0];
  let weth9 = utils.getWChainToken(network);
  //timeLock
  await deployer.deploy(Timelock, adminAccount, (3 * 60) + "", utils.deployOption(accounts));
  let adminCtr = Timelock.address;
  //ole
  await deployer.deploy(OLEToken, adminAccount, adminCtr, utils.tokenName(network), utils.tokenSymbol(network), utils.deployOption(accounts));
  //dexAgg
  switch (network){
    case utils.kovan:
    case utils.ethIntegrationTest:
      await deployer.deploy(EthDexAggregatorV1, utils.deployOption(accounts));
      await deployer.deploy(DexAggregatorDelegator, utils.uniswapV2Address(), utils.uniswapV3Address(), adminCtr, EthDexAggregatorV1.address, utils.deployOption(accounts));
      break;
    case utils.bscIntegrationTest:
    case utils.bscTestnet:
      await deployer.deploy(BscDexAggregatorV1, utils.deployOption(accounts));
      await deployer.deploy(DexAggregatorDelegator, utils.uniswapV2Address(), utils.uniswapV3Address(), adminCtr, BscDexAggregatorV1.address, utils.deployOption(accounts));
      break;
    default:
      m.error("unkown network");
      return
  }

  //xole
  await deployer.deploy(xOLE, utils.deployOption(accounts));
  await deployer.deploy(xOLEDelegator, OLEToken.address, DexAggregatorDelegator.address, 5000, dev, adminCtr, xOLE.address, utils.deployOption(accounts));
  //gov
  await deployer.deploy(Gov, Timelock.address, xOLEDelegator.address, adminAccount, utils.deployOption(accounts));
  // reserve begin 2021-05-22 00:00:00, end 2021-06-10 00:00:00, vestingAmount 100000
  // await deployer.deploy(Reserve, Timelock.address, OLEToken.address, toWei(100000), 1621612800, 1623254400, utils.deployOption(accounts));
  //controller
  await deployer.deploy(LPool, utils.deployOption(accounts));
  await deployer.deploy(ControllerV1, utils.deployOption(accounts));
  await deployer.deploy(ControllerDelegator, OLEToken.address, xOLEDelegator.address, weth9, LPool.address, utils.zeroAddress, DexAggregatorDelegator.address, adminCtr, ControllerV1.address, utils.deployOption(accounts));
  //openLev
  await deployer.deploy(OpenLevV1, utils.deployOption(accounts));
  await deployer.deploy(OpenLevDelegator, ControllerDelegator.address, DexAggregatorDelegator.address, utils.getDepositTokens(network), weth9, xOLEDelegator.address, adminCtr, OpenLevV1.address, utils.deployOption(accounts));
  //set openLev address
  m.log("Waiting controller setOpenLev......");
  await (await Timelock.at(Timelock.address)).executeTransaction(ControllerDelegator.address, 0, 'setOpenLev(address)', encodeParameters(['address'], [OpenLevDelegator.address]), 0);
  m.log("Waiting dexAgg setOpenLev......");
  await (await Timelock.at(Timelock.address)).executeTransaction(DexAggregatorDelegator.address, 0, 'setOpenLev(address)', encodeParameters(['address'], [OpenLevDelegator.address]), 0);  
  // if (network == 'kovan') {
  //   //
  //   m.log("Waiting Create pair for weth......");
  //   await utils.createUniPair_kovan(await OLEToken.at(OLEToken.address), await OLEToken.at("0xc58854ce3a7d507b1ca97fa7b28a411956c07782"), accounts[0], toWei(2000000));
  //   //create pari for usdt price
  //   await utils.createUniPair_kovan(await OLEToken.at(OLEToken.address), await OLEToken.at("0xf894289f63b0b365485cee34aa50681f295f84b4"), accounts[0], toWei(2000000));
  // }
};

function encodeParameters(keys, values) {
  return web3.eth.abi.encodeParameters(keys, values);
}
function toWei(bn) {
  return web3.utils.toBN(bn).mul(web3.utils.toBN(1e18));
}


