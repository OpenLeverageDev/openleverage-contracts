const OLEToken = artifacts.require("OLEToken");
const OLETokenLock = artifacts.require("OLETokenLock");

const utils = require("./util");
const m = require('mocha-logger');

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  // /**
  //  * 0xe5E532C0a199Bd389AA0321D596871a3512d3db0 begin 2021-05-22 00:00:00, end 2021-06-10 00:00:00, amount 10000
  //  * 0xa88A508A3fBd247ab784616D71Bb339Ea5d3B97A begin 2021-05-23 00:00:00, end 2021-06-11 00:00:00, amount 20000
  //  * votes delegate to 0xfc35BeCb6438f551899dF762B0C5c2bc5b344B04
  //  */
  // await deployer.deploy(OLETokenLock, OLEToken.address,
  //   ['0xe5E532C0a199Bd389AA0321D596871a3512d3db0', '0xa88A508A3fBd247ab784616D71Bb339Ea5d3B97A'],
  //   [toWei(10000), toWei(20000)],
  //   [1621612800, 1621699200],
  //   [1623254400, 1623340800],
  //   "0xfc35BeCb6438f551899dF762B0C5c2bc5b344B04",
  //   utils.deployOption(accounts));
};


function toWei(bn) {
  return web3.utils.toBN(bn).mul(web3.utils.toBN(1e18));
}
