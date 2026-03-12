// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BN254PrecompileTest.sol";

contract BN254Test is Test {
    BN254PrecompileTest tester;

    function setUp() public {
        tester = new BN254PrecompileTest();
    }

    function test_ecAdd() public view {
        assertTrue(tester.testEcAdd(), "ecAdd precompile (0x06) failed");
    }

    function test_ecMul() public view {
        assertTrue(tester.testEcMul(), "ecMul precompile (0x07) failed");
    }

    function test_ecPairing() public view {
        assertTrue(tester.testEcPairing(), "ecPairing precompile (0x08) failed");
    }

    function test_invalidInputHandling() public view {
        assertTrue(tester.testEcAddInvalid(), "Should handle invalid input gracefully");
    }

    function test_gasReport() public {
        (uint256 addGas, uint256 mulGas, uint256 pairingGas) = tester.benchmarkGas();

        // Log gas costs
        emit log_named_uint("ecAdd gas", addGas);
        emit log_named_uint("ecMul gas", mulGas);
        emit log_named_uint("ecPairing gas (2 pairs)", pairingGas);

        // Sanity check — these should be reasonable, not zero
        assertGt(addGas, 0, "ecAdd gas should be > 0");
        assertGt(mulGas, 0, "ecMul gas should be > 0");
        assertGt(pairingGas, 0, "ecPairing gas should be > 0");
    }
}
