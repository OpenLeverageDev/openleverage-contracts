const OLEToken = artifacts.require("OLEToken");

const utils = require("./util");
const m = require('mocha-logger');

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  // let farmingStartTime = utils.getFarmingStartTime();
  // let farmingDuration = utils.getFarmingDuration();
  // await deployer.deploy(FarmingPool, OLEToken.address, '0xf10becb6ad921a0aebf0874cbc72227a145d5eb5', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy FEI - WETH  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0x9ed94d56bf998c51a2978bafa4a4df06b63e110d', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy XOR - WETH  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0xc318e066b0c79546a53e9d69590725ef7969e9c6', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy UNI - WETH  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0x58e99cedd95e219ae18605368313849fb10854f6', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy DPI - WETH  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0x1e9656ed3f3f64c91bdf5a8eaad0e0fc6ab9a866', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy RAI - WETH  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0xa5497e7fd2b46f2836bf1a3d6b166c985af6a1c5', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy WISE - WETH  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0x258f0e63c8c3aa6c17954a558413144e06609aae', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy CORE - WETH  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0x64c9b61ca5f0f29b4d72b5ef480b4d25a5da4009', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy USDT - WETH  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0x62bc38d68b497b04778bd12066cb6f3d03cb72dd', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy WBTC - WETH  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0x87fe5f602a8802b3f65573a76ee4cc32c2845ed0', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy DAI - USDT  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0x8a0700a412948625fd174c83214fdabb11089f0b', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy Frax - USDC  Farming =", FarmingPool.address);
  //
  // await deployer.deploy(FarmingPool, OLEToken.address, '0x3afb1a8e3eb44687a2a7c139a4c26ad45a891b54', farmingStartTime, farmingDuration, utils.deployOption(accounts));
  // m.log("deploy Open Leverage - WETH  Farming =", FarmingPool.address);
};
