const {toBN, maxUint} = require("./utils/EtheUtil");
const MockSafeTransfer = artifacts.require("MockSafeTransfer");
const SafeToken = artifacts.require("MockERC20");
const UnSafeToken = artifacts.require("MockUnsafeERC20");


contract("MockSafeTransfer", async accounts => {

  before(async () => {
    // runs once before the first test in this block
  });

  it("transfer test", async () => {
    let safeToken = await SafeToken.new('TestToken', 'TEST');
    await safeToken.mint(accounts[0], toBN(1000000).mul(toBN(1e18)).toString());

    let unSafeToken = await UnSafeToken.new('TestToken', 'TEST',toBN(1000000).mul(toBN(1e18)).toString());

    let safeTransfer = await MockSafeTransfer.new(safeToken.address, unSafeToken.address);
    await safeToken.approve(safeTransfer.address, maxUint());
    await unSafeToken.approve(safeTransfer.address, maxUint());
    await safeTransfer.transferSafe(safeTransfer.address, toBN(1000000).mul(toBN(1e18)).toString());
    await safeTransfer.transferUnSafe(safeTransfer.address, toBN(1000000).mul(toBN(1e18)).toString());
    assert.equal(await safeToken.balanceOf(safeTransfer.address), toBN(1000000).mul(toBN(1e18)).toString());
    assert.equal(await unSafeToken.balanceOf(safeTransfer.address), toBN(1000000).mul(toBN(1e18)).toString());
    assert.equal(await safeToken.balanceOf(accounts[0]), 0);
    assert.equal(await unSafeToken.balanceOf(accounts[0]), 0);
  })

})
