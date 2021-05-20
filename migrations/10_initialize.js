const OpenLevV1 = artifacts.require("OpenLevDelegator");
const ControllerV1 = artifacts.require("ControllerDelegator");
const Gov = artifacts.require("GovernorAlpha");
const Timelock = artifacts.require("Timelock");
const LToken = artifacts.require("OLEToken");
const Reserve = artifacts.require("Reserve");
const TreasuryDelegator = artifacts.require("TreasuryDelegator");
// const ERC20 = artifacts.require("MockERC20");
const USDTToken = artifacts.require("USDTToken");
const PriceOracleV2 = artifacts.require("PriceOracleV2");

const OpenLevFarmingPool = artifacts.require("FarmingPool");

const utils = require("./util");
const m = require('mocha-logger');

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  await Promise.all([
    // await initializeController(accounts),
    //  await initializeToken(accounts),
    // await initializeFarmings(accounts),
    //  await initializeAdmin(accounts),
    await initializeLenderPool(accounts, network),
    // await releasePower2Gov(accounts),
    await loggerInfo()
  ]);
  m.log("initialize finished......");

};

/**
 *初始化controller
 */
async function initializeController(accounts) {
  let controller = await ControllerV1.at(ControllerV1.address);
  m.log("waiting controller setOpenLev......");
  await controller.setOpenLev(OpenLevV1.address);
}

let totalSupply = toBN(6000000).mul(toBN(1e18));

/**
 *代币分发
 */
async function initializeToken(accounts) {
  let lToken = await LToken.at(LToken.address);
  // //33% to reserve
  // let token2Reserve = totalSupply.div(toBN(100)).mul(toBN(33));
  // m.log("waiting transfer to reserve......");
  // await lToken.transfer(Reserve.address, token2Reserve);
  //62.25% to controller
  let token2Controller = totalSupply.div(toBN(10000)).mul(toBN(6225));
  m.log("waiting transfer to controller......");
  await lToken.transfer(ControllerV1.address, token2Controller);
  m.log("waiting controller setOpenLevTokenDistribution......");
  let controller = await ControllerV1.at(ControllerV1.address);
  await controller.setOLETokenDistribution(
    totalSupply.div(toBN(1000)).mul(toBN(45)),
    totalSupply.div(toBN(1000)).mul(toBN(45)).div(toBN(1000)),
    totalSupply.div(toBN(10000)).mul(toBN(5775))
  );
  //1% to developer

  //14% to team

  //6% to angel-A

  //5% to series-A

}

/**
 *初始化farming
 */
async function initializeFarmings(accounts) {
  //3.3% to dex Lps
  let lvr2dexFarming = totalSupply.div(toBN(1000)).mul(toBN(3));
  m.log("waiting initialize Farming FEI - WETH......");
  await initializeFarming(accounts, "0xc88d8b45603acaD57eb261EeD6E385A5C7478410", lvr2dexFarming);
  m.log("waiting initialize Farming XOR - WETH......");
  await initializeFarming(accounts, "0x86e30b33c8E474bd4a22F03D9FA3507D579648E8", lvr2dexFarming);
  m.log("waiting initialize Farming UNI - WETH......");
  await initializeFarming(accounts, "0x9AC15b8bfb029456F506ed0d70979b755586A453", lvr2dexFarming);
  m.log("waiting initialize Farming DPI - WETH......");
  await initializeFarming(accounts, "0xA796A142f5fb066EfB40EC5c578F3bd22BC3D3A9", lvr2dexFarming);
  m.log("waiting initialize Farming RAI - WETH......");
  await initializeFarming(accounts, "0xC5188450257e971abA0ab7EA7E33e0A95B5F1CFC", lvr2dexFarming);
  m.log("waiting initialize Farming WISE - WETH......");
  await initializeFarming(accounts, "0x9547B9eaF0801779C2CEC0494f8CD1f07e95e213", lvr2dexFarming);
  m.log("waiting initialize Farming CORE - WETH......");
  await initializeFarming(accounts, "0xB4fc47bc76549661DC9ecEDeF1469e25B8748998", lvr2dexFarming);
  m.log("waiting initialize Farming USDT - WETH......");
  await initializeFarming(accounts, "0xCb4f5eAAA78E37C891a71703436C456589A7E18a", lvr2dexFarming);
  m.log("waiting initialize Farming WBTC - WETH......");
  await initializeFarming(accounts, "0x492240481Cfd376746F881cB411225CfAc5364ca", lvr2dexFarming);
  m.log("waiting initialize Farming DAI - USDT......");
  await initializeFarming(accounts, "0x28962292D9348bdb0845a51096B44feC83cBB861", lvr2dexFarming);
  m.log("waiting initialize Farming Frax - USDC......");
  await initializeFarming(accounts, "0x3940a85D7082c43D4C1aEB2B8a988a10BA6e9787", lvr2dexFarming);
  //7.5% to LVR-ETH Lps
  m.log("waiting initialize Farming Leverage - WETH......");
  await initializeFarming(accounts, "0x804e8f3d86076222653c4BC2b36Efac2b906E182", totalSupply.div(toBN(1000)).mul(toBN(75)));

}

async function initializeFarming(accounts, farmingAddr, reward) {
  let lvrFarming = await OpenLevFarmingPool.at(farmingAddr);
  let lToken = await LToken.at(LToken.address);
  m.log("waiting transfer OLE to farming......");
  await lToken.transfer(farmingAddr, reward);
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
 *admin 权限
 */
async function initializeAdmin(accounts) {
  let lToken = await LToken.at(LToken.address);
  m.log("waiting lToken setPendingAdmin......");
  await lToken.setPendingAdmin(Timelock.address);
  m.log("waiting lToken acceptAdmin......");
  await lToken.acceptAdmin();

  let reserve = await Reserve.at(Reserve.address);
  m.log("waiting reserve setPendingAdmin......");
  await reserve.setPendingAdmin(Timelock.address);
  m.log("waiting reserve acceptAdmin......");
  await reserve.acceptAdmin();

  let treasury = await TreasuryDelegator.at(TreasuryDelegator.address);
  m.log("waiting treasury setPendingAdmin......");
  await treasury.setPendingAdmin(Timelock.address);
  m.log("waiting treasury acceptAdmin......");
  await treasury.acceptAdmin();

  let controller = await ControllerV1.at(ControllerV1.address);
  m.log("waiting controller setPendingAdmin......");
  await controller.setPendingAdmin(Timelock.address);
  m.log("waiting controller acceptAdmin......");
  await controller.acceptAdmin();

  let openLev = await OpenLevV1.at(OpenLevV1.address);
  m.log("waiting openLev setPendingAdmin......");
  await openLev.setPendingAdmin(Timelock.address);
  m.log("waiting openLev acceptAdmin......");
  await openLev.acceptAdmin();
}

/**
 *初始化Lender pool
 */
async function initializeLenderPool(accounts, network) {
  m.log("waiting controller create FEI - WETH market ......");
  await intializeMarket(accounts, network, '0x4E9d5268579ae76f390F232AEa29F016bD009aAB', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 1001);
  m.log("waiting controller create XOR - WETH market ......");
  await intializeMarket(accounts, network, '0xcc00A6ecFe6941EabF4E97EcB717156dA47FFc81', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 1001);
  m.log("waiting controller create UNI - WETH market ......");
  await intializeMarket(accounts, network, '0xD728EBbe962f88C78136C79b65E4846e2B24159A', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 1001);
  m.log("waiting controller create DPI - WETH market ......");
  await intializeMarket(accounts, network, '0x541cCcc83234Cc315d0489d701Ab7A4BA5D9F70C', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 1001);
  m.log("waiting controller create RAI - WETH market ......");
  await intializeMarket(accounts, network, '0xF1132a849bA8752DC22aC6245Dc4a5489590990f', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 1001);
  m.log("waiting controller create WISE - WETH market ......");
  await intializeMarket(accounts, network, '0x8deA6203B4EE086d8fd7C0618999e4c22e57df01', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 1001);
  m.log("waiting controller create CORE - WETH market ......");
  await intializeMarket(accounts, network, '0x0a27F9fb4Ea453c1f1d591472D3F113Fb46b746e', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 1001);
  m.log("waiting controller create WETH - USDT  market ......");
  await intializeMarket(accounts, network, '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', '0xf894289F63B0b365485cEe34aa50681f295F84b4', 1001);
  m.log("waiting controller create WBTC - WETH market ......");
  await intializeMarket(accounts, network, '0x9278bf26744D3C98B8f24809Fe8EA693b9aA4cF6', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 1001);
  m.log("waiting controller create DAI - USDT market ......");
  await intializeMarket(accounts, network, '0x5C95482B5962b6c3D2d47DC4a3FD7173E99853b0', '0xf894289F63B0b365485cEe34aa50681f295F84b4', 1001);
  m.log("waiting controller create Frax - USDC market ......");
  await intializeMarket(accounts, network, '0x88128f0c48a2F6181b6Be1759Fc6724b8e314CAe', '0x7A8BD2583a3d29241da12DD6f3ae88e92a538144', 1001);
  m.log("waiting controller create OLE - WETH market ......");
  await intializeMarket(accounts, network, '0x83C384052EcA243b41f491dDce52A47D0024db8b', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 1001);
}

async function intializeMarket(accounts, network, token0, token1, marginLimit) {
  let controller = await ControllerV1.at(ControllerV1.address);
  let tl = await Timelock.at(Timelock.address);

  let transaction = await controller.createLPoolPair(token0, token1, marginLimit);
  let pool0 = transaction.logs[0].args.pool0;
  let pool1 = transaction.logs[0].args.pool1;
  m.log("pool0=", pool0.toLowerCase());
  m.log("pool1=", pool1.toLowerCase());
  let lpoolDistDuration = 6 * 30 * 24 * 60 * 60 + '';//6 month
  let supplyAmount = toBN(40000).mul(toBN(1e18));
  let borrowAmount = toBN(30000).mul(toBN(1e18));

  m.log("waiting controller distributeRewards2Pool to pool0......");
  let lpoolStartTime = utils.getLpoolStartTime();
  await tl.executeTransaction(ControllerV1.address, 0, 'distributeRewards2Pool(address,uint256,uint256,uint64,uint64)',
    web3.eth.abi.encodeParameters(['address', 'uint256', 'uint256', 'uint64', 'uint64'],
      [pool0, supplyAmount, borrowAmount, lpoolStartTime, lpoolDistDuration]), 0);
  m.log("waiting controller distributeRewards2Pool to pool1......");
  await tl.executeTransaction(ControllerV1.address, 0, 'distributeRewards2Pool(address,uint256,uint256,uint64,uint64)',
    web3.eth.abi.encodeParameters(['address', 'uint256', 'uint256', 'uint64', 'uint64'],
      [pool1, supplyAmount, borrowAmount, lpoolStartTime, lpoolDistDuration]), 0);
}

/**
 *gov 权限
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
  m.log("LToken.address=", LToken.address.toLowerCase());
  m.log("USDTToken.address=", USDTToken.address.toLowerCase());
  m.log("Gov.address=", Gov.address.toLowerCase());
  m.log("Timelock.address=", Timelock.address.toLowerCase());
  m.log("Treasury.address=", TreasuryDelegator.address.toLowerCase());
  m.log("ControllerV1.address=", ControllerV1.address.toLowerCase());
  m.log("PriceOracleV2.address=", PriceOracleV2.address.toLowerCase());
  m.log("OpenLevV1.address=", OpenLevV1.address.toLowerCase());
  m.log("LVRFarmingPool.address=", OpenLevFarmingPool.address.toLowerCase());

}

function toBN(bn) {
  return web3.utils.toBN(bn);
}


