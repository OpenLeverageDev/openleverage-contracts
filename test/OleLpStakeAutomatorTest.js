const OLEToken = artifacts.require("OLEToken");
const {
    assertPrint,
    approxAssertPrint,
    createEthDexAgg,
    createUniswapV2Factory,
    createXOLE, assertThrows, toWei
} = require("./utils/OpenLevUtil");
const m = require('mocha-logger');
const {advanceMultipleBlocksAndTime, advanceBlockAndSetTime, toBN} = require("./utils/EtheUtil");
const utils = require("./utils/OpenLevUtil");
const timeMachine = require("ganache-time-traveler");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");
const UniswapV2Router = artifacts.require("UniswapV2Router02");

const OleLpStakeAutomatorDelegator = artifacts.require("OleLpStakeAutomatorDelegator");

const OleLpStakeAutomator = artifacts.require("OleLpStakeAutomator");
const TestToken = artifacts.require("MockERC20");

contract("xOLE", async accounts => {

    let DAY = 86400;
    let WEEK = 7 * DAY;

    let _1000 = "1000000000000000000000";
    let _500 = "500000000000000000000";

    let bob = accounts[0];
    let alice = accounts[1];
    let admin = accounts[2];
    let dev = accounts[3];

    let ole;
    let oleWethLpToken;
    let oleUsdtLpToken;
    let xole;
    let weth;
    let usdt;
    let factory;
    let router;
    let nativeAutomator;
    let erc20Automator;
    let snapshotId;
    beforeEach(async () => {
        let snapshot = await timeMachine.takeSnapshot();
        snapshotId = snapshot['result'];
        ole = await OLEToken.new(admin, accounts[0], "Open Leverage Token", "OLE");
        await ole.mint(bob, _1000);
        await ole.mint(alice, _1000);
        usdt = await TestToken.new('USDT', 'USDT');
        await usdt.mint(admin, _1000);
        await usdt.mint(bob, _1000);
        await usdt.mint(alice, _1000);
        // uniswap
        weth = await utils.createWETH();
        factory = await UniswapV2Factory.new("0x0000000000000000000000000000000000000000");
        router = await UniswapV2Router.new(factory.address, weth.address);
        let block = await web3.eth.getBlock("latest");

        await ole.approve(router.address, utils.toWei(1), {from: admin});
        await web3.eth.sendTransaction({from: accounts[9], to: admin, value: utils.toWei(1)});
        await router.addLiquidityETH(ole.address, utils.toWei(1), utils.toWei(1), utils.toWei(1), admin, block.timestamp + 60, {
            from: admin,
            value: utils.toWei(1)
        });

        await ole.approve(router.address, utils.toWei(1), {from: admin});
        await usdt.approve(router.address, utils.toWei(1), {from: admin});
        await router.addLiquidity(ole.address, usdt.address, utils.toWei(1), utils.toWei(1), utils.toWei(1), utils.toWei(1), admin, block.timestamp + 60, {
            from: admin
        });

        //xole
        xole = await createXOLE(ole.address, admin, dev, "0x0000000000000000000000000000000000000000", admin);
        // native automator
        oleWethLpToken = await factory.getPair(ole.address, weth.address);
        nativeAutomator = await OleLpStakeAutomator.new();
        nativeAutomator = await OleLpStakeAutomator.at((await OleLpStakeAutomatorDelegator.new(xole.address, ole.address, weth.address, oleWethLpToken, weth.address, router.address, admin, nativeAutomator.address)).address);
        // erc20 automator
        oleUsdtLpToken = await factory.getPair(ole.address, usdt.address);
        erc20Automator = await OleLpStakeAutomator.new();
        erc20Automator = await OleLpStakeAutomator.at((await OleLpStakeAutomatorDelegator.new(xole.address, ole.address, usdt.address, oleUsdtLpToken, weth.address, router.address, admin, erc20Automator.address)).address);
        // init
        let lastbk = await web3.eth.getBlock('latest');
        m.log("lastbk", lastbk.timestamp);
        let timeToMove = lastbk.timestamp + (WEEK - lastbk.timestamp % WEEK) + 10;
        m.log("timeToMove", timeToMove);
        m.log("Move time to start of the week", new Date(timeToMove * 1000));
        await advanceBlockAndSetTime(timeToMove);

    });

    afterEach(async () => {
        await timeMachine.revertToSnapshot(snapshotId);
    });
    it("Native automator createLockBoth test", async () => {
        await xole.setOleLpStakeToken(oleWethLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(nativeAutomator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        m.log("unlockTime", unlockTime);
        await ole.approve(nativeAutomator.address, oleAmount, {from: alice});
        //minAmount check
        await assertThrows(nativeAutomator.createLockBoth(oleAmount, 0, unlockTime, toWei(2), toWei(2), {
            from: alice,
            value: otherAmount
        }), 'INSUFFICIENT');
        //back remainder check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        await nativeAutomator.createLockBoth(toWei(2), 0, unlockTime, oleAmount, otherAmount, {
            from: alice,
            value: otherAmount
        });
        let ethBalanceBefore = await web3.eth.getBalance(bob);
        await ole.approve(nativeAutomator.address, oleAmount, {from: bob});
        let r = await nativeAutomator.createLockBoth(oleAmount, 0, unlockTime, oleAmount, otherAmount, {
            from: bob,
            value: toWei(2)
        });
        m.log("createLockBoth Gas Used:", r.receipt.gasUsed);

        let ethBalanceAfter = await web3.eth.getBalance(bob);
        assertPrint("Bob back 1 eth", toBN(ethBalanceBefore).sub(toBN(ethBalanceAfter)).lt(toWei(2)), true);
        // xole check
        assertPrint("Alice's balance of ole", "999000000000000000000", await ole.balanceOf(alice));
        assertPrint("Alice's balance of xole", "1020800000000000000", await xole.balanceOf(alice));

        assertPrint("Bob's balance of ole", "999000000000000000000", await ole.balanceOf(bob));
        assertPrint("Bob's balance of xole", "1020800000000000000", await xole.balanceOf(bob));
    })

    it("Erc20 automator createLockBoth test", async () => {

        await xole.setOleLpStakeToken(oleUsdtLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(erc20Automator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        await ole.approve(erc20Automator.address, oleAmount, {from: alice});
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});
        //minAmount check
        await assertThrows(erc20Automator.createLockBoth(oleAmount, otherAmount, unlockTime, toWei(2), toWei(2), {
            from: alice
        }), 'INSUFFICIENT');
        //back remainder check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});
        await erc20Automator.createLockBoth(toWei(2), otherAmount, unlockTime, oleAmount, otherAmount, {
            from: alice
        });
        await ole.approve(erc20Automator.address, oleAmount, {from: bob});
        await usdt.approve(erc20Automator.address, toWei(2), {from: bob});
        await erc20Automator.createLockBoth(oleAmount, toWei(2), unlockTime, oleAmount, otherAmount, {
            from: bob
        });
        // xole check
        assertPrint("Alice's balance of ole", "999000000000000000000", await ole.balanceOf(alice));
        assertPrint("Alice's balance of xole", "1020800000000000000", await xole.balanceOf(alice));

        assertPrint("Bob's balance of ole", "999000000000000000000", await ole.balanceOf(bob));
        assertPrint("Bob's balance of xole", "1020800000000000000", await xole.balanceOf(bob));
    })
    it("Native automator createLockOLE test", async () => {
        await xole.setOleLpStakeToken(oleWethLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(nativeAutomator.address, {from: admin});
        let oleAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        await ole.approve(nativeAutomator.address, oleAmount, {from: alice});

        //minAmount check
        await assertThrows(nativeAutomator.createLockOLE(oleAmount, unlockTime, toWei(1), toWei(1), {
            from: alice
        }), 'INSUFFICIENT');
        //back remainder check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});

        let ethBalanceBefore = await web3.eth.getBalance(alice);
        let r = await nativeAutomator.createLockOLE(toWei(2), unlockTime, toWei(0), toWei(0), {
            from: alice
        });
        m.log("createLockOLE Gas Used:", r.receipt.gasUsed);

        let ethBalanceAfter = await web3.eth.getBalance(alice);
        assertPrint("Alice back 0.2 eth", toBN(ethBalanceAfter).sub(toBN(ethBalanceBefore)).gt(toWei(0)), true);

        //xole check
        assertPrint("Alice's balance of ole", "998000000000000000000", await ole.balanceOf(alice));
        assertPrint("Alice's balance of xole", "510399999999999998", await xole.balanceOf(alice));

    })

    it("Erc20 automator createLockOLE test", async () => {

        await xole.setOleLpStakeToken(oleUsdtLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(erc20Automator.address, {from: admin});
        let oleAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        await ole.approve(erc20Automator.address, oleAmount, {from: alice});

        //minAmount check
        await assertThrows(erc20Automator.createLockOLE(oleAmount, unlockTime, toWei(1), toWei(1), {
            from: alice
        }), 'INSUFFICIENT');
        //back remainder check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});

        await erc20Automator.createLockOLE(toWei(2), unlockTime, toWei(0), toWei(0), {
            from: alice
        });

        //xole check
        assertPrint("Alice's balance of ole", "998000000000000000000", await ole.balanceOf(alice));
        assertPrint("Alice's balance of usdt", "1000248873309964947421", await usdt.balanceOf(alice));
        assertPrint("Alice's balance of xole", "510399999999999998", await xole.balanceOf(alice));

    })

    it("Native automator createLockOther test", async () => {
        await xole.setOleLpStakeToken(oleWethLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(nativeAutomator.address, {from: admin});
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;

        //minAmount check
        await assertThrows(nativeAutomator.createLockOther(0, unlockTime, toWei(1), toWei(1), {
            from: alice,
            value: otherAmount
        }), 'INSUFFICIENT');

        //back remainder check
        let r = await nativeAutomator.createLockOther(0, unlockTime, toWei(0), toWei(0), {
            from: alice,
            value: toWei(2)
        });
        m.log("createLockOther Gas Used:", r.receipt.gasUsed);

        //xole check
        assertPrint("Alice's balance of ole", "1000248873309964947421", await ole.balanceOf(alice));
        assertPrint("Alice's balance of xole", "510399999999999998", await xole.balanceOf(alice));

    })

    it("Erc20 automator createLockOther test", async () => {

        await xole.setOleLpStakeToken(oleUsdtLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(erc20Automator.address, {from: admin});
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        await usdt.approve(erc20Automator.address, otherAmount, {from: alice});

        //minAmount check
        await assertThrows(erc20Automator.createLockOther(otherAmount, unlockTime, toWei(1), toWei(1), {
            from: alice
        }), 'INSUFFICIENT');
        //back remainder check
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});

        await erc20Automator.createLockOther(toWei(2), unlockTime, toWei(0), toWei(0), {
            from: alice
        });

        //xole check
        assertPrint("Alice's balance of ole", "1000248873309964947421", await ole.balanceOf(alice));
        assertPrint("Alice's balance of xole", "510399999999999998", await xole.balanceOf(alice));

    })

    it("Native automator increaseAmountBoth test", async () => {
        await xole.setOleLpStakeToken(oleWethLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(nativeAutomator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        m.log("unlockTime", unlockTime);
        //back remainder check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        await nativeAutomator.createLockBoth(toWei(2), 0, unlockTime, oleAmount, otherAmount, {
            from: alice,
            value: otherAmount
        });

        //minAmount check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        await assertThrows(nativeAutomator.increaseAmountBoth(oleAmount, 0, toWei(2), toWei(2), {
            from: alice,
            value: otherAmount
        }), 'INSUFFICIENT');

        let r = await nativeAutomator.increaseAmountBoth(toWei(2), 0, oleAmount, otherAmount, {
            from: alice,
            value: otherAmount
        });
        m.log("increaseAmountBoth Gas Used:", r.receipt.gasUsed);

        // xole check
        assertPrint("Alice's balance of ole", "998000000000000000000", await ole.balanceOf(alice));
        assertPrint("Alice's balance of xole", "2041600000000000000", await xole.balanceOf(alice));

    })

    it("Erc20 automator increaseAmountBoth test", async () => {
        await xole.setOleLpStakeToken(oleUsdtLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(erc20Automator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        m.log("unlockTime", unlockTime);
        //back remainder check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});

        await erc20Automator.createLockBoth(toWei(2), otherAmount, unlockTime, oleAmount, otherAmount, {
            from: alice
        });

        //minAmount check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});
        await assertThrows(erc20Automator.increaseAmountBoth(oleAmount, otherAmount, toWei(2), toWei(2), {
            from: alice
        }), 'INSUFFICIENT');

        await erc20Automator.increaseAmountBoth(toWei(2), otherAmount, oleAmount, otherAmount, {
            from: alice
        });

        // xole check
        assertPrint("Alice's balance of ole", "998000000000000000000", await ole.balanceOf(alice));
        assertPrint("Alice's balance of usdt", "998000000000000000000", await usdt.balanceOf(alice));
        assertPrint("Alice's balance of xole", "2041600000000000000", await xole.balanceOf(alice));

    })

    it("Native automator increaseAmountOLE test", async () => {
        await xole.setOleLpStakeToken(oleWethLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(nativeAutomator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        await nativeAutomator.createLockBoth(toWei(2), 0, unlockTime, oleAmount, otherAmount, {
            from: alice,
            value: otherAmount
        });

        //minAmount check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        await assertThrows(nativeAutomator.increaseAmountOLE(oleAmount, toWei(1), toWei(1), {
            from: alice
        }), 'INSUFFICIENT');
        //back remainder check
        let ethBalanceBefore = await web3.eth.getBalance(alice);
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        let r = await nativeAutomator.increaseAmountOLE(toWei(2), toWei(0), toWei(0), {
            from: alice
        });
        m.log("increaseAmountOLE Gas Used:", r.receipt.gasUsed);

        let ethBalanceAfter = await web3.eth.getBalance(alice);
        assertPrint("Alice back 0.2 eth", toBN(ethBalanceAfter).sub(toBN(ethBalanceBefore)).gt(toWei(0)), true);

        //xole check
        assertPrint("Alice's balance of ole", "997000000000000000000", await ole.balanceOf(alice));
        assertPrint("Alice's balance of xole", "1701333333333333332", await xole.balanceOf(alice));

    })

    it("Erc20 automator increaseAmountOLE test", async () => {
        await xole.setOleLpStakeToken(oleUsdtLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(erc20Automator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});
        await erc20Automator.createLockBoth(toWei(2), otherAmount, unlockTime, oleAmount, otherAmount, {
            from: alice
        });

        //minAmount check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await assertThrows(erc20Automator.increaseAmountOLE(oleAmount, toWei(1), toWei(1), {
            from: alice
        }), 'INSUFFICIENT');
        //back remainder check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await erc20Automator.increaseAmountOLE(toWei(2), toWei(0), toWei(0), {
            from: alice
        });
        //xole check
        assertPrint("Alice's balance of ole", "997000000000000000000", await ole.balanceOf(alice));
        assertPrint("Alice's balance of usdt", "999220442664887109331", await usdt.balanceOf(alice));
        assertPrint("Alice's balance of xole", "1701333333333333332", await xole.balanceOf(alice));

    })

    it("Native automator increaseAmountOther test", async () => {
        await xole.setOleLpStakeToken(oleWethLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(nativeAutomator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        await nativeAutomator.createLockBoth(toWei(2), 0, unlockTime, oleAmount, otherAmount, {
            from: alice,
            value: otherAmount
        });

        //minAmount check
        await assertThrows(nativeAutomator.increaseAmountOther(0, toWei(1), toWei(1), {
            from: alice,
            value: otherAmount
        }), 'INSUFFICIENT');
        //back remainder check

        let r = await nativeAutomator.increaseAmountOther(0, toWei(0), toWei(0), {
            from: alice,
            value: toWei(2)
        });
        m.log("increaseAmountOther Gas Used:", r.receipt.gasUsed);

        //xole check
        assertPrint("Alice's balance of xole", "1701333333333333332", await xole.balanceOf(alice));
        assertPrint("Alice's balance of ole", "999220442664887109331", await ole.balanceOf(alice));
    })

    it("Erc20 automator increaseAmountOther test", async () => {
        await xole.setOleLpStakeToken(oleUsdtLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(erc20Automator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});

        await erc20Automator.createLockBoth(toWei(2), otherAmount, unlockTime, oleAmount, otherAmount, {
            from: alice
        });

        //minAmount check
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});
        await assertThrows(erc20Automator.increaseAmountOther(otherAmount, toWei(1), toWei(1), {
            from: alice,
        }), 'INSUFFICIENT');
        //back remainder check
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});
        await erc20Automator.increaseAmountOther(toWei(2), toWei(0), toWei(0), {
            from: alice
        });
        //xole check
        assertPrint("Alice's balance of xole", "1701333333333333332", await xole.balanceOf(alice));
        assertPrint("Alice's balance of ole", "999220442664887109331", await ole.balanceOf(alice));
    })

    it("Native automator withdrawBoth test", async () => {
        await xole.setOleLpStakeToken(oleWethLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(nativeAutomator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        await nativeAutomator.createLockBoth(toWei(2), 0, unlockTime, oleAmount, otherAmount, {
            from: alice,
            value: otherAmount
        });
        await advanceBlockAndSetTime(unlockTime + WEEK);
        //minAmount check
        await assertThrows(nativeAutomator.withdrawBoth(toWei(2), toWei(2), {
            from: alice
        }), 'INSUFFICIENT');
        let ethBalanceBefore = await web3.eth.getBalance(alice);

        let r = await nativeAutomator.withdrawBoth(0, 0, {
            from: alice
        });
        m.log("withdrawBoth Gas Used:", r.receipt.gasUsed);

        let ethBalanceAfter = await web3.eth.getBalance(alice);
        assertPrint("Alice back 1 eth", toBN(ethBalanceAfter).sub(toBN(ethBalanceBefore)).gt(toWei(0)), true);
        //xole check
        assertPrint("Alice's balance of xole", "0", await xole.balanceOf(alice));
        assertPrint("Alice's balance of ole", "1000000000000000000000", await ole.balanceOf(alice));

    })

    it("Erc20 automator withdrawBoth test", async () => {
        await xole.setOleLpStakeToken(oleUsdtLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(erc20Automator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});
        await erc20Automator.createLockBoth(toWei(2), otherAmount, unlockTime, oleAmount, otherAmount, {
            from: alice
        });
        await advanceBlockAndSetTime(unlockTime + WEEK);
        //minAmount check
        await assertThrows(erc20Automator.withdrawBoth(toWei(2), toWei(2), {
            from: alice
        }), 'INSUFFICIENT');

        await erc20Automator.withdrawBoth(0, 0, {
            from: alice
        });
        //xole check
        assertPrint("Alice's balance of xole", "0", await xole.balanceOf(alice));
        assertPrint("Alice's balance of usdt", "1000000000000000000000", await usdt.balanceOf(alice));
        assertPrint("Alice's balance of ole", "1000000000000000000000", await ole.balanceOf(alice));

    })

    it("Native automator withdrawOle test", async () => {
        await xole.setOleLpStakeToken(oleWethLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(nativeAutomator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        await nativeAutomator.createLockBoth(toWei(2), 0, unlockTime, oleAmount, otherAmount, {
            from: alice,
            value: otherAmount
        });
        await advanceBlockAndSetTime(unlockTime + WEEK);
        //minAmount check
        await assertThrows(nativeAutomator.withdrawOle(toWei(2), toWei(2), {
            from: alice
        }), 'INSUFFICIENT');

        let r = await nativeAutomator.withdrawOle(0, 0, {
            from: alice
        });
        m.log("withdrawOle Gas Used:", r.receipt.gasUsed);

        //xole check
        assertPrint("Alice's balance of xole", "0", await xole.balanceOf(alice));
        assertPrint("Alice's balance of ole", "1000499248873309964947", await ole.balanceOf(alice));

    })

    it("Erc20 automator withdrawOle test", async () => {
        await xole.setOleLpStakeToken(oleUsdtLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(erc20Automator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});
        await erc20Automator.createLockBoth(toWei(2), otherAmount, unlockTime, oleAmount, otherAmount, {
            from: alice
        });
        await advanceBlockAndSetTime(unlockTime + WEEK);
        //minAmount check
        await assertThrows(erc20Automator.withdrawOle(toWei(2), toWei(2), {
            from: alice
        }), 'INSUFFICIENT');

        await erc20Automator.withdrawOle(0, 0, {
            from: alice
        });
        //xole check
        assertPrint("Alice's balance of xole", "0", await xole.balanceOf(alice));
        assertPrint("Alice's balance of ole", "1000499248873309964947", await ole.balanceOf(alice));

    })

    it("Native automator withdrawOther test", async () => {
        await xole.setOleLpStakeToken(oleWethLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(nativeAutomator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(nativeAutomator.address, toWei(2), {from: alice});
        await nativeAutomator.createLockBoth(toWei(2), 0, unlockTime, oleAmount, otherAmount, {
            from: alice,
            value: otherAmount
        });
        await advanceBlockAndSetTime(unlockTime + WEEK);
        //minAmount check
        await assertThrows(nativeAutomator.withdrawOther(toWei(2), toWei(2), {
            from: alice
        }), 'INSUFFICIENT');


        let ethBalanceBefore = await web3.eth.getBalance(alice);
        let r = await nativeAutomator.withdrawOther(0, 0, {
            from: alice
        });
        m.log("withdrawOther Gas Used:", r.receipt.gasUsed);

        let ethBalanceAfter = await web3.eth.getBalance(alice);
        assertPrint("Alice back 1.4 eth", toBN(ethBalanceAfter).sub(toBN(ethBalanceBefore)).gt(toWei(1)), true);

        //xole check
        assertPrint("Alice's balance of xole", "0", await xole.balanceOf(alice));

    })

    it("Erc20 automator withdrawOther test", async () => {
        await xole.setOleLpStakeToken(oleUsdtLpToken, {from: admin});
        await xole.setOleLpStakeAutomator(erc20Automator.address, {from: admin});
        let oleAmount = toWei(1);
        let otherAmount = toWei(1);
        let unlockTime = (await web3.eth.getBlock('latest')).timestamp + 3 * WEEK + DAY;
        //back remainder check
        await ole.approve(erc20Automator.address, toWei(2), {from: alice});
        await usdt.approve(erc20Automator.address, toWei(2), {from: alice});
        await erc20Automator.createLockBoth(toWei(2), otherAmount, unlockTime, oleAmount, otherAmount, {
            from: alice
        });
        await advanceBlockAndSetTime(unlockTime + WEEK);
        //minAmount check
        await assertThrows(erc20Automator.withdrawOther(toWei(2), toWei(2), {
            from: alice
        }), 'INSUFFICIENT');

        await erc20Automator.withdrawOther(0, 0, {
            from: alice
        });

        //xole check
        assertPrint("Alice's balance of xole", "0", await xole.balanceOf(alice));
        assertPrint("Alice's balance of usdt", "1000499248873309964947", await usdt.balanceOf(alice));

    })

    /*** Admin Test ***/

    it("Admin initialize test", async () => {
        await assertThrows(nativeAutomator.initialize(admin, admin, admin, admin, admin, admin, {from: alice}), 'NAD');
        await nativeAutomator.initialize(admin, admin, admin, admin, admin, admin, {from: admin});
    })

    it("Admin setImplementation test", async () => {
        let automator = await OleLpStakeAutomatorDelegator.at(nativeAutomator.address);
        await assertThrows(automator.setImplementation(admin, {from: alice}), 'caller must be admin');
        await automator.setImplementation(admin, {from: admin});
    });

})
