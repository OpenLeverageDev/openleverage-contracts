const Gov = artifacts.require("GovernorAlpha");
const Timelock = artifacts.require("Timelock");
const OLEToken = artifacts.require("OLEToken");
const Reserve = artifacts.require("Reserve");
const Treasury = artifacts.require("Treasury");
const TreasuryDelegator = artifacts.require("TreasuryDelegator");

//kovan
const WETHToken = artifacts.require("WETHToken");

const utils = require("./util");

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  await deployer.deploy(Timelock, accounts[0], (3 * 60) + "", utils.deployOption(accounts));
  await deployer.deploy(Gov, Timelock.address, OLEToken.address, accounts[0], utils.deployOption(accounts));
  await deployer.deploy(Reserve, accounts[0], OLEToken.address, utils.deployOption(accounts));
  const uniswap = utils.uniswapAddress(network);
  //dev ratio 50%
  let shareToken = network == 'kovan' ? WETHToken.address : utils.getTreasuryShareToken(network);
  await deployer.deploy(Treasury, utils.deployOption(accounts));
  await deployer.deploy(TreasuryDelegator, uniswap, OLEToken.address, shareToken, 50, accounts[0], accounts[0], Treasury.address, utils.deployOption(accounts));

};
