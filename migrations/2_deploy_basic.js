const OLEToken = artifacts.require("OLEToken");
const xOLE = artifacts.require("XOLE");
const xOLEDelegator = artifacts.require("XOLEDelegator");
const EthDexAggregatorV1 = artifacts.require("EthDexAggregatorV1");
const ArbitrumDexAggregatorV1 = artifacts.require("ArbitrumDexAggregatorV1");
const BscDexAggregatorV1 = artifacts.require("BscDexAggregatorV1");
const KccDexAggregatorV1 = artifacts.require("KccDexAggregatorV1");
const CronosDexAggregatorV1 = artifacts.require("CronosDexAggregatorV1");
const DexAggregatorDelegator = artifacts.require("DexAggregatorDelegator");
const Gov = artifacts.require("GovernorAlpha");
const QueryHelper = artifacts.require("QueryHelper");
const BatchQueryHelper = artifacts.require("BatchQueryHelper");
const Timelock = artifacts.require("Timelock");
const ControllerV1 = artifacts.require("ControllerV1");
const ControllerDelegator = artifacts.require("ControllerDelegator");
const LPool = artifacts.require("LPool");
const LTimePool = artifacts.require("LTimePool");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevV1Lib = artifacts.require("OpenLevV1Lib");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");
const Airdrop = artifacts.require("Airdrop");
const LPoolDepositor = artifacts.require("LPoolDepositor");
const LPoolDepositorDelegator = artifacts.require("LPoolDepositorDelegator")
const Reserve = artifacts.require("Reserve");
const utils = require("./util");
const m = require('mocha-logger');

module.exports = async function (deployer, network, accounts) {
    if (utils.isSkip(network)) {
        return;
    }
    m.log("is equal ......");
    m.log(network == utils.arbitrumMainnet);
    let adminAccount = accounts[0];
    let dev = accounts[0];
    let weth9 = utils.getWChainToken(network);
    //timeLock
    await deployer.deploy(Timelock, adminAccount, (3 * 60) + "", utils.deployOption(accounts));
    let adminCtr = Timelock.address;
    //ole
    let oleAddr;
    switch (network) {
        case utils.bscIntegrationTest:
        case utils.bscTestnet:
            oleAddr = '0xa865197a84e780957422237b5d152772654341f3';
            break;
        case utils.kccMainnet:
            oleAddr = '0x1ccca1ce62c62f7be95d4a67722a8fdbed6eecb4';
            break;
        case utils.cronosMainnet:
            oleAddr = '0x97a21A4f05b152a5D3cDf6273EE8b1d3D8fa8E40';
            break;
        case utils.arbitrumMainnet:
            oleAddr = '0xD4d026322C88C2d49942A75DfF920FCfbC5614C1';
            break;
        default:
            await deployer.deploy(OLEToken, adminAccount, adminCtr, utils.tokenName(network), utils.tokenSymbol(network), utils.deployOption(accounts));
            oleAddr = OLEToken.address;
    }

    //queryHelper
    await deployer.deploy(QueryHelper, utils.deployOption(accounts));
    await deployer.deploy(BatchQueryHelper, utils.deployOption(accounts));
    //airdrop
    await deployer.deploy(Airdrop, oleAddr, utils.deployOption(accounts));
    //dexAgg
    switch (network) {
        case utils.bscIntegrationTest:
        case utils.bscTestnet:
            await deployer.deploy(BscDexAggregatorV1, utils.deployOption(accounts));
            await deployer.deploy(DexAggregatorDelegator, utils.uniswapV2Address(network), utils.uniswapV3Address(network), adminCtr, BscDexAggregatorV1.address, utils.deployOption(accounts));
            break;
        case utils.kccMainnet:
            await deployer.deploy(KccDexAggregatorV1, utils.deployOption(accounts));
            await deployer.deploy(DexAggregatorDelegator, utils.uniswapV2Address(network), utils.uniswapV3Address(network), adminCtr, KccDexAggregatorV1.address, utils.deployOption(accounts));
            break;
        case utils.cronosTest:
        case utils.cronosMainnet:
            await deployer.deploy(CronosDexAggregatorV1, utils.deployOption(accounts));
            await deployer.deploy(DexAggregatorDelegator, utils.uniswapV2Address(network), utils.uniswapV3Address(network), adminCtr, CronosDexAggregatorV1.address, utils.deployOption(accounts));
            break;
        case utils.arbitrumMainnet:
            await deployer.deploy(ArbitrumDexAggregatorV1, utils.deployOption(accounts));
            await deployer.deploy(DexAggregatorDelegator, utils.uniswapV2Address(network), utils.uniswapV3Address(network), adminCtr, ArbitrumDexAggregatorV1.address, utils.deployOption(accounts));
            break;
        default:
            await deployer.deploy(EthDexAggregatorV1, utils.deployOption(accounts));
            await deployer.deploy(DexAggregatorDelegator, utils.uniswapV2Address(network), utils.uniswapV3Address(network), adminCtr, EthDexAggregatorV1.address, utils.deployOption(accounts));
    }

    //xole
    await deployer.deploy(xOLE, utils.deployOption(accounts));
    await deployer.deploy(xOLEDelegator, oleAddr, DexAggregatorDelegator.address, 3000, dev, adminCtr, xOLE.address, utils.deployOption(accounts));
    //gov
    await deployer.deploy(Gov, Timelock.address, xOLEDelegator.address, adminAccount, utils.deployOption(accounts));
    //reserve
    await deployer.deploy(Reserve, adminCtr, oleAddr, utils.deployOption(accounts));
    //controller
    await deployer.deploy(LPool, utils.deployOption(accounts));
    //await deployer.deploy(LTimePool, utils.deployOption(accounts));
    await deployer.deploy(ControllerV1, utils.deployOption(accounts));
    switch (network) {
        case utils.bscIntegrationTest:
        case utils.bscTestnet:
            await deployer.deploy(ControllerDelegator, oleAddr, xOLEDelegator.address, weth9, LPool.address, utils.zeroAddress, DexAggregatorDelegator.address, '0x03', adminCtr, ControllerV1.address, utils.deployOption(accounts));
            break;
        case utils.kccMainnet:
            await deployer.deploy(ControllerDelegator, oleAddr, xOLEDelegator.address, weth9, LPool.address, utils.zeroAddress, DexAggregatorDelegator.address, '0x0d', adminCtr, ControllerV1.address, utils.deployOption(accounts));
            break;
        case utils.cronosTest:
        case utils.cronosMainnet:
            await deployer.deploy(ControllerDelegator, oleAddr, xOLEDelegator.address, weth9, LTimePool.address, utils.zeroAddress, DexAggregatorDelegator.address, '0x14', adminCtr, ControllerV1.address, utils.deployOption(accounts));
            break;
        case utils.arbitrumMainnet:
            await deployer.deploy(ControllerDelegator, oleAddr, xOLEDelegator.address, weth9, LPool.address, utils.zeroAddress, DexAggregatorDelegator.address, '0x04', adminCtr, ControllerV1.address, utils.deployOption(accounts));
            break;
        default:
            await deployer.deploy(ControllerDelegator, oleAddr, xOLEDelegator.address, weth9, LPool.address, utils.zeroAddress, DexAggregatorDelegator.address, '0x02000bb8', adminCtr, ControllerV1.address, utils.deployOption(accounts));
    }
    //openLev
    await deployer.deploy(OpenLevV1Lib);
    await deployer.link(OpenLevV1Lib, OpenLevV1);
    await deployer.deploy(OpenLevV1, utils.deployOption(accounts));
    switch (network) {
        case utils.bscIntegrationTest:
        case utils.bscTestnet:
            await deployer.deploy(OpenLevDelegator, ControllerDelegator.address, DexAggregatorDelegator.address, utils.getDepositTokens(network), weth9, xOLEDelegator.address, [3, 11, 12], adminCtr, OpenLevV1.address, utils.deployOption(accounts));
            break;
        case utils.kccMainnet:
            await deployer.deploy(OpenLevDelegator, ControllerDelegator.address, DexAggregatorDelegator.address, utils.getDepositTokens(network), weth9, xOLEDelegator.address, [13, 14], adminCtr, OpenLevV1.address, utils.deployOption(accounts));
            break;
        case utils.cronosTest:
        case utils.cronosMainnet:
            await deployer.deploy(OpenLevDelegator, ControllerDelegator.address, DexAggregatorDelegator.address, utils.getDepositTokens(network), weth9, xOLEDelegator.address, [20], adminCtr, OpenLevV1.address, utils.deployOption(accounts));
            break;
        case utils.arbitrumMainnet:
            await deployer.deploy(OpenLevDelegator, ControllerDelegator.address, DexAggregatorDelegator.address, utils.getDepositTokens(network), weth9, xOLEDelegator.address, [4, 2, 21], adminCtr, OpenLevV1.address, utils.deployOption(accounts));
            break;
        default:
            await deployer.deploy(OpenLevDelegator, ControllerDelegator.address, DexAggregatorDelegator.address, utils.getDepositTokens(network), weth9, xOLEDelegator.address, [1, 2], adminCtr, OpenLevV1.address, utils.deployOption(accounts));
    }
    //lpoolDepositor
    await deployer.deploy(LPoolDepositor, utils.deployOption(accounts));
    await deployer.deploy(LPoolDepositorDelegator, LPoolDepositor.address, adminCtr, utils.deployOption(accounts));
    //set openLev address
    m.log("Waiting controller setOpenLev......");
    await (await Timelock.at(Timelock.address)).executeTransaction(ControllerDelegator.address, 0, 'setOpenLev(address)', encodeParameters(['address'], [OpenLevDelegator.address]), 0);
    m.log("Waiting dexAgg setOpenLev......");
    await (await Timelock.at(Timelock.address)).executeTransaction(DexAggregatorDelegator.address, 0, 'setOpenLev(address)', encodeParameters(['address'], [OpenLevDelegator.address]), 0);


    if (network == utils.bscIntegrationTest || network == utils.bscTestnet) {
        m.log("Waiting dexAgg set factory ......");
        await (await Timelock.at(Timelock.address)).executeTransaction(DexAggregatorDelegator.address, 0, 'setDexInfo(uint8[],address[],uint16[])',
            encodeParameters(['uint8[]', 'address[]', 'uint16[]'],
                [[11, 12], ['0xbcfccbde45ce874adcb698cc183debcf17952812', '0x86407bea2078ea5f5eb5a52b2caa963bc1f889da'], [20, 20]]), 0);
    } else if (network == utils.kccMainnet) {
        m.log("Waiting dexAgg set factory ......");
        await (await Timelock.at(Timelock.address)).executeTransaction(DexAggregatorDelegator.address, 0, 'setDexInfo(uint8[],address[],uint16[])',
            encodeParameters(['uint8[]', 'address[]', 'uint16[]'],
                [[14], ['0xAE46cBBCDFBa3bE0F02F463Ec5486eBB4e2e65Ae'], [10]]), 0);
    } else if (network == utils.cronosTest || network == utils.cronosMainnet) {
        m.log("Waiting dexAgg set factory ......");
        await (await Timelock.at(Timelock.address)).executeTransaction(DexAggregatorDelegator.address, 0, 'setDexInfo(uint8[],address[],uint16[])',
            encodeParameters(['uint8[]', 'address[]', 'uint16[]'],
                [[20], ['0x3B44B2a187a7b3824131F8db5a74194D0a42Fc15'], [30]]), 0);
    } else if (network == utils.arbitrumMainnet) {
        m.log("Waiting dexAgg set factory ......");
        await (await Timelock.at(Timelock.address)).executeTransaction(DexAggregatorDelegator.address, 0, 'setDexInfo(uint8[],address[],uint16[])',
            encodeParameters(['uint8[]', 'address[]', 'uint16[]'],
                [[4], ['0xc35dadb65012ec5796536bd9864ed8773abc74c4'], [30]]), 0);
    }
};

function encodeParameters(keys, values) {
    return web3.eth.abi.encodeParameters(keys, values);
}

function toWei(bn) {
    return web3.utils.toBN(bn).mul(web3.utils.toBN(1e18));
}


