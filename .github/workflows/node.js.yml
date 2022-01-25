# This workflow will do a clean install of node dependencies, cache/restore them, build the source code and run tests across different versions of node
# For more information see: https://help.github.com/actions/language-and-framework-guides/using-nodejs-with-github-actions

name: Node.js CI

on:
  push:
    branches: [ main, tax-token-support ]
  pull_request:
    branches: [ main ]

jobs:
  build:

    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [14.17.5]

    steps:
    - name: Count Lines of Code (cloc)
      uses: djdefi/cloc-action@3

    - uses: actions/checkout@v2
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v2
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    - run: npm init -y      
    - run: npm install truffle -g
    - run: npm install ganache-cli -g
    - run: npm install
    - run: truffle compile
    - run: cp node_modules/@uniswap/v2-core/build/UniswapV2Factory.json build/contracts
    - run: cp node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json build/contracts
    - run: nohup ganache-cli --gasLimit 8000000 --account="0x00499985b3bbff7aeac8cef64b959c8f384f47388596a59a6eab3377999b96c5,10000000000000000000000" --account="0xa06e28a7c518d240d543c815b598324445bceb6c4bcd06c99d54ad2794df2925,10000000000000000000000" --account="0xbb830b9d3798a1cab317cb9622b72cd89ca95713794fd333760c09d1ff7b6478,10000000000000000000000" --account="0x6266f34225150f24b6167374a97c7108ed2f1a9ceb5917c551c7a05a8bcf8b15,10000000000000000000000" --account="0x08c0b9cfd6bf5a970a26456bf5db7b46d22d91f406f64931cde609f457fa0b29,10000000000000000000000" --account="0xe65eef72928865d3b974b51c2975230b0b888167b90121e8e6bffb95069e7539,10000000000000000000000" --account="0xc7e9b30d1417fb0dba4d9131fbddfaffb5f442da9da1d33cc26f0c3e5436b790,10000000000000000000000" --account="0xe0c545b4b124fd0f97fccaaa06e83255dd7a4a6bafd663fc7ffc41bfd0fcaf2a,10000000000000000000000" --account="0x9eb8bbdf7594b5824bfdfe5ff23fb49ca4173f809320e94985fc9e56bd5e759a,10000000000000000000000" --account="0x124a4f6a5ea1f430e4dcafe485fcd1b4e0cca96337d659f37d6e1134b0193fbb,10000000000000000000000" --account="0x81da00a5dd36abe0e34e0bbed52fe2686a9d56e501424d851e275579b3c15f4c,10000000000000000000000" --account="0x3ecb4318a48845f7d35b425f346b1d575dbeca915b9995a6d319bab7296ec6df,10000000000000000000000" &
    - run: truffle test --compile-none

# - run: cloc contracts --by-file --exclude-dir test
