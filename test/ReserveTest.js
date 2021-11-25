const Reserve = artifacts.require("Reserve");
const OLEToken = artifacts.require("OLEToken");
const {toWei} = require("./utils/OpenLevUtil");

contract("Reserve", async accounts => {

    // roles
    let admin = accounts[0];
    let user = accounts[2];

    it("Transfer test", async () => {
        let oleToken = await OLEToken.new(admin, admin, "Open Leverage Token", "OLE");
        await oleToken.mint(admin, toWei(100));
        let reserve = await Reserve.new(admin, oleToken.address);
        oleToken.transfer(reserve.address, toWei(100), {from: admin});
        await reserve.transfer(user, toWei(10), {from: admin});
        assert.equal(toWei(10).toString(), await oleToken.balanceOf(user));
        assert.equal(toWei(90).toString(), await oleToken.balanceOf(reserve.address));
        try {
            await reserve.transfer(user, toWei(10), {from: user});
            assert.fail("should thrown caller must be admin error");
        } catch (error) {
            assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
        }
    })

})
