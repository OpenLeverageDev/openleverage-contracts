const Gov = artifacts.require("GovernorAlpha");
const Timelock = artifacts.require("Timelock");
const OLEToken = artifacts.require("OLEToken");
const Reserve = artifacts.require("Reserve");

//kovan
const WETHToken = artifacts.require("WETHToken");

const utils = require("./util");

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  await deployer.deploy(Timelock, accounts[0], (3 * 60) + "", utils.deployOption(accounts));
  await deployer.deploy(Gov, Timelock.address, OLEToken.address, accounts[0], utils.deployOption(accounts));
  //Reserve begin 2021-05-22 00:00:00, end 2021-06-10 00:00:00, vestingAmount 100000
  await deployer.deploy(Reserve, Timelock.address, OLEToken.address, toWei(100000), 1621612800, 1623254400, utils.deployOption(accounts));
  const uniswap = utils.uniswapAddress(network);
  //dev ratio 50%
  let shareToken = network == 'kovan' ? "0xC58854ce3a7d507b1CA97Fa7B28A411956c07782" : utils.getTreasuryShareToken(network);

};


function toWei(bn) {
  return web3.utils.toBN(bn).mul(web3.utils.toBN(1e18));
}
