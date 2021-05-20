"use strict";
const {toBN, maxUint} = require("./EtheUtil");
const LPErc20Delegator = artifacts.require("LPoolDelegator");
const LPErc20Delegate = artifacts.require('LPool');
const Controller = artifacts.require('ControllerV1');
const ControllerDelegator = artifacts.require('ControllerDelegator');
const TestToken = artifacts.require("MockERC20");
const MockUniswapFactory = artifacts.require("MockUniswapFactory");
const UniswapV2Router = artifacts.require("IUniswapV2Router");
const uniRouterV2Address_kovan = exports.uniRouterV2Address_kovan = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
const uniFactoryV2Address_kovan = exports.uniFactoryV2Address_kovan = "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f";
const OpenLevDelegate = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");
const MockPriceOracle = artifacts.require("MockPriceOracle");
const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");
const Treasury = artifacts.require("Treasury");
const Timelock = artifacts.require('Timelock');

const Referral = artifacts.require("Referral");
const ReferralDelegator = artifacts.require("ReferralDelegator");

const m = require('mocha-logger');

exports.createLPoolImpl = async () => {
  return await LPErc20Delegate.new();
}

exports.createController = async (admin, oleToken) => {
  let instance = await Controller.new();
  let controller = await ControllerDelegator.new(oleToken ? oleToken : "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    admin,
    instance.address);
  return controller;
}


exports.createUniswapFactory = async () => {
  return await MockUniswapFactory.new();
}

exports.createToken = async (tokenSymbol) => {
  return await TestToken.new('Test Token: ' + tokenSymbol, tokenSymbol);
}
exports.createPriceOracle = async () => {
  return await MockPriceOracle.new();
}
exports.createPair = async (tokenA, tokenB) => {
  return await MockUniswapV2Pair.new(tokenA, tokenB, 10 * 1e18 + "", 10 * 1e18 + "");
}
exports.tokenAt = async (address) => {
  return await TestToken.at(address);
}
exports.createOpenLev = async (controller, admin, uniswap, terrasury, priceOracle, referral) => {
  let delegate = await OpenLevDelegate.new();
  return await OpenLevDelegator.new(
    controller,
    uniswap ? uniswap : "0x0000000000000000000000000000000000000000",
    terrasury ? terrasury : "0x0000000000000000000000000000000000000000",
    priceOracle ? priceOracle : "0x0000000000000000000000000000000000000000",
    referral ? referral : "0x0000000000000000000000000000000000000000",
    admin,
    delegate.address);
}

exports.createReferral = async (openLev, admin) => {
  let delegate = await Referral.new();
  let referral = await ReferralDelegator.new(openLev ? openLev : "0x0000000000000000000000000000000000000000", admin, delegate.address);
  return referral;
}

exports.createTimelock = async (admin) => {
  let timeLock = await Timelock.new(admin, 180 + '');
  return timeLock;
}

exports.createPool = async (tokenSymbol, controller, admin) => {
  let testToken = await TestToken.new('Test Token: ' + tokenSymbol, tokenSymbol);
  let erc20Delegate = await LPErc20Delegate.new();
  let pool = await LPErc20Delegator.new();
  await pool.initialize(testToken.address,
    controller.address,
    toBN(5e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '',
    1e18 + '',
    'TestPool',
    'TestPool',
    18,
    admin,
    erc20Delegate.address);
  return {
    'token': testToken,
    'controller': controller,
    'pool': pool
  };
}

exports.mint = async (token, to, amount) => {
  await token.mint(to, toBN(amount).mul(toBN(1e18)).toString());
}

exports.createUniPair_kovan = async (token0, token1, account, amount) => {
  let router = await UniswapV2Router.at(uniRouterV2Address_kovan);
  await token0.approve(uniRouterV2Address_kovan, maxUint());
  await token1.approve(uniRouterV2Address_kovan, maxUint());
  await router.addLiquidity(token0.address, token1.address, amount, amount,
    amount.div(toBN(10)), amount.div(toBN(10)), account, maxUint());
  return router;
}

exports.toWei = (amount) => {
  return toBN(1e18).mul(toBN(amount));
}
exports.toETH = (amount) => {
  return toBN(amount).div(toBN(1e18));
}

exports.last8 = function (aString) {
  if (aString != undefined && typeof aString == "string") {
    return ".." + aString.substr(aString.length - 8);
  } else {
    return aString;
  }
}

exports.printBlockNum = async () => {
  m.log("Block number:", await web3.eth.getBlockNumber());
}

exports.checkAmount = (desc, expected, amountBN, decimal) => {
  let actual = amountBN.div(toBN(10 ** decimal));
  m.log(desc, ":", expected / 10 ** decimal);
  assert.equal(expected, amountBN.toString());
}

exports.assertPrint = (desc, expected, value) => {
  m.log(desc, ":", value);
  assert.equal(expected.toString(), value.toString());
}

let currentStep;

exports.resetStep = () => {
  currentStep = 0;
}
exports.step = (desc) => {
  currentStep++;
  m.log("STEP " + currentStep + " - " + desc);
}

function trunc(number, precision) {
  var shift = Math.pow(10, precision)
  return parseInt(number * shift) / shift
}

exports.trunc = trunc;

exports.prettyPrintBalance = function prettyPrintEther(ether) {
  var str;
  if (ether >= 1)
    str = trunc(ether, 3) + "  ether";
  else if (ether > 1e-5)
    str = trunc(ether * 1000, 3) + " finney";
  else if (ether > 1e-7)
    str = trunc(ether * 1000, 6) + " finney";
  else if (ether > 1e-12)
    str = trunc(ether * 1e12, 3) + "   gwei";
  else
    str = parseInt(web3.toWei(ether)) + "    wei";
  return str;
}

exports.now = function () {
  return parseInt(new Date().getTime().toString().substr(0, 10));
}
exports.lastBlockTime = async () => {
  let blockNum = await web3.eth.getBlockNumber();
  return (await web3.eth.getBlock(blockNum)).timestamp;
}
exports.wait = async (second) => {
  m.log("Wait for", second, "seconds");
  await new Promise((resolve => {
    setTimeout(resolve, second * 1000);
  }))
}
exports.createVoteBySigMessage = (govAddress, proposalId, support, chainId) => {
  const types = {
    EIP712Domain: [
      {name: 'name', type: 'string'},
      {name: 'chainId', type: 'uint256'},
      {name: 'verifyingContract', type: 'address'},
    ],
    Ballot: [
      {name: 'proposalId', type: 'uint256'},
      {name: 'support', type: 'bool'}
    ]
  };

  const primaryType = 'Ballot';
  const domain = {name: 'OpenLev Governor Alpha', chainId, verifyingContract: govAddress};
  support = !!support;
  const message = {proposalId, support};

  return JSON.stringify({types, primaryType, domain, message});
};

exports.initEnv = async (admin, dev) => {
  let tokenA = await this.createToken("tokenA");
  let tokenB = await this.createToken("tokenB");
  let oleToken = await this.createToken("Lvr");
  let usdt = await this.createToken("USDT");
  let controller = await this.createController(admin, oleToken.address);
  let uniswapFactory = await this.createUniswapFactory();
  let pair = await this.createPair(tokenA.address, tokenB.address);
  await uniswapFactory.addPair(pair.address);
  let priceOracle = await this.createPriceOracle();
  let treasury = await Treasury.new(controller.address, uniswapFactory.address, oleToken.address, usdt.address, 50, dev);
  let openLev = await OpenLevDelegator.new(controller.address, uniswapFactory.address, treasury.address, priceOracle.address, admin);

  await controller.setOpenLev(openLev.address);
  await controller.setLPoolImplementation((await this.createLPoolImpl()).address);
  await controller.setInterestParam(5e16 + '', 10e16 + '', 20e16 + '', 50e16 + '');
  return {
    controller: controller,
    tokenA: tokenA,
    tokenB: tokenB,
    oleToken: oleToken,
    priceOracle: priceOracle,
    openLev: openLev,
    uniswapFactory: uniswapFactory,
    treasury: treasury
  };
}


exports.assertThrows = async (promise, reason) => {
  try {
    await promise;
  } catch (error) {
    assert(
      error.message.search(reason) >= 0,
      'Expected throw, got \'' + error + '\' instead',
    );
    m.log("Received expected error: ", error.message);
    return;
  }
  assert.fail('Expected throw not received');
}
