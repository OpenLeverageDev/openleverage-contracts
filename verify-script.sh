#!bin/bash

echo starting verify contact network $1.

truffle run verify OLEToken --network  $1
truffle run verify Timelock --network  $1
truffle run verify GovernorAlpha --network  $1
truffle run verify Reserve --network  $1
truffle run verify PriceOracleV2 --network  $1
#truffle run verify LPool --network  $1
truffle run verify TreasuryDelegator --network  $1
truffle run verify Treasury --network  $1
truffle run verify ControllerV1 --network  $1
truffle run verify ControllerDelegator --network  $1
truffle run verify OpenLevV1 --network  $1
truffle run verify OpenLevDelegator --network  $1
truffle run verify Referral --network  $1
truffle run verify ReferralDelegator --network  $1

truffle run verify OLETokenLock --network  $1
truffle run verify FarmingPool --network  $1

echo finished verify contact network $1.
