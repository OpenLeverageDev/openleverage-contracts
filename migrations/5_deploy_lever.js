const PriceOracleV2 = artifacts.require("PriceOracleV2");
const Treasury = artifacts.require("TreasuryDelegator");
const OpenLevDelegate = artifacts.require("OpenLevV1");
const OpenLevV1 = artifacts.require("OpenLevDelegator");

const ReferralDelegate = artifacts.require("Referral");
const Referral = artifacts.require("ReferralDelegator");

const Timelock = artifacts.require("Timelock");

const ControllerV1 = artifacts.require("ControllerDelegator");

const utils = require("./util");

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  const uniswap = utils.uniswapAddress(network);
  await deployer.deploy(PriceOracleV2, uniswap, utils.deployOption(accounts));

  await deployer.deploy(OpenLevDelegate, utils.deployOption(accounts));
  await deployer.deploy(OpenLevV1, ControllerV1.address, uniswap, Treasury.address, PriceOracleV2.address, utils.zeroAddress, Timelock.address, OpenLevDelegate.address, utils.deployOption(accounts));

  await deployer.deploy(ReferralDelegate, utils.deployOption(accounts));
  await deployer.deploy(Referral, OpenLevV1.address, Timelock.address, ReferralDelegate.address, utils.deployOption(accounts));


};
