let zeroAddress = exports.zeroAddress = "0x0000000000000000000000000000000000000000";
exports.isSkip = function (network) {
  return network == ('development')
    || network == ('soliditycoverage')
    || network == ('local')
    || network == ('huobiMainest')
    || network == ('huobiTest')
    || network == ('integrationTest');
}
exports.deployOption = function (accounts) {
  return {from: accounts[0], overwrite: false}
}
exports.uniswapAddress = function (network) {
  if (network == 'kovan' || network == 'integrationTest') {
    return '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
  }
  if (network == 'huobiMainest') {
    return '0xb0b670fc1F7724119963018DB0BfA86aDb22d941';
  }
  return zeroAddress;
}

exports.blocksPerYear = function (network) {
  return 2102400;
}
exports.tokenName = function (network) {
  return "Open Leverage";
}
exports.tokenSymbol = function (network) {
  // if (network == 'huobiMainest') {
  //   return 'HOLE';
  // }
  return "OLE";
}


exports.getTreasuryShareToken = function (network) {
  if (network == 'huobiMainest') {
    return '0xa71edc38d189767582c38a3145b5873052c3e47a';
  }
  //kovan WETH
  return "0xC58854ce3a7d507b1CA97Fa7B28A411956c07782";
}
exports.getWChainToken = function (network) {
  //WETH
  return "0xC58854ce3a7d507b1CA97Fa7B28A411956c07782";
}
exports.getLpoolStartTime = function () {
  //now+120s
  return parseInt((new Date().getTime() + 120 * 1000).toString().substr(0, 10));
}
exports.getFarmingStartTime = function () {
  //now+1h
  return parseInt((new Date().getTime() + 60 * 60 * 1000).toString().substr(0, 10));
}
exports.getFarmingDuration = function () {
  //8 weeks
  return 8 * 7 * 24 * 60 * 60;
}
const UniswapV2Router = artifacts.require("IUniswapV2Router");
const uniRouterV2Address_kovan = exports.uniRouterV2Address_kovan = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";

exports.createUniPair_kovan = async (token0, token1, account, amount) => {
  console.log("starting create pair ", await token0.name(), '-', await token1.name())
  let router = await UniswapV2Router.at(uniRouterV2Address_kovan);
  await token0.approve(uniRouterV2Address_kovan, amount);
  await token1.approve(uniRouterV2Address_kovan, amount);
  let transaction = await router.addLiquidity(token0.address, token1.address, amount, amount,
    amount, amount, account, amount);
  console.log("finished create pair ", await token0.name(), '-', await token1.name(), ",tx=", transaction.tx);
  return router;
}
