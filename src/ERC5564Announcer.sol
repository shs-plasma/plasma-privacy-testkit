// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ERC-5564 Announcer
/// @notice Emits announcements when funds are sent to stealth addresses.
///         Receivers scan these events using their viewing key to detect incoming payments.
contract ERC5564Announcer {
    /// @notice Emitted when a sender sends funds to a stealth address.
    /// @param schemeId  Identifier for the stealth address scheme (1 = secp256k1)
    /// @param stealthAddress  The one-time stealth address that received funds
    /// @param caller  The address that called announce (may differ from sender)
    /// @param ephemeralPubKey  The ephemeral public key used to derive the stealth address
    /// @param metadata  View tag (first byte) + any additional metadata
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    error UnsupportedScheme(uint256 schemeId);
    error InvalidEphemeralPubKeyLength(uint256 expected, uint256 actual);
    error EmptyMetadata();

    uint256 public constant SCHEME_SECP256K1 = 1;
    uint256 private constant COMPRESSED_PUBKEY_LENGTH = 33;

    /// @notice Called after sending funds to a stealth address.
    /// @param schemeId  The scheme identifier (1 for secp256k1 ECDH)
    /// @param stealthAddress  The generated one-time address
    /// @param ephemeralPubKey  The ephemeral public key (33 bytes compressed)
    /// @param metadata  First byte = view tag for fast scanning, rest = optional metadata
    function announce(uint256 schemeId, address stealthAddress, bytes memory ephemeralPubKey, bytes memory metadata)
        external
    {
        if (schemeId != SCHEME_SECP256K1) revert UnsupportedScheme(schemeId);
        if (ephemeralPubKey.length != COMPRESSED_PUBKEY_LENGTH) {
            revert InvalidEphemeralPubKeyLength(COMPRESSED_PUBKEY_LENGTH, ephemeralPubKey.length);
        }
        if (metadata.length == 0) revert EmptyMetadata();
        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, metadata);
    }
}
