// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ERC5564Announcer.sol";
import "../src/ERC6538Registry.sol";
import "../src/MockUSDT.sol";

contract DeployStealth is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Deploy stealth infrastructure
        ERC5564Announcer announcer = new ERC5564Announcer();
        ERC6538Registry registry = new ERC6538Registry();

        // 2. Deploy mock USDT (skip if real USDT exists on your chain)
        MockUSDT usdt = new MockUSDT();

        vm.stopBroadcast();

        console.log("=== Stealth Infrastructure Deployed ===");
        console.log("Announcer:", address(announcer));
        console.log("Registry: ", address(registry));
        console.log("Mock USDT:", address(usdt));
    }
}
