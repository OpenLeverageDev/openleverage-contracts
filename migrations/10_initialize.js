const ControllerV1 = artifacts.require("ControllerV1");
const ControllerDelegator = artifacts.require("ControllerDelegator")
const Gov = artifacts.require("GovernorAlpha");
const Timelock = artifacts.require("Timelock");

const utils = require("./util");
const m = require('mocha-logger');

module.exports = async function (deployer, network, accounts) {
    if (utils.isSkip(network)) {
        return;
    }
    await Promise.all([
        await initializeContract(accounts, network),
        await initializeLenderPool(accounts, network),
        // await releasePower2Gov(accounts),
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
    m.log("Waiting controller setInterestParam......");
    let blocksPerYear = toBN(utils.blocksPerYear(network));
    await tl.executeTransaction(ControllerDelegator.address, 0, 'setInterestParam(uint256,uint256,uint256,uint256)',
        encodeParameters(['uint256', 'uint256', 'uint256', 'uint256'], [toBN(30e16).div(blocksPerYear), toBN(30e16).div(blocksPerYear), toBN(160e16).div(blocksPerYear), toBN(70e16)]), 0);
}


/**
 *initializeToken
 */
async function initializeToken(accounts) {

}


/**
 *initializeLenderPool
 */
async function initializeLenderPool(accounts, network) {

    switch (network) {
        case utils.kovan:
            m.log("waiting controller create FEI - WETH market ......");
            await intializeMarket(accounts, network, '0x4E9d5268579ae76f390F232AEa29F016bD009aAB', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3000);
            m.log("waiting controller create XOR - WETH market ......");
            await intializeMarket(accounts, network, '0xcc00A6ecFe6941EabF4E97EcB717156dA47FFc81', '0xC58854ce3a7d507b1CA97Fa7B28A411956c07782', 3100);
            m.log("waiting controller create USDC - WETH9 market ......");
            await intializeMarket(accounts, network, '0x7a8bd2583a3d29241da12dd6f3ae88e92a538144', '0xd0a1e359811322d97991e03f863a0c30c2cf029c', 3300, "0x02002710");
            break;
        case utils.mainnet:
            m.log("waiting controller create MPL/USDC market ......");
            await intializeMarket(accounts, network, '0x33349b282065b0284d756f0577fb39c158f935e6', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 2500);
            m.log("waiting controller create ETH/USDC market ......");
            await intializeMarket(accounts, network, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 2500, "0x02000bb8");
            break;
        case utils.bscIntegrationTest:

            // m.log("waiting controller create WBNB - BUSD market ......");
            // await intializeMarket(accounts, network, '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', '0xe9e7cea3dedca5984780bafc599bd69add087d56', 3000);
            m.log("waiting controller create DXCT - BUSD market ......");
            await intializeMarket(accounts, network, '0x5b1baec64af6dc54e6e04349315919129a6d3c23', '0xe9e7cea3dedca5984780bafc599bd69add087d56', 3000, '0x03');
            m.log("waiting controller create HERO - WBNB market ......");
            await intializeMarket(accounts, network, '0xd40bedb44c081d2935eeba6ef5a3c8a31a1bbe13', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 3000, '0x03');
            m.log("waiting controller create BCOIN - WBNB market ......");
            await intializeMarket(accounts, network, '0x00e1656e45f18ec6747f5a8496fd39b50b38396d', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 3000, '0x03');
            m.log("waiting controller create IPAD - BUSD market ......");
            await intializeMarket(accounts, network, '0xf07dfc2ad28ab5b09e8602418d2873fcb95e1744', '0xe9e7cea3dedca5984780bafc599bd69add087d56', 3000, '0x03');
            m.log("waiting controller create ORKL - WBNB market ......");
            await intializeMarket(accounts, network, '0x36bc1f4d4af21df024398150ad39627fb2c8a847', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 3000, '0x03');
            m.log("waiting controller create METIS - WBNB market ......");
            await intializeMarket(accounts, network, '0xe552fb52a4f19e44ef5a967632dbc320b0820639', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 3000, '0x03');
            m.log("waiting controller create IDIA - BUSD market ......");
            await intializeMarket(accounts, network, '0x0b15ddf19d47e6a86a56148fb4afffc6929bcb89', '0xe9e7cea3dedca5984780bafc599bd69add087d56', 3000, '0x03');
            m.log("waiting controller create ITAM - WBNB market ......");
            await intializeMarket(accounts, network, '0x04c747b40be4d535fc83d09939fb0f626f32800b', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 3000, '0x03');
            m.log("waiting controller create THC - WBNB market ......");
            await intializeMarket(accounts, network, '0x24802247bd157d771b7effa205237d8e9269ba8a', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 3000, '0x03');
            m.log("waiting controller create TMT - BUSD market ......");
            await intializeMarket(accounts, network, '0x4803ac6b79f9582f69c4fa23c72cb76dd1e46d8d', '0xe9e7cea3dedca5984780bafc599bd69add087d56', 3000, '0x03');
            m.log("waiting controller create XVS - WBNB market ......");
            await intializeMarket(accounts, network, '0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 3000, '0x03');
            m.log("waiting controller create CAKE - WBNB market ......");
            await intializeMarket(accounts, network, '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 3000, '0x03');
            break;
        case utils.kccMainnet:
            m.log("waiting controller create MJT - KSC market ......");
            await intializeMarket(accounts, network, '0x2ca48b4eea5a731c2b54e7c3944dbdb87c0cfb6f', '0x4446fc4eb47f2f6586f9faab68b3498f86c07521', 3000, '0x0d00000002');
            m.log("waiting controller create KSC - KUS market ......");
            await intializeMarket(accounts, network, '0x4446fc4eb47f2f6586f9faab68b3498f86c07521', '0x4a81704d8c16d9fb0d7f61b747d0b5a272badf14', 3000, '0x0e00000002');
            break;
    }
}

async function intializeMarket(accounts, network, token0, token1, marginLimit, dexData) {
    let controller = await ControllerV1.at(ControllerDelegator.address);
    let transaction = await controller.createLPoolPair(token0, token1, marginLimit, dexData == undefined ? utils.getUniV2DexData(network) : dexData);
    let pool0 = transaction.logs[0].args.pool0;
    let pool1 = transaction.logs[0].args.pool1;
    m.log("pool0=", pool0.toLowerCase());
    m.log("pool1=", pool1.toLowerCase());
}

/**
 *initializeFarmings
 */
async function initializeFarmings(accounts) {

}

async function initializeFarming(accounts, farmingAddr, reward) {

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


function toBN(bn) {
    return web3.utils.toBN(bn);
}

function toWei(bn) {
    return web3.utils.toBN(bn).mul(toBN(1e18));
}

function encodeParameters(keys, values) {
    return web3.eth.abi.encodeParameters(keys, values);
}


