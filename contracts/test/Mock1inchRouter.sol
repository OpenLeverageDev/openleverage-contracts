// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAggregationExecutor {
    function execute(address msgSender) external payable;
}

contract Mock1inchRouter {

    address mockExchangeAddress;
    uint256 public verifyAmount;
    uint256 public verifyMinReturn;
    uint256[] public verifyPools;
    IERC20 public verifySrcToken;
    IERC20 public verifyDstToken;

    uint256 private constant _PARTIAL_FILL = 1 << 0;
    uint256 private constant _REQUIRES_EXTRA_ETH = 1 << 1;

    constructor (address _mockExchangeAddress) {
        mockExchangeAddress = _mockExchangeAddress;
    }

    struct SwapDescription {
        IERC20 srcToken;
        IERC20 dstToken;
        address payable srcReceiver;
        address payable dstReceiver;
        uint256 amount;
        uint256 minReturnAmount;
        uint256 flags;
    }

    function swap(
        IAggregationExecutor executor,
        SwapDescription calldata desc,
        bytes calldata permit,
        bytes calldata data
    )
    external
    payable
    returns (
        uint256 returnAmount,
        uint256 spentAmount
    )
    {
        executor;
        permit;
        data;
        if (desc.amount == 0) revert("ZeroMinReturn1");
        if (desc.minReturnAmount == 0) revert("ZeroMinReturn2");
        IERC20 srcToken = desc.srcToken;
        IERC20 dstToken = desc.dstToken;

        srcToken.transferFrom(msg.sender, desc.srcReceiver, desc.amount);
        _execute(dstToken);
        spentAmount = desc.amount;

        // we leave 1 wei on the router for gas optimisations reasons
        returnAmount = dstToken.balanceOf(address(this));
        if (returnAmount == 0) revert("ZeroReturnAmount");
        { returnAmount--; }
        if (desc.flags & _PARTIAL_FILL != 0) {
            uint256 unspentAmount = srcToken.balanceOf(address(this));
            if (unspentAmount > 1) {
                // we leave 1 wei on the router for gas optimisations reasons
                { unspentAmount--; }
                spentAmount -= unspentAmount;
                srcToken.transfer(payable(msg.sender), unspentAmount);
            }
            if (returnAmount * desc.amount < desc.minReturnAmount * spentAmount) revert("ReturnAmountIsNotEnough1");
        } else {
            if (returnAmount < desc.minReturnAmount) revert("ReturnAmountIsNotEnough2");
        }

        address payable dstReceiver = (desc.dstReceiver == address(0)) ? payable(msg.sender) : desc.dstReceiver;
        dstToken.transfer(dstReceiver, returnAmount);
    }

    function uniswapV3Swap(
        uint256 amount,
        uint256 minReturn,
        uint256[] calldata pools
    ) external payable returns(uint256 returnAmount) {
        require(amount == verifyAmount, "amount error");
        require(minReturn == verifyMinReturn, "minReturn error");
        uint len = verifyPools.length;
        for(uint i = 0; i < len; i++){
            require(pools[i] == verifyPools[i], "pools error");
        }
        _execute(verifyDstToken);
        returnAmount = verifyDstToken.balanceOf(address(this));
        verifyDstToken.transfer(payable(msg.sender), returnAmount);
    }

    function unoswap(
        IERC20 srcToken,
        uint256 amount,
        uint256 minReturn,
        uint256[] calldata pools
    ) external payable returns(uint256 returnAmount) {
        require(srcToken == verifySrcToken, "srcToken error");
        require(amount == verifyAmount, "amount error");
        require(minReturn == verifyMinReturn, "minReturn error");
        uint len = verifyPools.length;
        for(uint i = 0; i < len; i++){
            require(pools[i] == verifyPools[i], "pools error");
        }
        _execute(verifyDstToken);
        returnAmount = verifyDstToken.balanceOf(address(this));
        verifyDstToken.transfer(payable(msg.sender), returnAmount);
    }

    function clipperSwap(
        uint256 amount,
        uint256 minReturn,
        uint256[] calldata pools
    ) external payable returns(uint256 returnAmount) {
        require(amount == verifyAmount, "amount error");
        require(minReturn == verifyMinReturn, "minReturn error");
        uint len = verifyPools.length;
        for(uint i = 0; i < len; i++){
            require(pools[i] == verifyPools[i], "pools error");
        }
        _execute(verifyDstToken);
        returnAmount = verifyDstToken.balanceOf(address(this));
        verifyDstToken.transfer(payable(msg.sender), returnAmount);
    }

    function setVerifyAmount(uint amount) public {
        verifyAmount = amount;
    }

    function setVerifyMinReturn(uint minReturn) public {
        verifyMinReturn = minReturn;
    }

    function setVerifyPools(uint[] calldata pools) public {
        verifyPools = pools;
    }

    function setVerifySrcToken(IERC20 srcToken) public {
        verifySrcToken = srcToken;
    }

    function setVerifyDstToken(IERC20 dstToken) public {
        verifyDstToken = dstToken;
    }

    function _execute(
        IERC20 dstToken
    ) private {
        dstToken.transferFrom(mockExchangeAddress, address(this), dstToken.balanceOf(mockExchangeAddress));
    }

}

