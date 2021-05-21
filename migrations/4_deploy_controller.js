const ControllerV1 = artifacts.require("ControllerV1");
const ControllerDelegator = artifacts.require("ControllerDelegator");
const LPool = artifacts.require("LPool");
const Timelock = artifacts.require("Timelock");

const OLEToken = artifacts.require("OLEToken");
const utils = require("./util");

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  await deployer.deploy(ControllerV1, utils.deployOption(accounts));
  await deployer.deploy(LPool, utils.deployOption(accounts));
  await deployer.deploy(ControllerDelegator, OLEToken.address, utils.getWChainToken(network), LPool.address, utils.zeroAddress, Timelock.address, ControllerV1.address, utils.deployOption(accounts));
};
