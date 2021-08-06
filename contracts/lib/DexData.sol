// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;


library DexData {
    uint constant dexNameStart = 0;
    uint constant dexNameLength = 1;
    uint constant feeStart = 1;
    uint constant feeLength = 3;
    uint constant canBuyAmountStart = 4;
    uint constant canBuyAmountLength = 32;

    uint8 constant DEX_UNIV2 = 0;
    uint8 constant DEX_UNIV3 = 1;
    bytes constant UNIV3_FEE0 =hex"01000000";

    function toDex(bytes memory data) internal pure returns (uint8) {
        require(data.length >= dexNameLength, 'dex_outOfBounds');
        uint8 temp;
        assembly {
            temp := byte(0, mload(add(data, add(0x20, dexNameStart))))
        }
        return temp;
    }

    function toFee(bytes memory data) internal pure returns (uint24) {
        require(data.length >= dexNameLength + feeLength, 'fee_outOfBounds');
        uint temp;
        assembly {
            temp := mload(add(data, add(0x20, feeStart)))
        }
        return uint24(temp >> (256 - (feeLength * 8)));
    }

    function toCanBuyAmount(bytes memory data) internal pure returns (uint) {
        require(data.length >= dexNameLength + feeLength + canBuyAmountLength, 'buyamount_outOfBounds');
        uint temp;
        assembly {
            temp := mload(add(data, add(0x20, canBuyAmountStart)))
        }
        return temp;
    }
}
