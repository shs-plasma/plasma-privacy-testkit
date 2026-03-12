import { parseAbi } from "viem";

// === DEPLOYED CONTRACTS (Plasma Testnet - Chain 9746) ===
export const CONTRACTS = {
  announcer: "0xc24e145910365df12b2F894D38d6342c9B72d387" as `0x${string}`,
  registry: "0x04315dC5c91A55F48E94De5df21B6F681028f47b" as `0x${string}`,
  usdt: "0x5e8135210b6C974F370e86139Ed22Af932a4d022" as `0x${string}`,
};

// === ABIs ===
export const ANNOUNCER_ABI = parseAbi([
  "function announce(uint256 schemeId, address stealthAddress, bytes ephemeralPubKey, bytes metadata) external",
  "event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)",
]);

export const REGISTRY_ABI = parseAbi([
  "function registerKeys(uint256 schemeId, bytes stealthMetaAddress) external",
  "function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes)",
  "event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress)",
]);

export const USDT_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
]);
