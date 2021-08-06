const Migrations = artifacts.require("Migrations");
const utils = require("./util");
const Quoter = artifacts.require("Quoter");


module.exports = async function (deployer, network, accounts) {
  //0x0952af06
  let sha=web3.utils.sha3('swapTokensForTokens(uint256,uint256,address[],bool,bool,bool)');
  console.log("sha =", sha);

  console.log("Deploying in network =", network);
  process.env.NETWORK = network;
  if (utils.isSkip(network)) {
    return;
  }
  // await deployer.deploy(Migrations, utils.deployOption(accounts));
  let quoter = new web3.eth.Contract(Quoter.abi, "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6");

  // let quoter = await Quoter.at("0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6");
  //L9-F5-G3*0.002
  let result = await quoter.methods.quoteExactOutputSingle("0x4e9d5268579ae76f390f232aea29f016bd009aab", "0xc58854ce3a7d507b1ca97fa7b28a411956c07782", 3000, 10000, 0).call();
  console.log("result=", result);
};
