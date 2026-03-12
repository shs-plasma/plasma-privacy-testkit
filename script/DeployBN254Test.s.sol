// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BN254PrecompileTest.sol";

contract DeployBN254Test is Script {
    function run() external {
        vm.startBroadcast();

        BN254PrecompileTest tester = new BN254PrecompileTest();

        vm.stopBroadcast();

        console.log("BN254 Tester:", address(tester));
        console.log("");
        console.log("Run the tests with:");
        console.log("  cast send <address> 'runAllTests()' --rpc-url $PLASMA_TESTNET_RPC --private-key <key>");
        console.log("");
        console.log("Or read individual tests (no gas cost):");
        console.log("  cast call <address> 'testEcAdd()(bool)' --rpc-url $PLASMA_TESTNET_RPC");
        console.log("  cast call <address> 'testEcMul()(bool)' --rpc-url $PLASMA_TESTNET_RPC");
        console.log("  cast call <address> 'testEcPairing()(bool)' --rpc-url $PLASMA_TESTNET_RPC");
        console.log("  cast call <address> 'benchmarkGas()(uint256,uint256,uint256)' --rpc-url $PLASMA_TESTNET_RPC");
    }
}
