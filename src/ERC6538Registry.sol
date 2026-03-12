// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ERC-6538 Stealth Meta-Address Registry
/// @notice Users register their stealth meta-address (spending pubkey + viewing pubkey).
///         Senders look up the recipient's meta-address to generate one-time stealth addresses.
contract ERC6538Registry {
    /// @notice Emitted when a user registers or updates their stealth meta-address.
    event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress);

    error UnsupportedScheme(uint256 schemeId);
    error InvalidMetaAddressLength(uint256 expected, uint256 actual);

    uint256 public constant SCHEME_SECP256K1 = 1;
    uint256 private constant SECP256K1_META_LENGTH = 66;

    /// @notice Maps registrant → schemeId → stealth meta-address
    mapping(address => mapping(uint256 => bytes)) private _stealthMetaAddresses;

    /// @notice Register or update your stealth meta-address for a given scheme.
    /// @param schemeId  The scheme identifier (1 = secp256k1)
    /// @param stealthMetaAddress  The stealth meta-address: spending pubkey ‖ viewing pubkey
    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external {
        if (schemeId != SCHEME_SECP256K1) revert UnsupportedScheme(schemeId);
        if (stealthMetaAddress.length != SECP256K1_META_LENGTH) {
            revert InvalidMetaAddressLength(SECP256K1_META_LENGTH, stealthMetaAddress.length);
        }
        _stealthMetaAddresses[msg.sender][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(msg.sender, schemeId, stealthMetaAddress);
    }

    /// @notice Look up a user's stealth meta-address.
    /// @param registrant  The user whose meta-address to look up
    /// @param schemeId  The scheme identifier
    /// @return The stealth meta-address, or empty bytes if not registered
    function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes memory) {
        return _stealthMetaAddresses[registrant][schemeId];
    }
}
