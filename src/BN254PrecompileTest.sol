// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BN254 Precompile Test
/// @notice Tests ecAdd (0x06), ecMul (0x07), ecPairing (0x08) precompiles
///         These are required for Groth16 ZK proof verification.
///         If any of these fail on Plasma, the privacy pool cannot work.
contract BN254PrecompileTest {

    // BN254 curve generator point G1
    uint256 constant G1_X = 1;
    uint256 constant G1_Y = 2;

    // BN254 field modulus
    uint256 constant P = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // BN254 curve order
    uint256 constant N = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // Known point: 2 * G1 (precomputed)
    uint256 constant G1_2X = 1368015179489954701390400359078579693043519447331113978918064868415326638035;
    uint256 constant G1_2Y = 9918110051302171585080402603319702774565515993150576347155970296011118125764;

    // G2 generator point (4 coordinates for the twist curve)
    uint256 constant G2_X1 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant G2_X2 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant G2_Y1 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant G2_Y2 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;

    event TestResult(string name, bool passed);

    /// @notice Run all precompile tests. Returns true if all pass.
    function runAllTests() external returns (bool allPassed) {
        bool t1 = testEcAdd();
        bool t2 = testEcMul();
        bool t3 = testEcPairing();

        allPassed = t1 && t2 && t3;

        emit TestResult("ecAdd (0x06)", t1);
        emit TestResult("ecMul (0x07)", t2);
        emit TestResult("ecPairing (0x08)", t3);
    }

    /// @notice Test ecAdd precompile (address 0x06)
    ///         Computes G1 + G1 and verifies result equals known 2*G1
    function testEcAdd() public view returns (bool) {
        // G1 + G1 should equal 2*G1
        (uint256 rx, uint256 ry, bool success) = ecAdd(G1_X, G1_Y, G1_X, G1_Y);

        if (!success) return false;
        if (rx != G1_2X) return false;
        if (ry != G1_2Y) return false;

        return true;
    }

    /// @notice Test ecMul precompile (address 0x07)
    ///         Computes 2 * G1 and verifies result equals known 2*G1
    function testEcMul() public view returns (bool) {
        // 2 * G1 should equal the known 2*G1 point
        (uint256 rx, uint256 ry, bool success) = ecMul(G1_X, G1_Y, 2);

        if (!success) return false;
        if (rx != G1_2X) return false;
        if (ry != G1_2Y) return false;

        return true;
    }

    /// @notice Test ecPairing precompile (address 0x08)
    ///         Verifies e(P1, Q1) * e(P2, Q2) == 1
    ///         Using the identity: e(a*G1, G2) * e(-a*G1, G2) == 1
    function testEcPairing() public view returns (bool) {
        // Negate G1: -G1 = (G1_X, P - G1_Y)
        uint256 negG1Y = P - G1_Y;

        // Pairing check: e(G1, G2) * e(-G1, G2) should equal 1 (identity)
        bytes memory input = abi.encodePacked(
            // First pair: (G1, G2)
            G1_X, G1_Y,
            G2_X2, G2_X1, G2_Y2, G2_Y1,
            // Second pair: (-G1, G2)
            G1_X, negG1Y,
            G2_X2, G2_X1, G2_Y2, G2_Y1
        );

        (bool success, bytes memory result) = address(0x08).staticcall(input);

        if (!success) return false;
        if (result.length != 32) return false;

        // Pairing returns 1 if the check passes, 0 if it fails
        uint256 pairingResult = abi.decode(result, (uint256));
        return pairingResult == 1;
    }

    /// @notice Test with invalid input — should fail gracefully, not revert
    function testEcAddInvalid() public view returns (bool failsGracefully) {
        // Point not on curve — precompile should return failure
        (,, bool success) = ecAdd(1, 1, 1, 1); // (1,1) is not on BN254
        return !success; // We WANT this to fail
    }

    /// @notice Get gas cost for each precompile (for benchmarking)
    function benchmarkGas() external view returns (
        uint256 ecAddGas,
        uint256 ecMulGas,
        uint256 ecPairingGas
    ) {
        uint256 g;

        // ecAdd gas
        g = gasleft();
        ecAdd(G1_X, G1_Y, G1_X, G1_Y);
        ecAddGas = g - gasleft();

        // ecMul gas
        g = gasleft();
        ecMul(G1_X, G1_Y, 2);
        ecMulGas = g - gasleft();

        // ecPairing gas (2 pairs — minimal)
        uint256 negG1Y = P - G1_Y;
        bytes memory pairingInput = abi.encodePacked(
            G1_X, G1_Y, G2_X2, G2_X1, G2_Y2, G2_Y1,
            G1_X, negG1Y, G2_X2, G2_X1, G2_Y2, G2_Y1
        );
        g = gasleft();
        address(0x08).staticcall(pairingInput);
        ecPairingGas = g - gasleft();
    }

    // ============================================================
    // Internal helpers
    // ============================================================

    function ecAdd(
        uint256 x1, uint256 y1,
        uint256 x2, uint256 y2
    ) internal view returns (uint256 rx, uint256 ry, bool success) {
        bytes memory input = abi.encode(x1, y1, x2, y2);
        (bool ok, bytes memory result) = address(0x06).staticcall(input);
        if (ok && result.length == 64) {
            (rx, ry) = abi.decode(result, (uint256, uint256));
            success = true;
        }
    }

    function ecMul(
        uint256 x, uint256 y, uint256 s
    ) internal view returns (uint256 rx, uint256 ry, bool success) {
        bytes memory input = abi.encode(x, y, s);
        (bool ok, bytes memory result) = address(0x07).staticcall(input);
        if (ok && result.length == 64) {
            (rx, ry) = abi.decode(result, (uint256, uint256));
            success = true;
        }
    }
}
