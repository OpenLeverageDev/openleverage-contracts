// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.6.0 <0.8.0;
pragma experimental ABIEncoderV2;


library DexData {
    uint256 private constant ADDR_SIZE = 20;
    uint256 private constant FEE_SIZE = 3;
    uint256 private constant NEXT_OFFSET = ADDR_SIZE + FEE_SIZE;
    uint256 private constant POP_OFFSET = NEXT_OFFSET + ADDR_SIZE;
    uint256 private constant MULTIPLE_POOLS_MIN_LENGTH = POP_OFFSET + NEXT_OFFSET;


    uint constant dexNameStart = 0;
    uint constant dexNameLength = 1;
    uint constant feeStart = 1;
    uint constant feeLength = 3;
    uint constant uniV3QuoteFlagStart = 4;
    uint constant uniV3QuoteFlagLength = 1;

    uint8 constant DEX_UNIV2 = 1;
    uint8 constant DEX_UNIV3 = 2;
    bytes constant UNIV3_FEE0 = hex"02000000";

    struct V3PoolData {
        address tokenA;
        address tokenB;
        uint24 fee;
    }

    function toDex(bytes memory data) internal pure returns (uint8) {
        require(data.length >= dexNameLength, 'dex error');
        uint8 temp;
        assembly {
            temp := byte(0, mload(add(data, add(0x20, dexNameStart))))
        }
        return temp;
    }

    function toFee(bytes memory data) internal pure returns (uint24) {
        require(data.length >= dexNameLength + feeLength, 'fee error');
        uint temp;
        assembly {
            temp := mload(add(data, add(0x20, feeStart)))
        }
        return uint24(temp >> (256 - (feeLength * 8)));
    }
    // true ,sell all
    function toUniV3QuoteFlag(bytes memory data) internal pure returns (bool) {
        require(data.length >= dexNameLength + feeLength + uniV3QuoteFlagLength, 'v3flag error');
        uint8 temp;
        assembly {
            temp := byte(0, mload(add(data, add(0x20, uniV3QuoteFlagStart))))
        }
        return temp > 0;
    }
    // v2 path
    function toUniV2Path(bytes memory data) internal pure returns (address[] memory path) {
        data = slice(data, dexNameLength, data.length - dexNameLength);
        uint pathLength = data.length / 20;
        path = new address[](pathLength);
        for (uint i = 0; i < pathLength; i++) {
            path[i] = toAddress(data, 20 * i);
        }
    }

    // v3 path
    function toUniV3Path(bytes memory data) internal pure returns (V3PoolData[] memory path) {
        data = slice(data, uniV3QuoteFlagStart + uniV3QuoteFlagLength, data.length - (uniV3QuoteFlagStart + uniV3QuoteFlagLength));
        uint pathLength = numPools(data);
        path = new V3PoolData[](pathLength);
        for (uint i = 0; i < pathLength; i++) {
            V3PoolData memory pool;
            if (i != 0) {
                data = slice(data, NEXT_OFFSET, data.length - NEXT_OFFSET);
            }
            pool.tokenA = toAddress(data, 0);
            pool.fee = toUint24(data, ADDR_SIZE);
            pool.tokenB = toAddress(data, NEXT_OFFSET);
            path[i] = pool;
        }
    }

    function numPools(bytes memory path) internal pure returns (uint256) {
        // Ignore the first token address. From then on every fee and token offset indicates a pool.
        return ((path.length - ADDR_SIZE) / NEXT_OFFSET);
    }

    function toUint24(bytes memory _bytes, uint256 _start) internal pure returns (uint24) {
        require(_start + 3 >= _start, 'toUint24_overflow');
        require(_bytes.length >= _start + 3, 'toUint24_outOfBounds');
        uint24 tempUint;
        assembly {
            tempUint := mload(add(add(_bytes, 0x3), _start))
        }
        return tempUint;
    }

    function toAddress(bytes memory _bytes, uint256 _start) internal pure returns (address) {
        require(_start + 20 >= _start, 'toAddress_overflow');
        require(_bytes.length >= _start + 20, 'toAddress_outOfBounds');
        address tempAddress;
        assembly {
            tempAddress := div(mload(add(add(_bytes, 0x20), _start)), 0x1000000000000000000000000)
        }
        return tempAddress;
    }


    function slice(
        bytes memory _bytes,
        uint256 _start,
        uint256 _length
    ) internal pure returns (bytes memory) {
        require(_length + 31 >= _length, 'slice_overflow');
        require(_start + _length >= _start, 'slice_overflow');
        require(_bytes.length >= _start + _length, 'slice_outOfBounds');

        bytes memory tempBytes;

        assembly {
            switch iszero(_length)
            case 0 {
            // Get a location of some free memory and store it in tempBytes as
            // Solidity does for memory variables.
                tempBytes := mload(0x40)

            // The first word of the slice result is potentially a partial
            // word read from the original array. To read it, we calculate
            // the length of that partial word and start copying that many
            // bytes into the array. The first word we copy will start with
            // data we don't care about, but the last `lengthmod` bytes will
            // land at the beginning of the contents of the new array. When
            // we're done copying, we overwrite the full first word with
            // the actual length of the slice.
                let lengthmod := and(_length, 31)

            // The multiplication in the next line is necessary
            // because when slicing multiples of 32 bytes (lengthmod == 0)
            // the following copy loop was copying the origin's length
            // and then ending prematurely not copying everything it should.
                let mc := add(add(tempBytes, lengthmod), mul(0x20, iszero(lengthmod)))
                let end := add(mc, _length)

                for {
                // The multiplication in the next line has the same exact purpose
                // as the one above.
                    let cc := add(add(add(_bytes, lengthmod), mul(0x20, iszero(lengthmod))), _start)
                } lt(mc, end) {
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    mstore(mc, mload(cc))
                }

                mstore(tempBytes, _length)

            //update free-memory pointer
            //allocating the array padded to 32 bytes like the compiler does now
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            //if we want a zero-length slice let's just return a zero-length array
            default {
                tempBytes := mload(0x40)
            //zero out the 32 bytes slice we are about to return
            //we need to do it because Solidity does not garbage collect
                mstore(tempBytes, 0)

                mstore(0x40, add(tempBytes, 0x20))
            }
        }

        return tempBytes;
    }

}
