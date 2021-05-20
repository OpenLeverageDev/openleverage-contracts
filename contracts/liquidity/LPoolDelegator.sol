// SPDX-License-Identifier: MIT
pragma solidity 0.7.3;

import "./LPoolInterface.sol";
import "../Adminable.sol";
import "../DelegatorInterface.sol";


/**
 * @title Compound's LPoolDelegator Contract
 * LTokens which wrap an EIP-20 underlying and delegate to an implementation
 * @author Compound
 */
contract LPoolDelegator is DelegatorInterface, LPoolInterface, Adminable {


    constructor() {
        admin = msg.sender;
    }
    function initialize(address underlying_,
        address contoller_,
        uint256 baseRatePerYear,
        uint256 multiplierPerYear,
        uint256 jumpMultiplierPerYear,
        uint256 kink_,

        uint initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_,
        address implementation_) external onlyAdmin {
        require(implementation == address(0), "initialize once");
        // Creator of the contract is admin during initialization
        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address,address,uint256,uint256,uint256,uint256,uint256,string,string,uint8)",
            underlying_,
            contoller_,
            baseRatePerYear,
            multiplierPerYear,
            jumpMultiplierPerYear,
            kink_,
            initialExchangeRateMantissa_,
            name_,
            symbol_,
            decimals_));

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

    /**
     * Sender supplies assets into the market and receives lTokens in exchange
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param mintAmount The amount of the underlying asset to supply
     */
    function mint(uint mintAmount) external override {
        delegateToImplementation(abi.encodeWithSignature("mint(uint256)", mintAmount));
    }

    /**
     * Sender redeems lTokens in exchange for the underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemTokens The number of lTokens to redeem into underlying
     */
    function redeem(uint redeemTokens) external override {
        delegateToImplementation(abi.encodeWithSignature("redeem(uint256)", redeemTokens));
    }

    /**
     * Sender redeems lTokens in exchange for a specified amount of underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemAmount The amount of underlying to redeem
     */
    function redeemUnderlying(uint redeemAmount) external override {
        delegateToImplementation(abi.encodeWithSignature("redeemUnderlying(uint256)", redeemAmount));
    }

    function borrowBehalf(address borrower, uint borrowAmount) external override {
        delegateToImplementation(abi.encodeWithSignature("borrowBehalf(address,uint256)", borrower, borrowAmount));
    }
    /**
     * Sender repays a borrow belonging to borrower
     * @param borrower the account with the debt being payed off
     * @param repayAmount The amount to repay
     */
    function repayBorrowBehalf(address borrower, uint repayAmount) external override {
        delegateToImplementation(abi.encodeWithSignature("repayBorrowBehalf(address,uint256)", borrower, repayAmount));
    }


    /**
     * Transfer `amount` tokens from `msg.sender` to `dst`
     * @param dst The address of the destination account
     * @param amount The number of tokens to transfer
     * @return Whether or not the transfer succeeded
     */
    function transfer(address dst, uint amount) external override returns (bool) {
        bytes memory data = delegateToImplementation(abi.encodeWithSignature("transfer(address,uint256)", dst, amount));
        return abi.decode(data, (bool));
    }

    /**
     * Transfer `amount` tokens from `src` to `dst`
     * @param src The address of the source account
     * @param dst The address of the destination account
     * @param amount The number of tokens to transfer
     * @return Whether or not the transfer succeeded
     */
    function transferFrom(address src, address dst, uint256 amount) external override returns (bool) {
        bytes memory data = delegateToImplementation(abi.encodeWithSignature("transferFrom(address,address,uint256)", src, dst, amount));
        return abi.decode(data, (bool));
    }

    /**
     * Approve `spender` to transfer up to `amount` from `src`
     * @dev This will overwrite the approval amount for `spender`
     *  and is subject to issues noted [here](https://eips.ethereum.org/EIPS/eip-20#approve)
     * @param spender The address of the account which may transfer tokens
     * @param amount The number of tokens that are approved (-1 means infinite)
     * @return Whether or not the approval succeeded
     */
    function approve(address spender, uint256 amount) external override returns (bool) {
        bytes memory data = delegateToImplementation(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        return abi.decode(data, (bool));
    }

    /**
     * Get the current allowance from `owner` for `spender`
     * @param owner The address of the account which owns the tokens to be spent
     * @param spender The address of the account which may transfer tokens
     * @return The number of tokens allowed to be spent (-1 means infinite)
     */
    function allowance(address owner, address spender) external override view returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("allowance(address,address)", owner, spender));
        return abi.decode(data, (uint));
    }

    /**
     * Get the token balance of the `owner`
     * @param owner The address of the account to query
     * @return The number of tokens owned by `owner`
     */
    function balanceOf(address owner) external override view returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("balanceOf(address)", owner));
        return abi.decode(data, (uint));
    }

    /**
     * Get the underlying balance of the `owner`
     * @dev This also accrues interest in a transaction
     * @param owner The address of the account to query
     * @return The amount of underlying owned by `owner`
     */
    function balanceOfUnderlying(address owner) external override returns (uint) {
        bytes memory data = delegateToImplementation(abi.encodeWithSignature("balanceOfUnderlying(address)", owner));
        return abi.decode(data, (uint));
    }

    /**
     * Get a snapshot of the account's balances, and the cached exchange rate
     * @dev This is used by comptroller to more efficiently perform liquidity checks.
     * @param account Address of the account to snapshot
     * @return ( token balance, borrow balance, exchange rate mantissa)
     */
    function getAccountSnapshot(address account) external override view returns (uint, uint, uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("getAccountSnapshot(address)", account));
        return abi.decode(data, (uint, uint, uint));
    }

    /**
     * Returns the current per-block borrow interest rate for this cToken
     * @return The borrow interest rate per block, scaled by 1e18
     */
    function borrowRatePerBlock() external override view returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("borrowRatePerBlock()"));
        return abi.decode(data, (uint));
    }

    /**
     * Returns the current per-block supply interest rate for this cToken
     * @return The supply interest rate per block, scaled by 1e18
     */
    function supplyRatePerBlock() external override view returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("supplyRatePerBlock()"));
        return abi.decode(data, (uint));
    }

    /**
     * Return the available amount for borrow in the pool
     * @return The available amount for borrow in the pool, scaled by 1e18
     */
    function availableForBorrow() external override view returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("availableForBorrow()"));
        return abi.decode(data, (uint));
    }

    /**
     * Returns the current total borrows plus accrued interest
     * @return The total borrows with interest
     */
    function totalBorrowsCurrent() external view override returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("totalBorrowsCurrent()"));
        return abi.decode(data, (uint));
    }
    /**
     * Accrue interest to updated borrowIndex and then calculate account's borrow balance using the updated borrowIndex
     * @param account The address whose balance should be calculated after updating borrowIndex
     * @return The calculated balance
     */
    function borrowBalanceCurrent(address account) external view override returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("borrowBalanceCurrent(address)", account));
        return abi.decode(data, (uint));
    }

    function borrowBalanceStored(address account) external override view returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("borrowBalanceStored(address)", account));
        return abi.decode(data, (uint));
    }

    /**
      * Accrue interest then return the up-to-date exchange rate
      * @return Calculated exchange rate scaled by 1e18
      */
    function exchangeRateCurrent() public override returns (uint) {
        bytes memory data = delegateToImplementation(abi.encodeWithSignature("exchangeRateCurrent()"));
        return abi.decode(data, (uint));
    }

    /**
     * Calculates the exchange rate from the underlying to the CToken
     * @dev This function does not accrue interest before calculating the exchange rate
     * @return Calculated exchange rate scaled by 1e18
     */
    function exchangeRateStored() public override view returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("exchangeRateStored()"));
        return abi.decode(data, (uint));
    }

    /**
     * Get cash balance of this cToken in the underlying asset
     * @return The quantity of underlying asset owned by this contract
     */
    function getCash() external override view returns (uint) {
        bytes memory data = delegateToViewImplementation(abi.encodeWithSignature("getCash()"));
        return abi.decode(data, (uint));
    }

    /**
      * Applies accrued interest to total borrows and reserves.
      * @dev This calculates interest accrued from the last checkpointed block
      *      up to the current block and writes new checkpoint to storage.
      */
    function accrueInterest() public override {
        delegateToImplementation(abi.encodeWithSignature("accrueInterest()"));
    }

    /*** Admin Functions ***/

    /**
      * Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
      * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
      * @param newPendingAdmin New pending admin.
      */
    function setPendingAdmin(address payable newPendingAdmin) external override {
        delegateToImplementation(abi.encodeWithSignature("setPendingAdmin(address)", newPendingAdmin));
    }

    /**
  * Accepts transfer of admin rights. msg.sender must be pendingAdmin
  * @dev Admin function for pending admin to accept role and update admin
  */
    function acceptAdmin() external override {
        delegateToImplementation(abi.encodeWithSignature("acceptAdmin()"));
    }

    /**
      * Sets a new comptroller for the market
      * @dev Admin function to set a new comptroller
      */
    function setController(address newController) public override {
        delegateToImplementation(abi.encodeWithSignature("setController(address)", newController));
    }

    function setBorrowCapFactorMantissa(uint newBorrowCapFactorMantissa) public override {
        delegateToImplementation(abi.encodeWithSignature("setBorrowCapFactorMantissa(uint256)", newBorrowCapFactorMantissa));
    }


    function setInterestParams(uint baseRatePerBlock_, uint multiplierPerBlock_, uint jumpMultiplierPerBlock_, uint kink_) public override {
        delegateToImplementation(abi.encodeWithSignature("setInterestParams(uint256,uint256,uint256,uint256)", baseRatePerBlock_, multiplierPerBlock_, jumpMultiplierPerBlock_, kink_));
    }
    /**
 * Internal method to delegate execution to another contract
 * @dev It returns to the external caller whatever the implementation returns or forwards reverts
 * @param callee The contract to delegatecall
 * @param data The raw data to delegatecall
 * @return The returned bytes from the delegatecall
 */
    function delegateTo(address callee, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory returnData) = callee.delegatecall(data);
        assembly {
            if eq(success, 0) {revert(add(returnData, 0x20), returndatasize())}
        }
        return returnData;
    }

    /**
     * Delegates execution to the implementation contract
     * @dev It returns to the external caller whatever the implementation returns or forwards reverts
     * @param data The raw data to delegatecall
     * @return The returned bytes from the delegatecall
     */
    function delegateToImplementation(bytes memory data) public returns (bytes memory) {
        return delegateTo(implementation, data);
    }

    /**
     * Delegates execution to an implementation contract
     * @dev It returns to the external caller whatever the implementation returns or forwards reverts
     *  There are an additional 2 prefix uints from the wrapper returndata, which we ignore since we make an extra hop.
     * @param data The raw data to delegatecall
     * @return The returned bytes from the delegatecall
     */
    function delegateToViewImplementation(bytes memory data) public view returns (bytes memory) {
        (bool success, bytes memory returnData) = address(this).staticcall(abi.encodeWithSignature("delegateToImplementation(bytes)", data));
        assembly {
            if eq(success, 0) {revert(add(returnData, 0x20), returndatasize())}
        }
        return abi.decode(returnData, (bytes));
    }

    /**
     * Delegates execution to an implementation contract
     * @dev It returns to the external caller whatever the implementation returns or forwards reverts
     */
    receive() external payable {
        require(msg.value == 0, "cannot send value to fallback");
        // delegate all other functions to current implementation
        (bool success,) = implementation.delegatecall(msg.data);

        assembly {
            let free_mem_ptr := mload(0x40)
            returndatacopy(free_mem_ptr, 0, returndatasize())

            switch success
            case 0 {revert(free_mem_ptr, returndatasize())}
            default {return (free_mem_ptr, returndatasize())}
        }
    }
}
