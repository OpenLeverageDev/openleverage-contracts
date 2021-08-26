# This config is equivalent to both the '.circleci/extended/orb-free.yml' and the base '.circleci/config.yml'
version: 2.1

orbs:
  node: circleci/node@4.1

machine:
  services:
    - docker
  node:
    version: 14.17.5

workflows:
  sample:
    jobs:
      - node/test:
          version: '16.8.0'
          # This is the node version to use for the `cimg/node` tag
          # Relevant tags can be found on the CircleCI Developer Hub
          # https://circleci.com/developer/images/image/cimg/node
