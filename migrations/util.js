let zeroAddress = exports.zeroAddress = "0x0000000000000000000000000000000000000000";
let kovan = exports.kovan = 'kovan';
let ethIntegrationTest = exports.ethIntegrationTest = 'ethIntegrationTest';
let bscTestnet = exports.bscTestnet = 'bscTestnet';
let bscIntegrationTest = exports.bscIntegrationTest = 'bscIntegrationTest';

exports.isSkip = function (network) {
  return network == ('development') ||
    network == ('soliditycoverage') || 
    network == ('local') || 
    network == ('huobiMainest') || 
    network == ('huobiTest') || 
    network == (ethIntegrationTest);
}
exports.deployOption = function (accounts) {
  return {from: accounts[0], overwrite: false}
}
exports.getAdmin = function (accounts) {
  return accounts[0];
}
exports.uniswapV2Address = function (network) {
  switch (network){
    case bscIntegrationTest:
    case bscTestnet: 
      return '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
    case kovan:
    case ethIntegrationTest: 
      return '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
    default: 
      return zeroAddress;
  }
}

exports.uniswapV3Address = function (network) {
  switch (network){
    case kovan:
    case ethIntegrationTest: 
      return '0x1f98431c8ad98523631ae4a59f267346ea31f984';
    default: 
      return zeroAddress;
  }
}

exports.getDepositTokens = function (network) {
  switch (network){
    case kovan:
    case ethIntegrationTest: 
      return [
        weth9,
        "0xc58854ce3a7d507b1ca97fa7b28a411956c07782",//weth(test)
        "0xf894289f63b0b365485cee34aa50681f295f84b4",//usdt
        "0x9278bf26744d3c98b8f24809fe8ea693b9aa4cf6",//wbtc
        "0x5c95482b5962b6c3d2d47dc4a3fd7173e99853b0",//dai
        "0x7a8bd2583a3d29241da12dd6f3ae88e92a538144"//usdc
      ];
    case bscIntegrationTest:
      return [
        "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",//WBNB
        "0xe9e7cea3dedca5984780bafc599bd69add087d56"//BUSD
      ];
    case bscTestnet:
      return [
        "0x094616f0bdfb0b526bd735bf66eca0ad254ca81f",//WBNB
        "0x8301f2213c0eed49a7e28ae4c3e91722919b8b47"//BUSD
      ]
    default: 
      return [];
  }
}

exports.blocksPerYear = function (network) {
  switch (network){
    case kovan:
    case ethIntegrationTest:
      return 2102400;
    case bscIntegrationTest:
    case bscTestnet:
      return 10512000;
  }
}

exports.tokenName = function (network) {
  switch (network){
    case bscIntegrationTest:
    case bscTestnet: 
      return "ELO";
    default:   
      return "Open Leverage";
  }
}

exports.tokenSymbol = function (network) {
  switch (network){
    case bscIntegrationTest:
    case bscTestnet: 
      return "ELO"
    default: 
      return "OLE";
  }
}

exports.getWChainToken = function (network) {
  switch (network){
    case kovan:
    case ethIntegrationTest: 
      //WETH9
      return "0xd0A1E359811322d97991E03f863a0C30C2cF029C";
    case bscIntegrationTest:
      return "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
    case bscTestnet:
      return "0x094616f0bdfb0b526bd735bf66eca0ad254ca81f";
    default: 
      return zeroAddress;
  }  
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

exports.getUniV2DexData = function (network){
  switch (network){
    case kovan:
    case ethIntegrationTest: 
      //WETH9
      return "0x01";
    case bscIntegrationTest:
    case bscTestnet:
      return "0x03";
    default: 
      return zeroAddress;
  }  
}

// const UniswapV2Router = artifacts.require("IUniswapV2Router");
// const uniRouterV2Address_kovan = exports.uniRouterV2Address_kovan = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";

// exports.createUniPair_kovan = async (token0, token1, account, amount) => {
//   console.log("starting create pair ", await token0.name(), '-', await token1.name())
//   let router = await UniswapV2Router.at(uniRouterV2Address_kovan);
//   await token0.approve(uniRouterV2Address_kovan, amount);
//   await token1.approve(uniRouterV2Address_kovan, amount);
//   let transaction = await router.addLiquidity(token0.address, token1.address, amount, amount,
//     amount, amount, account, amount);
//   console.log("finished create pair ", await token0.name(), '-', await token1.name(), ",tx=", transaction.tx);
//   return router;
// }
