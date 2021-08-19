const OpenLevDelegate = artifacts.require("OpenLevV1");
const OpenLevV1 = artifacts.require("OpenLevDelegator");
const DexAggregatorV1 = artifacts.require("DexAggregatorV1");
const Timelock = artifacts.require("Timelock");
const ControllerV1 = artifacts.require("ControllerDelegator");
const utils = require("./util");

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  await deployer.deploy(DexAggregatorV1, "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", "0x1f98431c8ad98523631ae4a59f267346ea31f984", utils.deployOption(accounts));
  await deployer.deploy(OpenLevDelegate, utils.deployOption(accounts));
  await deployer.deploy(OpenLevV1, ControllerV1.address, DexAggregatorV1.address, Timelock.address, OpenLevDelegate.address, utils.deployOption(accounts));

};
