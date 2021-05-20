#!bin/bash

echo starting verify contact network $1.

truffle run verify LToken --network  $1
truffle run verify USDTToken --network  $1
truffle run verify Timelock --network  $1
truffle run verify GovernorAlpha --network  $1
truffle run verify Reserve --network  $1
truffle run verify Treasury --network  $1
truffle run verify LPool --network  $1
truffle run verify JumpRateModel --network  $1
truffle run verify PriceOracleV2 --network  $1
truffle run verify ControllerV1 --network  $1
truffle run verify ControllerDelegator --network  $1
truffle run verify LeverV1 --network  $1
truffle run verify LeverDelegator --network  $1
truffle run verify FarmingPool --network  $1

echo finished verify contact network $1.
