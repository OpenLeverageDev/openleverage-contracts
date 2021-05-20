const utils = require("./utils/OpenLevUtil");
const OLEToken = artifacts.require("OLEToken");
const TestToken = artifacts.require("MockERC20");
const {
  toWei,
  last8,
  prettyPrintBalance,
  checkAmount,
  printBlockNum,
  wait,
  assertPrint,
  step,
  resetStep
} = require("./utils/OpenLevUtil");


contract("Referral", async accounts => {

  // components
  let referral;
  let dai;
  let usdt;

  // roles
  let deployer = accounts[0]
  let admin = accounts[1];
  let openlev = accounts[2];
  let user_referrer = accounts[3];
  let user_referree1 = accounts[4];
  let user_referree2 = accounts[5];

  beforeEach(async () => {

    referral = await utils.createReferral(openlev, admin);
    dai = await TestToken.new('DAI', 'DAI');
    //referral = await ReferralDelegator.new(openlev, admin, delegatee.address, {from: deployer});
  });

  it("Register referrer", async () => {
    await referral.registerReferrer({from: user_referrer});
    let isActive = (await referral.accounts(user_referrer)).isActive;
    assertPrint("Referer should now be active", true, isActive);
  })

  it("Single level reward", async () => {
    await referral.registerReferrer({from: user_referrer});
    await referral.calReferralReward(user_referree1, user_referrer, 10000, dai.address, {from: openlev});

    let reward = await referral.getReward(user_referrer, dai.address);
    assertPrint("Referer should have reward", 1600, reward);
    await dai.mint(referral.address, 1600);
    await referral.withdrawReward(dai.address, {from: user_referrer});
    let rewardAfterWithdraw = await referral.getReward(user_referrer, dai.address);
    assertPrint("Referer reward is 0 after withdraw", 0, rewardAfterWithdraw);

  })

  it("Two level reward", async () => {
    //user_referrer->user_referree2->user_referree1
    await referral.registerReferrer({from: user_referrer});
    await referral.registerReferrer({from: user_referree2});
    //binding  user_referree2 belong user_referrer
    await referral.calReferralReward(user_referree2, user_referrer, 10000, dai.address, {from: openlev});
    let account2 = await referral.accounts(user_referree2);
    assertPrint("Referree2 belong referrer", user_referrer, account2.referrer);
    //binding  user_referree1 belong user_referrer2
    await referral.calReferralReward(user_referree1, user_referree2, 10000, dai.address, {from: openlev});
    let account1 = await referral.accounts(user_referree1);
    assertPrint("Referree1 belong referree2", user_referree2, account1.referrer);

    let reward_user_referrer = await referral.getReward(user_referrer, dai.address);
    assertPrint("Referer user should have reward", 2400, reward_user_referrer);

    let reward_user_referree2 = await referral.getReward(user_referree2, dai.address);
    assertPrint("Referer user2 should have reward", 1600, reward_user_referree2);
  })

  it("Trade to be referrer", async () => {
    await referral.calReferralReward(user_referree1, user_referrer, 10000, dai.address, {from: openlev});
    let account = await referral.accounts(user_referree1);
    assertPrint("Trade to be referrer", true, account.isActive);
  })

  it("Not to pay inactive referrer", async () => {
    await referral.calReferralReward(user_referree1, user_referrer, 10000, dai.address, {from: openlev});
    let reward_user_referrer = await referral.getReward(user_referrer, dai.address);
    assertPrint("Not to pay inactive referrer", 0, reward_user_referrer);

  })

})
