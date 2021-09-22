const {toBN, maxUint} = require("./utils/EtheUtil");

const {toWei} = require("./utils/OpenLevUtil");


const SafeToken = artifacts.require("MockERC20");

const OpenLevToken = artifacts.require("MockERC20");

const FarmingPool = artifacts.require("FarmingPool");

const m = require('mocha-logger');

const timeMachine = require('ganache-time-traveler');

contract("FarmingPoolTest", async accounts => {


    before(async () => {

    });

    it("One account: ", async () => {
        let _openlevToken = await SafeToken.new('OpenLevToken', 'TEST');
        let _stakeToken = await OpenLevToken.new('SafeToken', 'TEST');


        m.log("New initial point time", (new Date().getTime() + 3000).toString().substr(0, 10))
        let farming = await FarmingPool.new(_openlevToken.address, _stakeToken.address, (new Date().getTime() - 3000).toString().substr(0, 10), '3600');

        await _stakeToken.mint(accounts[0], toWei(100000));
        let balanceInit = await _stakeToken.balanceOf(accounts[0])
        m.log("Original (investment) limit of account: ", balanceInit.toString())


        await _openlevToken.mint(farming.address, toWei(100000));
        await _stakeToken.approve(farming.address, toWei(20000));


        await farming.setRewardDistribution(accounts[0]);
        await farming.notifyRewardAmount(toWei(10000));


        let balance = await _openlevToken.balanceOf(accounts[0])


        m.log("Original amount of account initialization: ", balance.toString());

        let contra = await _openlevToken.balanceOf(farming.address)
        m.log("Original amount of contract: ", contra.toString());

        m.log("Contract to receive award: " + accounts[0]);
        await farming.stake(toWei(20000));


        m.log("Wait for 10 seconds ....");
        let snapshot = await timeMachine.takeSnapshot();
        let snapshotId = snapshot['result'];
        await timeMachine.advanceTime(10000);
        await timeMachine.revertToSnapshot(snapshotId);

        let amount = await farming.earned(accounts[0]);

        m.log("What is the benefit limit: ", amount.toString());

        let balanceOld = await _stakeToken.balanceOf(accounts[0])
        m.log("Account balance: ", balanceOld.toString())


        //Benefit amount
        let reward = await farming.getReward();

        let balanceNew = await _openlevToken.balanceOf(accounts[0])
        m.log("Rewarded account balance: ", balanceNew.toString());
        //assert.equal(balanceNew, (10000 / 36000) * 60 * 1000000000000000000);

        let contraOld = await _openlevToken.balanceOf(farming.address)
        m.log("Contract transaction completion limit: ", contraOld.toString());

    });


    it("Two accounts: ", async () => {
        let _openlevToken = await SafeToken.new('OpenLevToken', 'TEST');
        let _stakeToken = await OpenLevToken.new('SafeToken', 'TEST');


        m.log("New initial point time: ", (new Date().getTime() + 3000).toString().substr(0, 10))
        let farming = await FarmingPool.new(_openlevToken.address, _stakeToken.address, (new Date().getTime()).toString().substr(0, 10), '60');

        await _stakeToken.mint(accounts[0], toWei(100000));
        await _stakeToken.mint(accounts[3], toWei(100000));
        await _stakeToken.approve(farming.address, toWei(20000), {from: accounts[0]});
        await _stakeToken.approve(farming.address, toWei(20000), {from: accounts[3]});


        await _openlevToken.mint(farming.address, toWei(100000));


        await farming.setRewardDistribution(accounts[0]);

        try {
            await farming.notifyRewardAmount(toWei(10000));
            assert.fail("should thrown reward rate too large error");
        } catch (error) {
            assert.include(error.message, 'reward rate too large', 'throws exception with reward rate too large');
        }
        await farming.notifyRewardAmount(toWei(5999));

        await farming.stake(toWei(20000), {from: accounts[0]});

        // Benefit limit
        let snapshot = await timeMachine.takeSnapshot();
        let snapshotId = snapshot['result'];
        m.log("Wait for 10 seconds ....");
        await timeMachine.advanceTime(10000);
        await timeMachine.revertToSnapshot(snapshotId);

        let amount = await farming.earned(accounts[0]);

        m.log("What is the benefit limit: ", amount.toString());

        let balanceOld = await _stakeToken.balanceOf(accounts[0])
        m.log("Account balance: ", balanceOld.toString())


        //Benefit amount
        let reward = await farming.getReward();

        let balanceNew = await _openlevToken.balanceOf(accounts[0])
        m.log("Query the amount of beneficiary account: ", balanceNew.toString());
        //assert.equal(balanceNew, (10000 / 36000) * 60 * 1000000000000000000);

        let contraOld = await _openlevToken.balanceOf(farming.address)
        m.log("Contract transaction completion limit: ", contraOld.toString());


        // Second account
        await farming.stake(toWei(20000), {from: accounts[3]});

        // Benefit limit
        m.log("Wait for 10 seconds ....");
        let snaps = await timeMachine.takeSnapshot();
        let Id = snaps['result'];
        await timeMachine.advanceTime(10000);
        await timeMachine.revertToSnapshot(Id);

        //Benefit amount
        let reward2 = await farming.getReward({from: accounts[3]});
        let balanceNew2 = await _openlevToken.balanceOf(accounts[3])
        let reward3 = await farming.getReward({from: accounts[0]});

        let balanceNew3 = await _openlevToken.balanceOf(accounts[3])
        //assert.equal(balanceNew3, 0);

    });

    it("Drop in the middle：", async () => {
        let _openlevToken = await SafeToken.new('OpenLevToken', 'TEST');
        let _stakeToken = await OpenLevToken.new('SafeToken', 'TEST');

        let farming = await FarmingPool.new(_openlevToken.address, _stakeToken.address, (new Date().getTime()).toString().substr(0, 10), '3600');

        await _stakeToken.mint(accounts[0], toWei(100000));

        await _stakeToken.approve(farming.address, toWei(40000));

        await _openlevToken.mint(farming.address, toWei(100000));
        await farming.setRewardDistribution(accounts[0]);
        await farming.notifyRewardAmount(toWei(10000));


        let changeOwner = await web3.eth.abi.encodeFunctionCall({
            name: 'stake',
            type: 'function',
            inputs: [{
                type: 'uint256',
                name: 'amount'
            }]
        }, [toWei(20000)]);

        // await farming.stake(toWei(20000));
        m.log("estimateGas", await web3.eth.estimateGas({
            to: farming.address,
            data: changeOwner
        }));

        // Benefit limit

        m.log("Wait for 10 seconds ....");
        m.log("Wait for 10 seconds ....");
        let snaps = await timeMachine.takeSnapshot();
        let Id = snaps['result'];
        await timeMachine.advanceTime(10000);
        await timeMachine.revertToSnapshot(Id);

        let changeOwner01 = await web3.eth.abi.encodeFunctionCall({
            name: 'getReward',
            type: 'function',
            inputs: []
        }, []);

        //Benefit amount
        let reward = await farming.getReward();
        m.log("Benefit amount", await web3.eth.estimateGas({
            to: farming.address,
            data: changeOwner01
        }));

        // Query the amount of beneficiary account
        let balanceNew = await _openlevToken.balanceOf(accounts[0])

        m.log("Check the amount of the beneficiary account in the midway: ", balanceNew.toString());
        // assert.equal(balanceNew.toString() > 4599999999999999980000,true);

    });


    // Drop in the middle
    it("Gas_Test：", async () => {
        let _openlevToken = await SafeToken.new('OpenLevToken', 'TEST');
        let _stakeToken = await OpenLevToken.new('SafeToken', 'TEST');

        let farming = await FarmingPool.new(_openlevToken.address, _stakeToken.address, (new Date().getTime()).toString().substr(0, 10), '3600');

        await _stakeToken.mint(accounts[0], toWei(100000));

        await _stakeToken.approve(farming.address, toWei(40000));

        await _openlevToken.mint(farming.address, toWei(100000));
        await farming.setRewardDistribution(accounts[0]);
        await farming.notifyRewardAmount(toWei(10000));


        let changeOwner = await web3.eth.abi.encodeFunctionCall({
            name: 'stake',
            type: 'function',
            inputs: [{
                type: 'uint256',
                name: 'amount'
            }]
        }, [toWei(20000)]);

        // await farming.stake(toWei(20000));
        m.log("estimateGas", await web3.eth.estimateGas({
            to: farming.address,
            data: changeOwner
        }));


        await farming.stake(toWei(20000));
        let withdraw = await web3.eth.abi.encodeFunctionCall({
            name: 'withdraw',
            type: 'function',
            inputs: [{
                type: 'uint256',
                name: 'amount'
            }]
        }, [toWei(10000)]);


        m.log("withdraw ", await web3.eth.estimateGas({
            to: farming.address,
            data: withdraw
        }));

        m.log("Wait for 10 seconds ....");
        let snaps = await timeMachine.takeSnapshot();
        let Id = snaps['result'];
        await timeMachine.advanceTime(10000);
        await timeMachine.revertToSnapshot(Id);


        let exit = await web3.eth.abi.encodeFunctionCall({
            name: 'exit',
            type: 'function',
            inputs: []
        }, []);

        // await farming.stake(toWei(20000));
        m.log("exit", await web3.eth.estimateGas({
            to: farming.address,
            data: exit
        }));


        // benefit limit
        m.log("Wait for 10 seconds ....");
        let takeSnapshot = await timeMachine.takeSnapshot();
        let shotId = takeSnapshot['result'];
        await timeMachine.advanceTime(10000);
        await timeMachine.revertToSnapshot(shotId);


        let getReward = await web3.eth.abi.encodeFunctionCall({
            name: 'getReward',
            type: 'function',
            inputs: []
        }, []);

        // await farming.stake(toWei(20000));
        m.log("getReward", await web3.eth.estimateGas({
            to: farming.address,
            data: getReward
        }));

    });
})


