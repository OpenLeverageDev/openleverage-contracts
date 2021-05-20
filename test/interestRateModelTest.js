const {toBN} = require("./utils/EtheUtil");
const RateModel = artifacts.require("JumpRateModel");
const m = require('mocha-logger');


contract("JumpInterestRateModel", async accounts => {

  before(async () => {
    // runs once before the first test in this block
  });

  it("BorrowerInterestRate test normal rate", async () => {
    let baseRatePerYear = 5e16;
    let multiplierPerYear = 10e16;
    let jumpMultiplierPerYear = 20e16;
    let kink_ = 50e16;
    let rateModel = await RateModel.new(baseRatePerYear + '', multiplierPerYear + '', jumpMultiplierPerYear + '', kink_ + '');
    let cash1 = 100;
    let borrower1 = 10;
    let reserves1 = 0;
    let borrowerRate = await rateModel.getBorrowRate(cash1 + '', borrower1 + '', reserves1 + '');
    m.log('normal borrowerRate=', borrowerRate.mul(await rateModel.blocksPerYear()).toString());
    assert.equal(toBN(59090909088672000).toString(), borrowerRate.mul(await rateModel.blocksPerYear()).toString());

  })
  it("BorrowerInterestRate test jump rate", async () => {
    let baseRatePerYear = 5e16;
    let multiplierPerYear = 10e16;
    let jumpMultiplierPerYear = 20e16;
    let kink_ = 50e16;
    let rateModel = await RateModel.new(baseRatePerYear + '', multiplierPerYear + '', jumpMultiplierPerYear + '', kink_ + '');
    let cash1 = 100;
    let borrower1 = 51;
    let reserves1 = 0;
    let borrowerRate = await rateModel.getBorrowRate(cash1 + '', borrower1 + '', reserves1 + '');
    m.log('jump borrowerRate=', borrowerRate.mul(await rateModel.blocksPerYear()).toString());
    assert.equal(toBN(83774834434742400).toString(), borrowerRate.mul(await rateModel.blocksPerYear()).toString());

  })

  it("BorrowerInterestRate test min and max rate", async () => {
    let baseRatePerYear = 5e16;
    let multiplierPerYear = 10e16;
    let jumpMultiplierPerYear = 20e16;
    let kink_ = 50e16;
    let rateModel = await RateModel.new(baseRatePerYear + '', multiplierPerYear + '', jumpMultiplierPerYear + '', kink_ + '');
    let minBorrowerRate = await rateModel.getBorrowRate(0 + '', 0 + '', 0 + '');
    m.log('min borrowerRate=', minBorrowerRate.mul(await rateModel.blocksPerYear()).toString());
    assert.equal(toBN(49999999998268800).toString(), minBorrowerRate.mul(await rateModel.blocksPerYear()).toString());
    let maxBorrowerRate = await rateModel.getBorrowRate(0 + '', 10 + '', 0 + '');
    m.log('max borrowerRate=', maxBorrowerRate.mul(await rateModel.blocksPerYear()).toString());
    assert.equal(toBN(199999999995177600).toString(), maxBorrowerRate.mul(await rateModel.blocksPerYear()).toString());

  })

  it("SupplyInterestRate test min and max rate", async () => {
    let baseRatePerYear = 5e16;
    let multiplierPerYear = 10e16;
    let jumpMultiplierPerYear = 20e16;
    let kink_ = 50e16;
    let rateModel = await RateModel.new(baseRatePerYear + '', multiplierPerYear + '', jumpMultiplierPerYear + '', kink_ + '');
    let minSupplyRate = await rateModel.getSupplyRate(0 + '', 0 + '', 0 + '',20e16+'');
    m.log('min supplyRate=', minSupplyRate.mul(await rateModel.blocksPerYear()).toString());
    assert.equal(0, minSupplyRate.mul(await rateModel.blocksPerYear()));
    let maxSupplyRate = await rateModel.getSupplyRate(0 + '', 10 + '', 0 + '',20e16+'');
    m.log('max supplyRate=', maxSupplyRate.mul(await rateModel.blocksPerYear()).toString());
    assert.equal(toBN(+159999999995721600).toString(), maxSupplyRate.mul(await rateModel.blocksPerYear()).toString());

  })
})
