// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.7.6;

import "./XOLE.sol";

contract SOLE is XOLE {
    function enableClaimable(address gov) public onlyAdmin {
        IBlast(0x4300000000000000000000000000000000000002).configure(IBlast.YieldMode.CLAIMABLE, IBlast.GasMode.CLAIMABLE, gov);
        IBlastPoints(0x2536FE9ab3F511540F2f9e2eC2A805005C3Dd800).configurePointsOperator(gov);
    }
    function setOleLpStakeToken2(address _oleLpStakeToken) external onlyAdmin {
        oleLpStakeToken = IERC20(_oleLpStakeToken);
    }
}

interface IBlast {
    enum YieldMode {
        AUTOMATIC,
        DISABLED,
        CLAIMABLE
    }


    enum GasMode {
        VOID,
        CLAIMABLE
    }

    function configure(YieldMode _yield, GasMode gasMode, address governor) external;
}

interface IBlastPoints {
    function configurePointsOperator(address operator) external;
}