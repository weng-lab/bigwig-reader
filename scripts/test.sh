#!/bin/sh

# cd to project root directory
cd "$(dirname $(dirname ${BASH_SOURCE[0]}))"

scripts/run-dependencies.sh
yarn test
scripts/stop-dependencies.sh
