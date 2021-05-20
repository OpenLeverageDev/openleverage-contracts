// SPDX-License-Identifier: MIT
pragma solidity 0.7.3;
import "./liquidity/LPoolInterface.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


library Types {
    using SafeERC20 for IERC20;

    struct Market {
        LPoolInterface pool0;
        LPoolInterface pool1;
        uint32 marginRatio; // Two decimal in percentage, ex. 15.32% => 1532
        uint pool0Insurance;
        uint pool1Insurance;
    }

    struct MarketVars {
        LPoolInterface buyPool;
        LPoolInterface sellPool;
        IERC20 buyToken;
        IERC20 sellToken;
        uint buyPoolInsurance;
        uint sellPoolInsurance;
        uint32 marginRatio;
    }

    struct TradeVars {
        uint depositValue;
        IERC20 depositErc20;
        uint fees;
        uint depositAfterFees;
        uint tradeSize;
        uint newHeld;
    }

    struct Trade {
        uint deposited;
        uint depositFixedValue;
        uint held;
        uint marketValueOpen;
        address liqMarker;
        uint liqBlockNum;
        bool depositToken;
        uint lastBlockNum;
    }

    struct LiquidateVars {
        uint settlePrice;
        uint8 priceDecimals;
        uint borrowed;
        uint fees;
        uint remaining;
    }

}
