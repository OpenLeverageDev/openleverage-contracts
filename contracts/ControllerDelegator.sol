// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

import "./Adminable.sol";
import "./DelegatorInterface.sol";
import "./ControllerInterface.sol";


contract ControllerDelegator is DelegatorInterface, ControllerInterface, ControllerStorage, Adminable {

    constructor(ERC20 _oleToken,
        address _wChainToken,
        address _lpoolImplementation,
        address _openlev,
        address payable admin_,
        address implementation_) {
        admin = msg.sender;
        // Creator of the contract is admin during initialization
        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address,address,address,address)",
            _oleToken,
            _wChainToken,
            _lpoolImplementation,
            _openlev));
        implementation = implementation_;

        // Set the proper admin now that initialization is done
        admin = admin_;
    }

    /**
     * Called by the admin to update the implementation of the delegator
     * @param implementation_ The address of the new implementation for delegation
     */
    function setImplementation(address implementation_) public override onlyAdmin {
        address oldImplementation = implementation;
        implementation = implementation_;
        emit NewImplementation(oldImplementation, implementation);
    }

    /*** Policy Hooks ***/

    function mintAllowed(address lpool, address minter, uint mintAmount) external override {
        delegateToImplementation(abi.encodeWithSignature("mintAllowed(address,address,uint256)", lpool, minter, mintAmount));
    }

    function transferAllowed(address lpool, address from, address to) external override {
        delegateToImplementation(abi.encodeWithSignature("transferAllowed(address,address,address)", lpool, from, to));
    }

    function redeemAllowed(address lpool, address redeemer, uint redeemTokens) external override {
        delegateToImplementation(abi.encodeWithSignature("redeemAllowed(address,address,uint256)", lpool, redeemer, redeemTokens));
    }

    function borrowAllowed(address lpool, address borrower, address payee, uint borrowAmount) external override {
        delegateToImplementation(abi.encodeWithSignature("borrowAllowed(address,address,address,uint256)", lpool, borrower, payee, borrowAmount));
    }

    function repayBorrowAllowed(address lpool, address payer, address borrower, uint repayAmount, bool isEnd) external override {
        delegateToImplementation(abi.encodeWithSignature("repayBorrowAllowed(address,address,address,uint256,bool)", lpool, payer, borrower, repayAmount, isEnd));
    }

    function liquidateAllowed(uint marketId, address liquidator, uint liquidateAmount, bytes memory dexData) external override {
        delegateToImplementation(abi.encodeWithSignature("liquidateAllowed(uint256,address,uint256,bytes)", marketId, liquidator, liquidateAmount, dexData));
    }

    function marginTradeAllowed(uint marketId) external override {
        delegateToImplementation(abi.encodeWithSignature("marginTradeAllowed(uint256)", marketId));
    }

    /*** Admin Functions ***/

    function setLPoolImplementation(address _lpoolImplementation) external override {
        delegateToImplementation(abi.encodeWithSignature("setLPoolImplementation(address)", _lpoolImplementation));
    }

    function setOpenLev(address _openlev) external override {
        delegateToImplementation(abi.encodeWithSignature("setOpenLev(address)", _openlev));
    }

    function setInterestParam(uint256 _baseRatePerBlock, uint256 _multiplierPerBlock, uint256 _jumpMultiplierPerBlock, uint256 _kink) external override {
        delegateToImplementation(abi.encodeWithSignature("setInterestParam(uint256,uint256,uint256,uint256)", _baseRatePerBlock, _multiplierPerBlock, _jumpMultiplierPerBlock, _kink));
    }

    function setLPoolUnAllowed(address lpool, bool unAllowed) external override {
        delegateToImplementation(abi.encodeWithSignature("setLPoolUnAllowed(address,bool)", lpool, unAllowed));
    }

    function setMarginTradeAllowed(bool isAllowed) external override {
        delegateToImplementation(abi.encodeWithSignature("setMarginTradeAllowed(bool)", isAllowed));
    }

    function createLPoolPair(address tokenA, address tokenB, uint32 marginRatio) external override {
        delegateToImplementation(abi.encodeWithSignature("createLPoolPair(address,address,uint32)", tokenA, tokenB, marginRatio));
    }

    function setOLETokenDistribution(uint moreLiquidatorBalance, uint liquidatorMaxPer, uint liquidatorOLERatio, uint moreSupplyBorrowBalance) external override {
        delegateToImplementation(abi.encodeWithSignature("setOLETokenDistribution(uint256,uint256,uint256,uint256)", moreLiquidatorBalance, liquidatorMaxPer, liquidatorOLERatio, moreSupplyBorrowBalance));
    }

    function distributeRewards2Pool(address pool, uint supplyAmount, uint borrowAmount, uint64 startTime, uint64 duration) external override {
        delegateToImplementation(abi.encodeWithSignature("distributeRewards2Pool(address,uint256,uint256,uint64,uint64)", pool, supplyAmount, borrowAmount, startTime, duration));
    }

    function distributeRewards2PoolMore(address pool, uint supplyAmount, uint borrowAmount) external override {
        delegateToImplementation(abi.encodeWithSignature("distributeRewards2PoolMore(address,uint256,uint256)", pool, supplyAmount, borrowAmount));
    }

    function distributeLiqRewards2Market(uint marketId, bool isDistribution) external override {
        delegateToImplementation(abi.encodeWithSignature("distributeLiqRewards2Market(uint256,bool)", marketId, isDistribution));
    }
    /***Distribution Functions ***/

    function earned(LPoolInterface lpool, address account, bool isBorrow) public override view returns (uint256){
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("earned(address,address,bool)", lpool, account, isBorrow));
        return abi.decode(data, (uint));
    }

    function getSupplyRewards(LPoolInterface[] calldata lpools, address account) external override {
        delegateToImplementation(abi.encodeWithSignature("getSupplyRewards(address[],address)", lpools, account));
    }

}
