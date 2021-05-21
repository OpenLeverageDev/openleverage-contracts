const OLEToken = artifacts.require("OLEToken");

const utils = require("./util");

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  await deployer.deploy(OLEToken, accounts[0], utils.tokenName(network), utils.tokenSymbol(network), utils.deployOption(accounts));
  if (network == 'kovan') {
    //create pair for weth
    await utils.createUniPair_kovan(await OLEToken.at(OLEToken.address), await OLEToken.at("0xc58854ce3a7d507b1ca97fa7b28a411956c07782"), accounts[0], toWei(2000000));
    //create pari for usdt price
    await utils.createUniPair_kovan(await OLEToken.at(OLEToken.address), await OLEToken.at("0xf894289f63b0b365485cee34aa50681f295f84b4"), accounts[0], toWei(2000000));
  }
};


function toWei(bn) {
  return web3.utils.toBN(bn).mul(web3.utils.toBN(1e18));
}


