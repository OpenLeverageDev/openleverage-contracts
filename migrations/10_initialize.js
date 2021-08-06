const OpenLevV1 = artifacts.require("OpenLevDelegator");
const ControllerV1 = artifacts.require("ControllerDelegator");
const Gov = artifacts.require("GovernorAlpha");
const Timelock = artifacts.require("Timelock");
const OLEToken = artifacts.require("OLEToken");
const Reserve = artifacts.require("Reserve");
const TreasuryDelegator = artifacts.require("TreasuryDelegator");
const OLETokenLock = artifacts.require("OLETokenLock");
const DexAggregatorV1 = artifacts.require("DexAggregatorV1");

const OpenLevFarmingPool = artifacts.require("FarmingPool");

const utils = require("./util");
const m = require('mocha-logger');

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  await Promise.all([
    // await initializeContract(accounts, network),
    // await initializeToken(accounts),
    // await initializeLenderPool(accounts, network),
    // await initializeFarmings(accounts),
    // await releasePower2Gov(accounts),
    //await loggerInfo()
  ]);
  m.log("initialize finished......");

};

/**
 *initializeContract
 */
async function initializeContract(accounts, network) {
  let tl = await Timelock.at(Timelock.address);
  /**
   * Controller
   */
  m.log("waiting controller setOpenLev......");
  await tl.executeTransaction(ControllerV1.address, 0, 'setOpenLev(address)', encodeParameters(['address'], [OpenLevV1.address]), 0);
  m.log("waiting controller setInterestParam......");
  let blocksPerYear = toBN(utils.blocksPerYear(network));
  await tl.executeTransaction(ControllerV1.address, 0, 'setInterestParam(uint256,uint256,uint256,uint256)',
    encodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], [toBN(10e16).div(blocksPerYear), toBN(30e16).div(blocksPerYear), toBN(150e16).div(blocksPerYear), toBN(50e16)]), 0);
  /**
   * OpenLev
   */
  m.log("waiting openLev setReferral......");
  await tl.executeTransaction(OpenLevV1.address, 0, 'setReferral(address)', encodeParameters(['address'], [Referral.address]), 0);
  /**
   * OLEToken
   */
  let oleToken = await OLEToken.at(OLEToken.address);
  m.log("waiting oleToken setPendingAdmin......");
  await oleToken.setPendingAdmin(Timelock.address);
  m.log("waiting oleToken acceptAdmin......");
  await oleToken.acceptAdmin();
  m.log("finished initializeContract......");

}

let totalSupply = toWei(10000000);

/**
 *initializeToken
 */
async function initializeToken(accounts) {
  let tl = await Timelock.at(Timelock.address);
  let oleToken = await OLEToken.at(OLEToken.address);
  // 1% 100000 to reserve
  m.log("waiting transfer to reserve......");
  await oleToken.transfer(Reserve.address, toWei(100000));
  // 30000 to developer
  m.log("waiting transfer to developer lock......");
  await oleToken.transfer(OLETokenLock.address, toWei(30000));
  //50% to controller
  let token2Controller = totalSupply.div(toBN(100)).mul(toBN(50));
  m.log("waiting transfer to controller......");
  await oleToken.transfer(ControllerV1.address, token2Controller);
  m.log("waiting controller setOpenLevTokenDistribution......");
  //50% to liquidator, max 100 OLE reward once, 3X gas fee, 50% to trader&lends
  await tl.executeTransaction(ControllerV1.address, 0, 'setOLETokenDistribution(uint256,uint256,uint256,uint256)',
    encodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], [totalSupply.div(toBN(100)).mul(toBN(50)).div(toBN(2)),
      toWei(100),
      toBN(300),
      totalSupply.div(toBN(100)).mul(toBN(50)).div(toBN(2))]), 0);

}


/**
 *initializeLenderPool
 */
async function initializeLenderPool(accounts, network) {
  m.log("waiting controller create FEI - WETH market ......");
  await intializeMarket(accounts, network, '0x4E9d5268579ae76f390F232AEa29F016bD009aAB', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
  m.log("waiting controller create XOR - WETH market ......");
  await intializeMarket(accounts, network, '0xcc00A6ecFe6941EabF4E97EcB717156dA47FFc81', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
  m.log("waiting controller create UNI - WETH market ......");
  await intializeMarket(accounts, network, '0xD728EBbe962f88C78136C79b65E4846e2B24159A', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
  m.log("waiting controller create DPI - WETH market ......");
  await intializeMarket(accounts, network, '0x541cCcc83234Cc315d0489d701Ab7A4BA5D9F70C', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
  m.log("waiting controller create RAI - WETH market ......");
  await intializeMarket(accounts, network, '0xF1132a849bA8752DC22aC6245Dc4a5489590990f', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
  m.log("waiting controller create WISE - WETH market ......");
  await intializeMarket(accounts, network, '0x8deA6203B4EE086d8fd7C0618999e4c22e57df01', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
  m.log("waiting controller create CORE - WETH market ......");
  await intializeMarket(accounts, network, '0x0a27F9fb4Ea453c1f1d591472D3F113Fb46b746e', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
  m.log("waiting controller create WETH - USDT  market ......");
  await intializeMarket(accounts, network, '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', '0xf894289F63B0b365485cEe34aa50681f295F84b4', 3000);
  m.log("waiting controller create WBTC - WETH market ......");
  await intializeMarket(accounts, network, '0x9278bf26744D3C98B8f24809Fe8EA693b9aA4cF6', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
  m.log("waiting controller create DAI - USDT market ......");
  await intializeMarket(accounts, network, '0x5C95482B5962b6c3D2d47DC4a3FD7173E99853b0', '0xf894289F63B0b365485cEe34aa50681f295F84b4', 3000);
  m.log("waiting controller create Frax - USDC market ......");
  await intializeMarket(accounts, network, '0x88128f0c48a2F6181b6Be1759Fc6724b8e314CAe', '0x7A8BD2583a3d29241da12DD6f3ae88e92a538144', 3000);
  m.log("waiting controller create OLE - WETH market ......");
  await intializeMarket(accounts, network, OLEToken.address, '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
}

async function intializeMarket(accounts, network, token0, token1, marginLimit) {
  let controller = await ControllerV1.at(ControllerV1.address);
  let openLev = await OpenLevV1.at(OpenLevV1.address);

  let tl = await Timelock.at(Timelock.address);
  let numPairs = await openLev.numPairs();
  let transaction = await controller.createLPoolPair(token0, token1, marginLimit);
  let pool0 = transaction.logs[0].args.pool0;
  let pool1 = transaction.logs[0].args.pool1;
  m.log("pool0=", pool0.toLowerCase());
  m.log("pool1=", pool1.toLowerCase());
  let lpoolDistDuration = 3 * 30 * 24 * 60 * 60 + '';//3 month
  let supplyAmount = toWei(40000);
  let borrowAmount = toWei(30000);
  m.log("waiting controller distributeRewards2Pool to pool0......");
  let lpoolStartTime = utils.getLpoolStartTime();
  await tl.executeTransaction(ControllerV1.address, 0, 'distributeRewards2Pool(address,uint256,uint256,uint64,uint64)',
    encodeParameters(['address', 'uint256', 'uint256', 'uint64', 'uint64'],
      [pool0, supplyAmount, borrowAmount, lpoolStartTime, lpoolDistDuration]), 0);

  m.log("waiting controller distributeRewards2Pool to pool1......");
  await tl.executeTransaction(ControllerV1.address, 0, 'distributeRewards2Pool(address,uint256,uint256,uint64,uint64)',
    encodeParameters(['address', 'uint256', 'uint256', 'uint64', 'uint64'],
      [pool1, supplyAmount, borrowAmount, lpoolStartTime, lpoolDistDuration]), 0);

  m.log("waiting controller distributeLiqRewards2Market to market......");
  await tl.executeTransaction(ControllerV1.address, 0, 'distributeLiqRewards2Market(uint256,bool)',
    encodeParameters(['uint256', 'bool'],
      [numPairs, true]), 0);
}

/**
 *initializeFarmings
 */
async function initializeFarmings(accounts) {
  //3.3% to dex Lps
  let lvr2dexFarming = totalSupply.div(toBN(1000)).mul(toBN(3));
  m.log("waiting initialize Farming FEI - WETH......");
  await initializeFarming(accounts, "0x042aCCE28AD358BB0E1D7E220DcDd89bF790d257", lvr2dexFarming);
  m.log("waiting initialize Farming XOR - WETH......");
  await initializeFarming(accounts, "0xDD95A778a7242BC57245096764c6d15ecBe5Ef6A", lvr2dexFarming);
  m.log("waiting initialize Farming UNI - WETH......");
  await initializeFarming(accounts, "0x7f930B4888ACf1DC4434CFDb124337D3daB470AB", lvr2dexFarming);
  m.log("waiting initialize Farming DPI - WETH......");
  await initializeFarming(accounts, "0xC11cE0176021140b197bf6Aa3deabfb2a055ce73", lvr2dexFarming);
  m.log("waiting initialize Farming RAI - WETH......");
  await initializeFarming(accounts, "0xC6965B349Bb77553eCe9287a0f9EdeDAe22733a5", lvr2dexFarming);
  m.log("waiting initialize Farming WISE - WETH......");
  await initializeFarming(accounts, "0xEd0d17557fF91E8350Ec8289818905f6cDBf5784", lvr2dexFarming);
  m.log("waiting initialize Farming CORE - WETH......");
  await initializeFarming(accounts, "0x73806773911a8009e4495044542B42a06C3F24Dc", lvr2dexFarming);
  m.log("waiting initialize Farming USDT - WETH......");
  await initializeFarming(accounts, "0xEcD196F51008911C758aFA6c3dc4BbA298f6423C", lvr2dexFarming);
  m.log("waiting initialize Farming WBTC - WETH......");
  await initializeFarming(accounts, "0x3d7c73F5c816286aEb28f822F7A3166752331602", lvr2dexFarming);
  m.log("waiting initialize Farming DAI - USDT......");
  await initializeFarming(accounts, "0xc035464960B933F2C501b049a6Bd4A0745f869bf", lvr2dexFarming);
  m.log("waiting initialize Farming Frax - USDC......");
  await initializeFarming(accounts, "0xe2ea227D34E54B787E082fbA8b9d8487F5dB5Eb8", lvr2dexFarming);
  //7.5% to LVR-ETH Lps
  m.log("waiting initialize Farming Leverage - WETH......");
  await initializeFarming(accounts, "0x327EA92cb865CD57346E0E51E4002479d018133F", totalSupply.div(toBN(1000)).mul(toBN(5)));

}

async function initializeFarming(accounts, farmingAddr, reward) {
  let lvrFarming = await OpenLevFarmingPool.at(farmingAddr);
  let oleToken = await OLEToken.at(OLEToken.address);
  m.log("waiting transfer OLE to farming......");
  await oleToken.transfer(farmingAddr, reward);
  m.log("waiting Farming setRewardDistribution to account[0]......");
  await lvrFarming.setRewardDistribution(accounts[0]);
  m.log("waiting Farming notifyRewardAmount......");
  await lvrFarming.notifyRewardAmount(reward);
  m.log("waiting Farming setRewardDistribution to tl......");
  await lvrFarming.setRewardDistribution(Timelock.address);
  m.log("waiting Farming transferOwnership......");
  await lvrFarming.transferOwnership(Timelock.address);

}

/**
 *releasePower2Gov
 */
async function releasePower2Gov(accounts) {
  let tl = await Timelock.at(Timelock.address);
  let gov = await Gov.at(Gov.address);
  m.log("waiting tl setPendingAdmin......");
  await tl.setPendingAdmin(Gov.address);
  m.log("waiting gov __acceptAdmin......");
  await gov.__acceptAdmin();
  m.log("waiting gov __abdicate......");
  await gov.__abdicate();
}

async function loggerInfo() {
  m.log("OLEToken.address=", OLEToken.address.toLowerCase());
  m.log("Gov.address=", Gov.address.toLowerCase());
  m.log("Timelock.address=", Timelock.address.toLowerCase());
  m.log("Treasury.address=", TreasuryDelegator.address.toLowerCase());
  m.log("ControllerV1.address=", ControllerV1.address.toLowerCase());
  m.log("OpenLevV1.address=", OpenLevV1.address.toLowerCase());
  m.log("LVRFarmingPool.address=", OpenLevFarmingPool.address.toLowerCase());
  m.log("Reserve.address=", Reserve.address.toLowerCase());
  m.log("OLETokenLock.address=", OLETokenLock.address.toLowerCase());
  m.log("DexAggregatorV1.address=", DexAggregatorV1.address.toLowerCase());
}

function toBN(bn) {
  return web3.utils.toBN(bn);
}

function toWei(bn) {
  return web3.utils.toBN(bn).mul(toBN(1e18));
}

function encodeParameters(keys, values) {
  return web3.eth.abi.encodeParameters(keys, values);
}


