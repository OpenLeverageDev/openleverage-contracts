const utils = require("./utils/OpenLevUtil");
const {
    toWei,
    last8,
    prettyPrintBalance,
    checkAmount,
    printBlockNum,
    wait,
    assertPrint,
    Uni2DexData,
    addressToBytes,
    step,
    resetStep, assertThrows
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocksAndTime, toBN, advanceBlockAndSetTime} = require("./utils/EtheUtil");
const m = require('mocha-logger');
const TestToken = artifacts.require("MockERC20");
const XOLEDelegator = artifacts.require("XOLEDelegator");
const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");

const timeMachine = require('ganache-time-traveler');

contract("XOLE", async accounts => {

    // components
    let xole;
    let ole;
    let dai;
    let usdt;
    let uniswapFactory;

    let H = 3600;
    let DAY = 86400;
    let WEEK = 7 * DAY;
    let MAXTIME = 126144000;
    let TOL = 120 / WEEK;

    // roles
    let admin = accounts[0];
    let john = accounts[1];
    let tom = accounts[2];
    let dev = accounts[7];
    let communityAcc = accounts[8];

    let daiOLEDexData;
    let usdtOLEDexData;
    let daiUsdtDexData;
    let dexAgg;
    let snapshotId;
    beforeEach(async () => {

        // runs once before the first test in this block
        let controller = await utils.createController(admin);
        m.log("Created Controller", last8(controller.address));

        uniswapFactory = await utils.createUniswapV2Factory(admin);
        m.log("Created UniswapFactory", last8(uniswapFactory.address));

        ole = await TestToken.new('OpenLevERC20', 'OLE');
        usdt = await TestToken.new('Tether', 'USDT');
        dai = await TestToken.new('DAI', 'DAI');

        let pair = await MockUniswapV2Pair.new(usdt.address, dai.address, toWei(10000), toWei(10000));
        let oleUsdtPair = await MockUniswapV2Pair.new(usdt.address, ole.address, toWei(100000), toWei(100000));
        let oleDaiPair = await MockUniswapV2Pair.new(dai.address, ole.address, toWei(100000), toWei(100000));
        daiOLEDexData = Uni2DexData + addressToBytes(dai.address) + addressToBytes(ole.address);
        usdtOLEDexData = Uni2DexData + addressToBytes(usdt.address) + addressToBytes(ole.address);
        daiUsdtDexData = Uni2DexData + addressToBytes(dai.address) + addressToBytes(usdt.address);


        m.log("ole.address=", ole.address);
        m.log("usdt.address=", usdt.address);
        m.log("dai.address=", dai.address);

        m.log("daiOLEDexData=", daiOLEDexData);
        m.log("usdtOLEDexData=", usdtOLEDexData);
        m.log("Created MockUniswapV2Pair (", last8(await pair.token0()), ",", last8(await pair.token1()), ")");

        await uniswapFactory.addPair(pair.address);
        await uniswapFactory.addPair(oleUsdtPair.address);
        await uniswapFactory.addPair(oleDaiPair.address);
        m.log("Added pairs", last8(pair.address), last8(oleUsdtPair.address), last8(oleDaiPair.address));
        dexAgg = await utils.createEthDexAgg(uniswapFactory.address, "0x0000000000000000000000000000000000000000", admin);
        // Making sure the pair has been added correctly in mock
        let gotPair = await MockUniswapV2Pair.at(await uniswapFactory.getPair(usdt.address, dai.address));
        assert.equal(await pair.token0(), await gotPair.token0());
        assert.equal(await pair.token1(), await gotPair.token1());
        xole = await utils.createXOLE(ole.address, admin, dev, dexAgg.address);
        await xole.setShareToken(ole.address);
        await xole.setOleLpStakeToken(ole.address, {from: admin});
        m.log("Created xOLE", last8(xole.address));
        await utils.mint(usdt, xole.address, 10000);

        resetStep();
        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));
        await advanceBlockAndSetTime(timeToMove);
        let snapshot = await timeMachine.takeSnapshot();
        snapshotId = snapshot['result'];
    });
    afterEach(async () => {
        await timeMachine.revertToSnapshot(snapshotId);
    });
    it("Convert current erc20 holdings to reward, withdrawn dev fund", async () => {

        assert.equal('0', (await ole.balanceOf(xole.address)).toString());

        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK + 10);

        await xole.convertToSharingToken(toWei(1), 0, usdtOLEDexData);
        m.log("devFund:", (await xole.devFund()).toString());
        m.log("totalRewarded:", (await xole.totalRewarded()).toString());
        m.log("supply:", (await xole.totalLocked()).toString());
        m.log("lastUpdateTime:", (await xole.lastUpdateTime()).toString());
        m.log("rewardPerTokenStored:", (await xole.rewardPerTokenStored()).toString());
        assert.equal('498495030004550854', (await xole.devFund()).toString());

        m.log("Withdrawing dev fund");
        await xole.withdrawDevFund({from: dev});
        assert.equal('0', (await xole.devFund()).toString());
        assert.equal('10000498495030004550855', (await ole.balanceOf(xole.address)).toString());
        assert.equal('498495030004550854', (await ole.balanceOf(dev)).toString());
        m.log("Dev Fund balance:", await xole.devFund());
        m.log("Dev OLE balance:", await ole.balanceOf(dev));
        m.log("xOLE OLE balance:", await ole.balanceOf(xole.address));
    })

    it("Convert OLE Token exceed available", async () => {
        await ole.mint(xole.address, toWei(10000));
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK + 10);

        await xole.convertToSharingToken(toWei(10000), 0, '0x');

        m.log("Withdrawing dev fund");
        await xole.withdrawDevFund({from: dev});

        m.log("ole balance in xOLE:", await ole.balanceOf(xole.address));
        m.log("supply:", await xole.totalLocked());
        m.log("totalRewarded:", await xole.totalRewarded());
        m.log("withdrewReward:", await xole.withdrewReward());
        m.log("devFund:", await xole.devFund());
        await assertThrows(xole.convertToSharingToken(toWei(1), 0, '0x'), 'Exceed share token balance');

    })

    it("Convert Sharing Token correct", async () => {
        await dai.mint(xole.address, toWei(1000));
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK + 10);
        await xole.convertToSharingToken(toWei(1000), 0, daiOLEDexData);

        m.log("xOLE OLE balance:", await ole.balanceOf(xole.address));
        assert.equal('10987158034397061298850', (await ole.balanceOf(xole.address)).toString());

        m.log("xOLE totalRewarded:", await xole.totalRewarded());
        assert.equal('493579017198530649425', (await xole.totalRewarded()).toString());

        m.log("xOLE devFund:", await xole.devFund());
        assert.equal('493579017198530649425', (await xole.devFund()).toString());

        m.log("xOLE withdrewReward:", await xole.withdrewReward());
        assert.equal('0', (await xole.withdrewReward()).toString());
        m.log("xole.totalSupply", (await xole.totalSupply()).toString());
        m.log("xole.balanceOf", (await xole.balanceOf(admin)).toString());
        assert.equal('0', (await xole.rewardPerTokenStored()).toString());
        // withdraw devFund
        await xole.withdrawDevFund({from: dev});
        assert.equal('493579017198530649425', (await ole.balanceOf(dev)).toString());
        // withdraw communityFund
        await xole.withdrawCommunityFund(communityAcc);
        assert.equal('493579017198530649425', (await ole.balanceOf(communityAcc)).toString());
        assert.equal('493579017198530649425', (await xole.withdrewReward()).toString());
        //add sharingToken Reward 2000
        await usdt.mint(xole.address, toWei(2000));
        //sharing 1000
        await xole.convertToSharingToken(toWei(1000), 0, usdtOLEDexData);
        assert.equal('987158034397061298850', (await xole.totalRewarded()).toString());
        //Exceed available balance
        await assertThrows(xole.convertToSharingToken(toWei(20001), 0, usdtOLEDexData), 'Exceed available balance');

    })
    it("Convert DAI to USDT", async () => {
        await dai.mint(xole.address, toWei(1000));
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK);
        assert.equal('10000000000000000000000', (await usdt.balanceOf(xole.address)).toString());
        await xole.convertToSharingToken(toWei(1000), 0, daiUsdtDexData);
        m.log("xOLE USDT balance:", await usdt.balanceOf(xole.address));
        assert.equal('10906610893880149131581', (await usdt.balanceOf(xole.address)).toString());

        m.log("xOLE DAI balance:", await dai.balanceOf(xole.address));
        assert.equal('0', (await dai.balanceOf(xole.address)).toString());

        m.log("xOLE OLE balance:", await ole.balanceOf(xole.address));
        assert.equal('10000000000000000000000', (await ole.balanceOf(xole.address)).toString());

        m.log("xOLE totalRewarded:", await xole.totalRewarded());
        assert.equal('0', (await xole.totalRewarded()).toString());

        m.log("xOLE devFund:", await xole.devFund());
        assert.equal('0', (await xole.devFund()).toString());
    })

    it("Convert DAI to USDT to OLE ", async () => {
        await dai.mint(xole.address, toWei(1000));
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK + 10);
        assert.equal('10000000000000000000000', (await usdt.balanceOf(xole.address)).toString());
        await xole.convertToSharingToken(toWei(1000), 0, "0x01" + "000000" + "03" + addressToBytes(dai.address) + addressToBytes(usdt.address) + addressToBytes(ole.address));
        m.log("xOLE USDT balance:", await usdt.balanceOf(xole.address));
        assert.equal('10000000000000000000000', (await usdt.balanceOf(xole.address)).toString());

        m.log("xOLE DAI balance:", await dai.balanceOf(xole.address));
        assert.equal('0', (await dai.balanceOf(xole.address)).toString());

        m.log("xOLE OLE balance:", await ole.balanceOf(xole.address));
        assert.equal('10895794058774498675511', (await ole.balanceOf(xole.address)).toString());

        m.log("xOLE totalRewarded:", await xole.totalRewarded());
        assert.equal('447897029387249337756', (await xole.totalRewarded()).toString());

        m.log("xOLE devFund:", await xole.devFund());
        assert.equal('447897029387249337755', (await xole.devFund()).toString());
    })

    it("John Deposit for 1 weeks, Tom 2 weeks", async () => {

        await ole.mint(john, toWei(10000));
        await ole.mint(tom, toWei(10000));
        await dai.mint(xole.address, toWei(1000));
        await ole.approve(xole.address, toWei(500), {from: john});
        await ole.approve(xole.address, toWei(500), {from: tom});

        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));

        step("John stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + 2 * WEEK + 60, {from: john});
        step("Tom stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + (2 * WEEK) + 60 * 60, {from: tom});
        assertPrint("Total staked:", toWei(1000), await xole.totalLocked());
        step("New reward 1");
        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '498495030004550854', await xole.devFund());
        assertPrint("Total to share:", '498495030004550855', await xole.totalRewarded());
    })

    it("John Deposit for 1 weeks, Tom 2 weeks increase amount yet", async () => {

        await ole.mint(john, toWei(10000));
        await ole.mint(tom, toWei(10000));
        await dai.mint(xole.address, toWei(1000));
        await ole.approve(xole.address, toWei(500), {from: john});
        await ole.approve(xole.address, toWei(1000), {from: tom});

        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));

        step("John stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + 2 * WEEK + 10, {from: john});
        step("Tom stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + (2 * WEEK) + 60 * 60, {from: tom});
        await xole.increase_amount(toWei(500), {from: tom});

        assertPrint("Total staked:", toWei(1500), await xole.totalLocked());
        step("New reward 1");
        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '498495030004550854', await xole.devFund());
        assertPrint("Total to share:", '498495030004550855', await xole.totalRewarded());
    })

    it("John Deposit for 1 weeks, Tom 2 weeks increase unlock time to 4 weeks", async () => {

        await ole.mint(john, toWei(10000));
        await ole.mint(tom, toWei(10000));
        await dai.mint(xole.address, toWei(1000));
        await ole.approve(xole.address, toWei(500), {from: john});
        await ole.approve(xole.address, toWei(1000), {from: tom});
        let lastbk = await web3.eth.getBlock('latest');
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));

        step("John stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + 2 * WEEK + 60, {from: john});
        step("Tom stake 500 2 weeks");
        lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(500), timeToMove + (2 * WEEK) + 60 * 60, {from: tom});
        timeToMove = lastbk.timestamp + WEEK;
        await xole.increase_unlock_time(timeToMove + (4 * WEEK) + 60 * 60, {from: tom});

        step("New reward 1");
        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '498495030004550854', await xole.devFund());
        assertPrint("Total to share:", '498495030004550855', await xole.totalRewarded());
    })

    it("John Deposit for 1 weeks, Tom 2 weeks redraw, share again", async () => {

        await ole.mint(john, toWei(10000));
        await ole.mint(tom, toWei(10000));
        await dai.mint(xole.address, toWei(1000));
        await ole.approve(xole.address, toWei(500), {from: john});
        await ole.approve(xole.address, toWei(1000), {from: tom});
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK);
        m.log("Move time to start of the week", new Date(timeToMove));
        step("John stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + 2 * WEEK + 10, {from: john});
        step("Tom stake 500 2 weeks");
        await xole.create_lock(toWei(500), timeToMove + (2 * WEEK) + 60 * 60, {from: tom});
        step("New reward 1");
        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);

        m.log("Tom balance=", (await xole.balanceOf(tom)).toString());
        m.log("John balance=", (await xole.balanceOf(john)).toString());

        let lockedEndBlock = (await xole.locked(tom)).end;
        m.log("lockedEndBlock=", lockedEndBlock);
        lastbk = await web3.eth.getBlock('latest');
        m.log("lastbk.timestamp before=", lastbk.timestamp);
        await advanceBlockAndSetTime(parseInt(lockedEndBlock.toString()));
        lastbk = await web3.eth.getBlock('latest');
        m.log("lastbk.timestamp after=", lastbk.timestamp);

        await xole.withdraw({from: tom});
        assertPrint("Total Extra Token:", "520800000000000000000", await xole.totalSupply());
        assertPrint("Tom Extra Token:", 0, await xole.balanceOf(tom));

        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);
    })
    it("John and Tom stakes, Tom stakes more, shares fees", async () => {
        m.log("process.env.FASTMODE", process.env.FASTMODE);
        if (process.env.FASTMODE === 'true') {
            m.log("Skipping this test for FAST Mode");
            return;
        }

        await ole.mint(john, toWei(10000));
        await ole.mint(tom, toWei(10000));
        await dai.mint(xole.address, toWei(1000));

        await ole.approve(xole.address, toWei(500), {from: john});
        await ole.approve(xole.address, toWei(300), {from: tom});

        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        step("John stake 500");
        await xole.create_lock(toWei(500), lastbk.timestamp + 2 * WEEK + 10, {from: john});
        assertPrint("John staked:", toWei(500), (await xole.locked(john)).amount);
        step("Tom stake 300");
        await xole.create_lock(toWei(300), lastbk.timestamp + 2 * WEEK + 10, {from: tom});
        assertPrint("Tom staked:", toWei(300), (await xole.locked(tom)).amount);
        assertPrint("Total staked:", toWei(800), await xole.totalLocked());
        step("New reward 1");
        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '498495030004550854', await xole.devFund());
        assertPrint("Total to share:", '498495030004550855', await xole.totalRewarded());

        step("Tom stake more 200");
        await ole.approve(xole.address, toWei(200), {from: tom});
        await xole.increase_amount(toWei(200), {from: tom});
        assertPrint("Tom staked:", toWei(500), (await xole.locked(tom)).amount);
        assertPrint("John staked:", toWei(500), (await xole.locked(john)).amount);
        assertPrint("Total staked:", toWei(1000), await xole.totalLocked());

        step("New reward 1");
        await xole.convertToSharingToken(toWei(1), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '996980105262148814', await xole.devFund());

        // Block time insensitive
        step("Advancing block time ...");
        timeMachine.advanceTimeAndBlock(1000);
        assertPrint("Dev Fund:", '996980105262148814', await xole.devFund());

        step("John stack more, but earning should not change because no new reward");
        await ole.approve(xole.address, toWei(1000), {from: john});
        await xole.increase_amount(toWei(1000), {from: john});
        assertPrint("Total staked:", toWei(2000), await xole.totalLocked());
        assertPrint("Dev Fund:", '996980105262148814', await xole.devFund());

        step("New reward 200");
        await xole.convertToSharingToken(toWei(200), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '100494603912584309258', await xole.devFund());

        await advanceBlockAndSetTime(lastbk.timestamp + 3 * WEEK);
        step("John exits, but earning should not change because no new reward");
        await xole.withdraw({from: john});
        assertPrint("Total staked:", toWei(500), await xole.totalLocked());
        assertPrint("Dev Fund:", '100494603912584309258', await xole.devFund());

        step("New reward 100");
        await xole.convertToSharingToken(toWei(100), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '150094767100146587308', await xole.devFund());

        step("Tom exit, and more reward");
        await xole.withdraw({from: tom});

        step("John stack more, but earning should not change because no new reward");
        await ole.approve(xole.address, toWei(1000), {from: john});
        lastbk = await web3.eth.getBlock('latest');
        await xole.create_lock(toWei(1000), lastbk.timestamp + 3 * WEEK, {from: john});

        step("New reward 100");
        await xole.convertToSharingToken(toWei(100), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '199596275059873518079', await xole.devFund());

        lastbk = await web3.eth.getBlock('latest');
        await xole.increase_unlock_time(lastbk.timestamp + 5 * WEEK, {from: john});
        assertPrint("Dev Fund:", '199596275059873518079', await xole.devFund());

        step("New reward 100");
        await xole.convertToSharingToken(toWei(100), 0, daiOLEDexData);
        assertPrint("Dev Fund:", '248999421985512891445', await xole.devFund());

    })

    it("Convert dexData is 0x ", async () => {
        await dai.mint(xole.address, toWei(1000));
        await xole.setShareToken(dai.address);
        assert.equal('1000000000000000000000', (await xole.shareableTokenAmount()).toString());
        assert.equal('0', (await xole.claimableTokenAmount()).toString());

        await xole.convertToSharingToken(toWei(500), 0, '0x');

        m.log("xOLE dai balance:", await dai.balanceOf(xole.address));
        assert.equal('1000000000000000000000', (await dai.balanceOf(xole.address)).toString());


        m.log("xOLE totalRewarded:", await xole.totalRewarded());
        assert.equal('250000000000000000000', (await xole.totalRewarded()).toString());

        m.log("xOLE devFund:", await xole.devFund());
        assert.equal('250000000000000000000', (await xole.devFund()).toString());

        assert.equal('500000000000000000000', (await xole.shareableTokenAmount()).toString());
        assert.equal('250000000000000000000', (await xole.claimableTokenAmount()).toString());


        await dai.mint(xole.address, toWei(1000));

        assert.equal('1500000000000000000000', (await xole.shareableTokenAmount()).toString());
        assert.equal('250000000000000000000', (await xole.claimableTokenAmount()).toString());

        // withdraw devFund
        await xole.withdrawDevFund({from: dev});
        assert.equal('250000000000000000000', (await dai.balanceOf(dev)).toString());

        await xole.convertToSharingToken(toWei(1500), 0, '0x');

        assert.equal('1750000000000000000000', (await dai.balanceOf(xole.address)).toString());
        assert.equal('1000000000000000000000', (await xole.totalRewarded()).toString());
        assert.equal('750000000000000000000', (await xole.devFund()).toString());

        await assertThrows(xole.convertToSharingToken(toWei(1), 0, '0x'), 'Exceed share token balance');

        // withdraw devFund
        await xole.withdrawDevFund({from: dev});
        assert.equal('1000000000000000000000', (await dai.balanceOf(dev)).toString());
        // withdraw communityFund
        await xole.withdrawCommunityFund(communityAcc);
        assert.equal('1000000000000000000000', (await dai.balanceOf(communityAcc)).toString());

        assert.equal('0', (await xole.shareableTokenAmount()).toString());
        assert.equal('0', (await xole.claimableTokenAmount()).toString());
    })

    it("Convert minBuy limit test", async () => {
        await dai.mint(xole.address, toWei(1000));
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(10000), lastbk.timestamp + 2 * WEEK + 10);
        assert.equal('10000000000000000000000', (await usdt.balanceOf(xole.address)).toString());
        await assertThrows(xole.convertToSharingToken(toWei(1000), '10906610893880149131582', daiUsdtDexData), 'buy amount less than min');

        await assertThrows(xole.convertToSharingToken(toWei(1000), "895794058774498675512",
            "0x01" + "000000" + "03" + addressToBytes(dai.address) + addressToBytes(usdt.address) + addressToBytes(ole.address)), 'buy amount less than min');

    })

    it("Convert shareToken=oleToken test", async () => {
        await ole.mint(admin, toWei(10000));
        await ole.approve(xole.address, toWei(10000));
        let lastbk = await web3.eth.getBlock('latest');
        await advanceBlockAndSetTime(lastbk.timestamp - 10);
        await xole.create_lock(toWei(1), lastbk.timestamp + 2 * WEEK + 10);

        assert.equal('0', (await xole.shareableTokenAmount()).toString());
        assert.equal('0', (await xole.claimableTokenAmount()).toString());
        await ole.mint(xole.address, toWei(10000));
        assert.equal("10000000000000000000000", (await xole.shareableTokenAmount()).toString());
        assert.equal('0', (await xole.claimableTokenAmount()).toString());
        // increase not effect shareableAmount
        await xole.increase_amount(toWei(1));
        assert.equal("10000000000000000000000", (await xole.shareableTokenAmount()).toString());
        assert.equal('0', (await xole.claimableTokenAmount()).toString());
        // convert dai to ole
        await dai.mint(xole.address, toWei(1000));
        await xole.convertToSharingToken(toWei(1000), '0', daiOLEDexData);
        assert.equal("10000000000000000000000", (await xole.shareableTokenAmount()).toString());
        assert.equal('493579017198530649425', (await xole.claimableTokenAmount()).toString());
        assert.equal('493579017198530649425', (await xole.devFund()).toString());
        // convert usdt to ole
        await usdt.mint(xole.address, toWei(1000));
        await xole.convertToSharingToken(toWei(1000), '0', usdtOLEDexData);
        assert.equal("10000000000000000000000", (await xole.shareableTokenAmount()).toString());
        assert.equal('987158034397061298850', (await xole.claimableTokenAmount()).toString());
        assert.equal('987158034397061298850', (await xole.devFund()).toString());
        // convert ole
        await xole.convertToSharingToken(toWei(1000), '0', '0x');
        assert.equal("9000000000000000000000", (await xole.shareableTokenAmount()).toString());
        assert.equal('1487158034397061298850', (await xole.claimableTokenAmount()).toString());
        assert.equal('1487158034397061298850', (await xole.devFund()).toString());
        // withdrawCommunityFund
        await xole.withdrawCommunityFund(communityAcc);
        assert.equal('1487158034397061298850', (await ole.balanceOf(communityAcc)).toString());
        assert.equal("9000000000000000000000", (await xole.shareableTokenAmount()).toString());
        assert.equal('0', (await xole.claimableTokenAmount()).toString());
        assert.equal('1487158034397061298850', (await xole.devFund()).toString());
        // user withdraw ole, no effect
        lastbk = await web3.eth.getBlock('latest');
        end = lastbk.timestamp + WEEK * 3;
        await advanceBlockAndSetTime(end + 60 * 60 * 24);
        await xole.withdraw({from: admin});
        assert.equal('0', (await xole.balanceOf(admin)).toString());
        assert.equal('10000000000000000000000', (await ole.balanceOf(admin)).toString());
        // convert all
        await xole.convertToSharingToken(toWei(9000), '0', '0x');
        assert.equal("0", (await xole.shareableTokenAmount()).toString());
        assert.equal('4500000000000000000000', (await xole.claimableTokenAmount()).toString());
        assert.equal('5987158034397061298850', (await xole.devFund()).toString());

    })

    // Admin Test
    it("Admin setDevFundRatio test", async () => {
        let timeLock = await utils.createTimelock(admin);
        let xole0 = await utils.createXOLE(ole.address, timeLock.address, dev, dexAgg.address, accounts[0]);
        await timeLock.executeTransaction(xole0.address, 0, 'setDevFundRatio(uint256)',
            web3.eth.abi.encodeParameters(['uint256'], [1]), 0)
        assert.equal(1, await xole0.devFundRatio());
        await assertThrows(xole0.setDevFundRatio(1), 'caller must be admin');
    })

    it("Admin setDexAgg test", async () => {
        let newDexAgg = accounts[3];
        let timeLock = await utils.createTimelock(admin);
        let xole0 = await utils.createXOLE(ole.address, timeLock.address, dev, dexAgg.address, accounts[0]);
        await timeLock.executeTransaction(xole0.address, 0, 'setDexAgg(address)',
            web3.eth.abi.encodeParameters(['address'], [newDexAgg]), 0)
        assert.equal(newDexAgg, await xole0.dexAgg());
        await assertThrows(xole0.setDexAgg(newDexAgg), 'caller must be admin');
    })

    it("Admin setShareToken test", async () => {
        let shareToken = ole.address;
        let timeLock = await utils.createTimelock(admin);
        let xole0 = await utils.createXOLE(ole.address, timeLock.address, dev, dexAgg.address, accounts[0]);
        await timeLock.executeTransaction(xole0.address, 0, 'setShareToken(address)',
            web3.eth.abi.encodeParameters(['address'], [shareToken]), 0)
        assert.equal(shareToken, await xole0.shareToken());
        await assertThrows(xole0.setShareToken(shareToken), 'caller must be admin');

        await ole.mint(xole0.address, toWei(10000));
        await xole0.convertToSharingToken(toWei(10000), 0, '0x');
        // Withdraw fund firstly
        await assertThrows(timeLock.executeTransaction(xole0.address, 0, 'setShareToken(address)',
            web3.eth.abi.encodeParameters(['address'], [shareToken]), 0), 'Transaction execution reverted');

    })

    it("Admin setOleLpStakeToken test", async () => {
        let oleLpStakeToken = ole.address;
        let timeLock = await utils.createTimelock(admin);
        let xole0 = await utils.createXOLE(ole.address, timeLock.address, dev, dexAgg.address, accounts[0]);
        await timeLock.executeTransaction(xole0.address, 0, 'setOleLpStakeToken(address)',
            web3.eth.abi.encodeParameters(['address'], [oleLpStakeToken]), 0)
        assert.equal(oleLpStakeToken, await xole0.oleLpStakeToken());
        await assertThrows(xole0.setOleLpStakeToken(oleLpStakeToken), 'caller must be admin');
    })

    it("Admin setOleLpStakeAutomator test", async () => {
        let oleLpStakeAutomator = ole.address;
        let timeLock = await utils.createTimelock(admin);
        let xole0 = await utils.createXOLE(ole.address, timeLock.address, dev, dexAgg.address, accounts[0]);
        await timeLock.executeTransaction(xole0.address, 0, 'setOleLpStakeAutomator(address)',
            web3.eth.abi.encodeParameters(['address'], [oleLpStakeAutomator]), 0)
        assert.equal(oleLpStakeAutomator, await xole0.oleLpStakeAutomator());
        await assertThrows(xole0.setOleLpStakeAutomator(oleLpStakeAutomator), 'caller must be admin');
    })

    it("Admin withdrawCommunityFund test", async () => {
        let to = accounts[7];
        let timeLock = await utils.createTimelock(admin);
        let xole0 = await utils.createXOLE(ole.address, timeLock.address, dev, dexAgg.address, accounts[0]);

        await assertThrows(xole0.withdrawCommunityFund(to), 'caller must be admin');
        let claimableTokenAmount = await xole0.claimableTokenAmount();
        assert.equal(0, claimableTokenAmount);
        // to is 0x address
        await assertThrows(timeLock.executeTransaction(xole0.address, 0, 'withdrawCommunityFund(address)',
            web3.eth.abi.encodeParameters(['address'], ["0x0000000000000000000000000000000000000000"]), 0, {from: admin}), 'Transaction execution reverted');
        // fund is 0
        await assertThrows(timeLock.executeTransaction(xole0.address, 0, 'withdrawCommunityFund(address)',
            web3.eth.abi.encodeParameters(['address'], [to]), 0, {from: admin}), 'Transaction execution reverted');

        await timeLock.executeTransaction(xole0.address, 0, 'setShareToken(address)',
            web3.eth.abi.encodeParameters(['address'], [ole.address]), 0);

        await ole.mint(xole0.address, toWei(10000));
        await xole0.convertToSharingToken(toWei(10000), 0, '0x');

        await timeLock.executeTransaction(xole0.address, 0, 'withdrawCommunityFund(address)',
            web3.eth.abi.encodeParameters(['address'], [to]), 0, {from: admin});

    })

    it("Admin setDev test", async () => {
        let newDev = accounts[7];
        let timeLock = await utils.createTimelock(admin);
        let xole0 = await utils.createXOLE(ole.address, timeLock.address, dev, dexAgg.address, accounts[0]);
        await timeLock.executeTransaction(xole0.address, 0, 'setDev(address)',
            web3.eth.abi.encodeParameters(['address'], [newDev]), 0)
        assert.equal(newDev, await xole0.dev());
        await assertThrows(xole0.setDev(newDev), 'caller must be admin');
    })

    it("Admin convertToSharingToken test", async () => {
        await assertThrows(xole.convertToSharingToken(toWei(1), 0, daiOLEDexData, {from: accounts[3]}), 'caller must be admin or developer');
    })
    it("Admin setImplementation test", async () => {
        let timeLock = await utils.createTimelock(admin);
        let xole0 = await utils.createXOLE(ole.address, timeLock.address, dev, dexAgg.address, accounts[0]);
        xole0 = await XOLEDelegator.at(xole0.address);
        let instance = accounts[8];
        await timeLock.executeTransaction(xole0.address, 0, 'setImplementation(address)',
            web3.eth.abi.encodeParameters(['address'], [instance]), 0)
        assert.equal(instance, await xole0.implementation());
        await assertThrows(xole0.setImplementation(instance), 'caller must be admin');
    });
})
