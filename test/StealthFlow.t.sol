// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ERC5564Announcer.sol";
import "../src/ERC6538Registry.sol";

/// @title StealthFlowTest
/// @notice Contract-level validation for the on-chain stealth primitives.
///         Real cryptographic end-to-end coverage lives in the TypeScript test suite.
contract StealthFlowTest is Test {
    ERC5564Announcer public announcer;
    ERC6538Registry public registry;
    address alice = makeAddr("alice");
    address sender = makeAddr("sender");
    address stealthAddress = makeAddr("stealth");

    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    function setUp() public {
        announcer = new ERC5564Announcer();
        registry = new ERC6538Registry();
    }

    function _validMetaAddress() internal pure returns (bytes memory) {
        return abi.encodePacked(
            bytes1(0x02),
            bytes32(uint256(0x1111111111111111111111111111111111111111111111111111111111111111)),
            bytes1(0x03),
            bytes32(uint256(0x2222222222222222222222222222222222222222222222222222222222222222))
        );
    }

    function _validEphemeralPubKey() internal pure returns (bytes memory) {
        return hex"025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc";
    }

    function test_RegisterStealthMetaAddress() public {
        bytes memory metaAddress = _validMetaAddress();
        vm.prank(alice);
        registry.registerKeys(1, metaAddress);

        bytes memory stored = registry.stealthMetaAddressOf(alice, 1);
        assertEq(stored, metaAddress, "Meta-address should be stored");
    }

    function test_RevertOnUnsupportedRegistryScheme() public {
        vm.expectRevert(abi.encodeWithSelector(ERC6538Registry.UnsupportedScheme.selector, 999));
        vm.prank(alice);
        registry.registerKeys(999, _validMetaAddress());
    }

    function test_RevertOnMalformedMetaAddress() public {
        bytes memory malformed = abi.encodePacked(bytes1(0x02), bytes32(uint256(1)));

        vm.expectRevert(abi.encodeWithSelector(ERC6538Registry.InvalidMetaAddressLength.selector, 66, malformed.length));
        vm.prank(alice);
        registry.registerKeys(1, malformed);
    }

    function test_AnnounceEmitsEventForValidPayload() public {
        bytes memory ephemeralPubKey = _validEphemeralPubKey();
        bytes memory metadata = hex"e8";

        vm.expectEmit(address(announcer));
        emit Announcement(1, stealthAddress, sender, ephemeralPubKey, metadata);

        vm.prank(sender);
        announcer.announce(1, stealthAddress, ephemeralPubKey, metadata);
    }

    function test_RevertOnUnsupportedAnnouncementScheme() public {
        vm.expectRevert(abi.encodeWithSelector(ERC5564Announcer.UnsupportedScheme.selector, 999));
        vm.prank(sender);
        announcer.announce(999, stealthAddress, _validEphemeralPubKey(), hex"aa");
    }

    function test_RevertOnMalformedEphemeralPubKey() public {
        bytes memory malformed = hex"0211";

        vm.expectRevert(
            abi.encodeWithSelector(ERC5564Announcer.InvalidEphemeralPubKeyLength.selector, 33, malformed.length)
        );
        vm.prank(sender);
        announcer.announce(1, stealthAddress, malformed, hex"aa");
    }

    function test_RevertOnEmptyMetadata() public {
        vm.expectRevert(ERC5564Announcer.EmptyMetadata.selector);
        vm.prank(sender);
        announcer.announce(1, stealthAddress, _validEphemeralPubKey(), bytes(""));
    }
}
