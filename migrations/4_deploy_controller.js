const ControllerV1 = artifacts.require("ControllerV1");
const ControllerDelegator = artifacts.require("ControllerDelegator");
const LPool = artifacts.require("LPool");
const JumpRateModel = artifacts.require("JumpRateModel");

const OLEToken = artifacts.require("OLEToken");
const utils = require("./util");

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  await deployer.deploy(ControllerV1, utils.deployOption(accounts));
  await deployer.deploy(LPool, utils.deployOption(accounts));
  //base 10%,multiplier 30%,jump 110%, kink=50%
  // await deployer.deploy(JumpRateModel, 10e16 + "", 30e16 + "", 150e16 + "", 50e16 + "", utils.deployOption(accounts));
  let blocksPerYear = utils.blocksPerYear(network);
  await deployer.deploy(ControllerDelegator, OLEToken.address, LPool.address,
    utils.zeroAddress, 10e16 / blocksPerYear + "", 30e16 / blocksPerYear + "", 150e16 / blocksPerYear + "", 50e16 + "", accounts[0], ControllerV1.address, utils.deployOption(accounts));
};
