const {toBN} = require('./utils/EtheUtil');
const util = require('./utils/OpenLevUtil');


const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");
const MockUniswapFactory = artifacts.require("MockUniswapFactory");
const MockERC20 = artifacts.require("MockERC20");
const PriceOracleV2 = artifacts.require("PriceOracleV2");


const m = require('mocha-logger');

const timeMachine = require('ganache-time-traveler');

contract("PriceOracleV2", async accounts => {


    it('Price oracle,  0 > 1', async () => {

        let token0 = await createToken();
        let token1 = await createToken();

        let uniFactory = await createUniswap(token0, token1, util.toWei(10000), util.toWei(100));

        let priceOracle = await PriceOracleV2.new(uniFactory.address);

        let priceResult = await priceOracle.getPrice(token0.address, token1.address);

        let oneResult = priceResult[0];
        let twoResult = priceResult[1];
        m.log("Query results:", oneResult.toString())
        m.log("Query results:", twoResult.toString())
        assert.equal(0.01, oneResult.toString() / 10000000000);

    });


    it('Price oracle,  0 = 1', async () => {

        let token0 = await createToken();
        let token1 = await createToken();

        let uniFactory = await createUniswap(token0, token1, util.toWei(100), util.toWei(100));

        let priceOracle = await PriceOracleV2.new(uniFactory.address);

        let priceResult = await priceOracle.getPrice(token0.address, token1.address);

        let oneResult = priceResult[0];
        let twoResult = priceResult[1];
        m.log("Query results:", oneResult.toString())
        m.log("Query results:", twoResult.toString())
        assert.equal(1, oneResult.toString() / 10000000000);

    });


    it('Price oracle,  0 < 1', async () => {

        let token0 = await createToken();
        let token1 = await createToken();

        let uniFactory = await createUniswap(token0, token1, util.toWei(100), util.toWei(1000));
        let priceOracle = await PriceOracleV2.new(uniFactory.address);
        let priceResult = await priceOracle.getPrice(token0.address, token1.address);

        let oneResult = priceResult[0];
        let twoResult = priceResult[1];
        m.log("Query results:", oneResult.toString())
        m.log("Query results:", twoResult.toString())
        assert.equal(10, oneResult.toString() / 10000000000);

    });


    it('price oracle,  firstParam = 3 ', async () => {

        let token0 = await createToken();
        let token1 = await createToken();

        let uniFactory = await createUniswap(token0, token1, util.toWei(3), util.toWei(1000));
        let priceOracle = await PriceOracleV2.new(uniFactory.address);
        let priceResult = await priceOracle.getPrice(token0.address, token1.address);

        let oneResult = priceResult[0];
        let twoResult = priceResult[1];
        m.log("Query results: ", oneResult.toString());
        m.log("Query results: ", twoResult.toString());
        assert.equal(333.3333333333, oneResult.toString() / 10000000000);

    });


    it('Price oracle,  firstParam = 3  reversal', async () => {

        let token0 = await createToken();
        let token1 = await createToken();

        let uniFactory = await createUniswap(token0, token1, util.toWei(3), util.toWei(1000));
        let priceOracle = await PriceOracleV2.new(uniFactory.address);
        let priceResult = await priceOracle.getPrice(token1.address, token0.address);
        let oneResult = priceResult[0];
        let twoResult = priceResult[1];
        m.log("Query results 1", oneResult.toString());
        m.log("Query results 2", twoResult.toString());
        assert.equal(0.003, oneResult.toString() / 10000000000);

    });


    it('Price oracle,  firstParam = 1111111111 ', async () => {

        let token0 = await createToken();
        let token1 = await createToken();

        let uniFactory = await createUniswap(token0, token1, util.toWei(11111111111), util.toWei(1));
        let priceOracle = await PriceOracleV2.new(uniFactory.address);
        let priceResult = await priceOracle.getPrice(token0.address, token1.address);

        let oneResult = priceResult[0];
        let twoResult = priceResult[1];
        m.log("Query results 1", oneResult.toString())
        m.log("Query results 2", twoResult.toString())
        assert.equal(0, oneResult.toString() / 10000000000);

    });

    it('Price oracle,  firstParam = 1111111111  reversal', async () => {

        let token0 = await createToken();
        let token1 = await createToken();

        let uniFactory = await createUniswap(token0, token1, util.toWei(11111111111), util.toWei(1));
        let priceOracle = await PriceOracleV2.new(uniFactory.address);
        let priceResult = await priceOracle.getPrice(token1.address, token0.address);

        let oneResult = priceResult[0];
        let twoResult = priceResult[1];
        m.log("Query results:", oneResult.toString())
        m.log("Query results:", twoResult.toString())
        assert.equal(11111111111, oneResult.toString() / 10000000000);

    });
    async function createToken() {
        let token = await MockERC20.new('token', 'token');
        return token;
    }

    async function createUniswap(token0, token1, reserve0, reserve1) {
        let pari = await MockUniswapV2Pair.new(token0.address, token1.address, reserve0, reserve1);
        let factory = await MockUniswapFactory.new();
        await factory.addPair(pari.address);
        return factory;
    }

})
