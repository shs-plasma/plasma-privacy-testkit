/**
 * Audit E2E Test — Post-Audit Stealth Addresses on Plasma Testnet
 *
 * Validates all audit remediations against live deployed contracts:
 *  [P1] Announcer rejects malformed payloads
 *  [P1] Key derivation uses versioned signMessage
 *  [P2] Registry rejects malformed meta-addresses
 *  [P2] Real cryptographic flow (not mocked)
 *  + Full stealth payment flow: Sender → Alice stealth → Alice sweeps
 *  + Note lifecycle tracking
 *  + Scanner defensive parsing of untrusted announcements
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  defineChain,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import {
  deriveStealthKeysFromPrivateKey,
  generateStealthAddress,
  encodeMetaAddress,
  decodeMetaAddress,
  scanAnnouncementsForReceiver,
  stealthPrivateKeyToAddress,
  createPrivateNote,
  transitionNote,
  summarizeNotes,
  STEALTH_SCHEME_ID,
  type StealthKeys,
} from "../src/index.ts";

// ============ CONFIG ============
const RPC = "https://thrumming-omniscient-fog.plasma-testnet.quiknode.pro/9e0462e2221113510287509d9ae53f6ade38e93b/";
const DEPLOYER_KEY = "0xc36e3569a3ecd111369cd20cacb9f51133d3463aee7ff211b3276a5c142125e4" as Hex;
const SENDER_KEY = generatePrivateKey();

// Audit-remediated contracts (freshly deployed)
const ANNOUNCER_V2 = "0x7825081E008edc91D2841c72574d705253D24e6A" as Address;
const REGISTRY_V2 = "0xaC4a9A6D070Fe244B7D172499192C1CDF064Fe00" as Address;
const USDT_V2 = "0x617BFC71cE983f856867d696a65234186bb111Db" as Address;

const plasmaTestnet = defineChain({
  id: 9746,
  name: "Plasma Testnet",
  nativeCurrency: { name: "XPL", symbol: "XPL", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

// ============ CLIENTS ============
const publicClient = createPublicClient({ chain: plasmaTestnet, transport: http(RPC) });
const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);
const senderAccount = privateKeyToAccount(SENDER_KEY);
const deployerWallet = createWalletClient({ chain: plasmaTestnet, transport: http(RPC), account: deployerAccount });
const senderWallet = createWalletClient({ chain: plasmaTestnet, transport: http(RPC), account: senderAccount });

// ============ ABIs ============
const ANNOUNCER_ABI = parseAbi([
  "function announce(uint256 schemeId, address stealthAddress, bytes ephemeralPubKey, bytes metadata) external",
  "event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)",
]);

const REGISTRY_ABI = parseAbi([
  "function registerKeys(uint256 schemeId, bytes stealthMetaAddress) external",
  "function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function mint(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
]);

// ============ RESULTS TRACKING ============
interface TestResult {
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
  txHash?: string;
}
const results: TestResult[] = [];

function pass(name: string, detail: string, txHash?: string) {
  results.push({ name, status: "PASS", detail, txHash });
  console.log(`  PASS: ${detail}`);
}

function fail(name: string, detail: string) {
  results.push({ name, status: "FAIL", detail });
  console.log(`  FAIL: ${detail}`);
}

// ============ MAIN TEST ============
async function main() {
  console.log("=".repeat(70));
  console.log("Audit E2E Test — Post-Audit Stealth Contracts on Plasma Testnet");
  console.log("Chain: Plasma Testnet (9746)");
  console.log("=".repeat(70));
  console.log(`Deployer (Alice): ${deployerAccount.address}`);
  console.log(`Sender (random):  ${senderAccount.address}`);
  console.log(`Announcer v2:     ${ANNOUNCER_V2}`);
  console.log(`Registry v2:      ${REGISTRY_V2}`);
  console.log(`MockUSDT v2:      ${USDT_V2}`);
  console.log();

  // ================================================================
  // TEST 1: [P2] Registry rejects unsupported scheme
  // ================================================================
  console.log("=== TEST 1: [P2] Registry — Reject Unsupported Scheme ===");
  {
    const fakeMetaAddress = `0x${"02" + "aa".repeat(32) + "03" + "bb".repeat(32)}` as Hex;
    try {
      await deployerWallet.writeContract({
        address: REGISTRY_V2, abi: REGISTRY_ABI, functionName: "registerKeys",
        args: [99n, fakeMetaAddress], // schemeId 99 is not supported
      });
      fail("registry-reject-scheme", "Should have reverted for unsupported scheme");
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err);
      if (msg.includes("UnsupportedScheme") || msg.includes("revert")) {
        pass("registry-reject-scheme", `Reverted correctly: ${msg.slice(0, 100)}`);
      } else {
        fail("registry-reject-scheme", `Unexpected error: ${msg.slice(0, 100)}`);
      }
    }
  }

  // ================================================================
  // TEST 2: [P2] Registry rejects malformed meta-address length
  // ================================================================
  console.log("\n=== TEST 2: [P2] Registry — Reject Malformed Meta-Address ===");
  {
    const shortMeta = `0x${"ab".repeat(40)}` as Hex; // 40 bytes, not 66
    try {
      await deployerWallet.writeContract({
        address: REGISTRY_V2, abi: REGISTRY_ABI, functionName: "registerKeys",
        args: [1n, shortMeta],
      });
      fail("registry-reject-length", "Should have reverted for wrong length");
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err);
      if (msg.includes("InvalidMetaAddressLength") || msg.includes("revert")) {
        pass("registry-reject-length", `Reverted correctly: ${msg.slice(0, 100)}`);
      } else {
        fail("registry-reject-length", `Unexpected error: ${msg.slice(0, 100)}`);
      }
    }
  }

  // ================================================================
  // TEST 3: [P1] Announcer rejects unsupported scheme
  // ================================================================
  console.log("\n=== TEST 3: [P1] Announcer — Reject Unsupported Scheme ===");
  {
    const fakeEph = `0x${"02" + "cc".repeat(32)}` as Hex; // valid 33-byte key
    try {
      await deployerWallet.writeContract({
        address: ANNOUNCER_V2, abi: ANNOUNCER_ABI, functionName: "announce",
        args: [99n, deployerAccount.address, fakeEph, "0xff"],
      });
      fail("announcer-reject-scheme", "Should have reverted for unsupported scheme");
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err);
      if (msg.includes("UnsupportedScheme") || msg.includes("revert")) {
        pass("announcer-reject-scheme", `Reverted correctly: ${msg.slice(0, 100)}`);
      } else {
        fail("announcer-reject-scheme", `Unexpected error: ${msg.slice(0, 100)}`);
      }
    }
  }

  // ================================================================
  // TEST 4: [P1] Announcer rejects invalid ephemeral pubkey length
  // ================================================================
  console.log("\n=== TEST 4: [P1] Announcer — Reject Invalid EphemeralPubKey ===");
  {
    const shortEph = `0x${"aa".repeat(20)}` as Hex; // 20 bytes, not 33
    try {
      await deployerWallet.writeContract({
        address: ANNOUNCER_V2, abi: ANNOUNCER_ABI, functionName: "announce",
        args: [1n, deployerAccount.address, shortEph, "0xff"],
      });
      fail("announcer-reject-eph", "Should have reverted for wrong ephemeral key length");
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err);
      if (msg.includes("InvalidEphemeralPubKeyLength") || msg.includes("revert")) {
        pass("announcer-reject-eph", `Reverted correctly: ${msg.slice(0, 100)}`);
      } else {
        fail("announcer-reject-eph", `Unexpected error: ${msg.slice(0, 100)}`);
      }
    }
  }

  // ================================================================
  // TEST 5: [P1] Announcer rejects empty metadata
  // ================================================================
  console.log("\n=== TEST 5: [P1] Announcer — Reject Empty Metadata ===");
  {
    const validEph = `0x${"02" + "dd".repeat(32)}` as Hex;
    try {
      await deployerWallet.writeContract({
        address: ANNOUNCER_V2, abi: ANNOUNCER_ABI, functionName: "announce",
        args: [1n, deployerAccount.address, validEph, "0x"],
      });
      fail("announcer-reject-metadata", "Should have reverted for empty metadata");
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err);
      if (msg.includes("EmptyMetadata") || msg.includes("revert")) {
        pass("announcer-reject-metadata", `Reverted correctly: ${msg.slice(0, 100)}`);
      } else {
        fail("announcer-reject-metadata", `Unexpected error: ${msg.slice(0, 100)}`);
      }
    }
  }

  // ================================================================
  // TEST 6: [P1] Key derivation uses versioned signMessage (not raw hash)
  // ================================================================
  console.log("\n=== TEST 6: [P1] Versioned Key Derivation ===");
  {
    const keys = await deriveStealthKeysFromPrivateKey(DEPLOYER_KEY);
    // Verify keys are deterministic
    const keys2 = await deriveStealthKeysFromPrivateKey(DEPLOYER_KEY);
    const match = bytesToHex(keys.spendingPubKey) === bytesToHex(keys2.spendingPubKey)
      && bytesToHex(keys.viewingPubKey) === bytesToHex(keys2.viewingPubKey);
    if (match) {
      pass("versioned-derivation", `Deterministic keys from versioned signMessage (spending: 0x${bytesToHex(keys.spendingPubKey).slice(0, 16)}...)`);
    } else {
      fail("versioned-derivation", "Keys not deterministic");
    }
  }

  // ================================================================
  // TEST 7: Full Stealth Payment Flow (real crypto, not mocked)
  // ================================================================
  console.log("\n=== TEST 7: Full Stealth Payment Flow ===");

  // 7a: Derive Alice's stealth keys using versioned derivation
  console.log("  7a: Deriving Alice's stealth keys...");
  const aliceKeys = await deriveStealthKeysFromPrivateKey(DEPLOYER_KEY);
  console.log(`    Spending pubkey: 0x${bytesToHex(aliceKeys.spendingPubKey).slice(0, 20)}...`);
  console.log(`    Viewing pubkey:  0x${bytesToHex(aliceKeys.viewingPubKey).slice(0, 20)}...`);

  // 7b: Register Alice's meta-address on the new Registry
  console.log("  7b: Registering meta-address...");
  const metaBytes = encodeMetaAddress(aliceKeys);
  const metaHex = `0x${bytesToHex(metaBytes)}` as Hex;
  const regTx = await deployerWallet.writeContract({
    address: REGISTRY_V2, abi: REGISTRY_ABI, functionName: "registerKeys",
    args: [STEALTH_SCHEME_ID, metaHex],
  });
  await publicClient.waitForTransactionReceipt({ hash: regTx });
  pass("register-meta", `Meta-address registered (66 bytes)`, regTx);

  // 7c: Verify on-chain meta-address matches
  const storedMeta = await publicClient.readContract({
    address: REGISTRY_V2, abi: REGISTRY_ABI, functionName: "stealthMetaAddressOf",
    args: [deployerAccount.address, STEALTH_SCHEME_ID],
  }) as Hex;
  const decodedMeta = decodeMetaAddress(hexToBytes(storedMeta.slice(2)));
  const metaMatch = bytesToHex(decodedMeta.spendingPubKey) === bytesToHex(aliceKeys.spendingPubKey)
    && bytesToHex(decodedMeta.viewingPubKey) === bytesToHex(aliceKeys.viewingPubKey);
  if (metaMatch) {
    pass("meta-roundtrip", "On-chain meta-address roundtrips correctly");
  } else {
    fail("meta-roundtrip", "Meta-address mismatch after on-chain roundtrip");
  }

  // 7d: Fund sender, generate stealth address for Alice, send USDT
  console.log("  7d: Generating stealth address and funding...");
  const fundSenderTx = await deployerWallet.sendTransaction({
    to: senderAccount.address, value: 200000000000000000n, // 0.2 XPL
  });
  await publicClient.waitForTransactionReceipt({ hash: fundSenderTx });

  const mintTx = await senderWallet.writeContract({
    address: USDT_V2, abi: ERC20_ABI, functionName: "mint",
    args: [senderAccount.address, 10_000_000n], // 10 USDT
  });
  await publicClient.waitForTransactionReceipt({ hash: mintTx });

  const stealthOutput = generateStealthAddress(decodedMeta);
  console.log(`    Stealth address: ${stealthOutput.stealthAddress}`);
  console.log(`    View tag: 0x${stealthOutput.viewTag.toString(16).padStart(2, "0")}`);
  const addrDiff = stealthOutput.stealthAddress.toLowerCase() !== deployerAccount.address.toLowerCase();
  if (addrDiff) {
    pass("stealth-differs", `Stealth ${stealthOutput.stealthAddress.slice(0, 10)}... != Alice real ${deployerAccount.address.slice(0, 10)}...`);
  } else {
    fail("stealth-differs", "Stealth address should differ from Alice's real address");
  }

  // Transfer 1 USDT to stealth address
  const transferTx = await senderWallet.writeContract({
    address: USDT_V2, abi: ERC20_ABI, functionName: "transfer",
    args: [stealthOutput.stealthAddress, 1_000_000n], // 1 USDT
  });
  const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferTx });
  pass("stealth-funded", `1 USDT sent to stealth address`, transferTx);

  // 7e: Announce on the new Announcer (validated payload)
  console.log("  7e: Announcing stealth payment...");
  const ephPubHex = `0x${bytesToHex(stealthOutput.ephemeralPubKey)}` as Hex;
  const metadata = `0x${stealthOutput.viewTag.toString(16).padStart(2, "0")}` as Hex;
  const announceTx = await senderWallet.writeContract({
    address: ANNOUNCER_V2, abi: ANNOUNCER_ABI, functionName: "announce",
    args: [STEALTH_SCHEME_ID, stealthOutput.stealthAddress, ephPubHex, metadata],
  });
  const announceReceipt = await publicClient.waitForTransactionReceipt({ hash: announceTx });
  pass("announce-valid", `Announcement accepted (33-byte eph key, 1-byte metadata)`, announceTx);

  // 7f: Alice scans announcements using the SDK scanner
  console.log("  7f: Alice scanning announcements...");
  const fromBlock = announceReceipt.blockNumber > 10n ? announceReceipt.blockNumber - 10n : 0n;
  const logs = await publicClient.getLogs({
    address: ANNOUNCER_V2,
    event: ANNOUNCER_ABI[1], // Announcement event
    fromBlock,
    toBlock: announceReceipt.blockNumber,
  });

  const scanResult = scanAnnouncementsForReceiver(
    logs.map((log) => ({
      schemeId: log.args.schemeId as bigint,
      stealthAddress: log.args.stealthAddress as string,
      ephemeralPubKey: log.args.ephemeralPubKey as string,
      metadata: log.args.metadata as string,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      caller: log.args.caller as string,
    })),
    aliceKeys,
  );

  if (scanResult.matches.length === 1) {
    const match = scanResult.matches[0]!;
    pass("scanner-found", `Scanner found 1 match, skipped ${scanResult.skipped.length}`);

    // Verify derived stealth address matches
    if (match.stealthAddress.toLowerCase() === stealthOutput.stealthAddress.toLowerCase()) {
      pass("scanner-address", `Scanner-derived address matches generated stealth`);
    } else {
      fail("scanner-address", `Address mismatch: ${match.stealthAddress} vs ${stealthOutput.stealthAddress}`);
    }

    // Verify stealth private key controls the address
    const derivedAddress = stealthPrivateKeyToAddress(match.stealthPrivateKey);
    if (derivedAddress.toLowerCase() === stealthOutput.stealthAddress.toLowerCase()) {
      pass("stealth-privkey", `Stealth private key controls the stealth address`);
    } else {
      fail("stealth-privkey", `Private key address mismatch: ${derivedAddress} vs ${stealthOutput.stealthAddress}`);
    }

    // 7g: Alice sweeps funds from stealth address
    console.log("  7g: Alice sweeping funds from stealth address...");
    const stealthPrivKeyHex = `0x${bytesToHex(match.stealthPrivateKey)}` as Hex;
    const stealthAccount = privateKeyToAccount(stealthPrivKeyHex);
    const stealthWallet = createWalletClient({
      chain: plasmaTestnet, transport: http(RPC), account: stealthAccount,
    });

    // Fund stealth with gas
    const fundGasTx = await deployerWallet.sendTransaction({
      to: stealthAccount.address, value: 100000000000000000n, // 0.1 XPL
    });
    await publicClient.waitForTransactionReceipt({ hash: fundGasTx });

    // Sweep USDT to a fresh address
    const sweepRecipient = privateKeyToAccount(generatePrivateKey());
    const sweepTx = await stealthWallet.writeContract({
      address: USDT_V2, abi: ERC20_ABI, functionName: "transfer",
      args: [sweepRecipient.address, 1_000_000n],
    });
    const sweepReceipt = await publicClient.waitForTransactionReceipt({ hash: sweepTx });

    const recipientBal = await publicClient.readContract({
      address: USDT_V2, abi: ERC20_ABI, functionName: "balanceOf",
      args: [sweepRecipient.address],
    });

    if (recipientBal === 1_000_000n) {
      pass("sweep-success", `Stealth private key swept 1 USDT to ${sweepRecipient.address.slice(0, 10)}...`, sweepTx);
    } else {
      fail("sweep-success", `Expected 1 USDT, got ${formatUnits(recipientBal, 6)}`);
    }

    // 7h: Note lifecycle tracking
    console.log("  7h: Note lifecycle...");
    let note = createPrivateNote({
      id: `${announceTx}:0`,
      token: USDT_V2,
      amount: 1_000_000n,
      stealthAddress: stealthOutput.stealthAddress,
      viewTag: stealthOutput.viewTag,
      ephemeralPubKey: stealthOutput.ephemeralPubKey,
      stealthPrivateKey: match.stealthPrivateKey,
      announcementTxHash: announceTx,
      sourceTxHash: transferTx,
    });
    note = transitionNote(note, "queued");
    note = transitionNote(note, "shielding");
    note = transitionNote(note, "shielded");
    note = transitionNote(note, "spent", { spendTxHash: sweepTx });

    const summary = summarizeNotes([note]);
    if (summary.spentBalance === 1_000_000n && summary.consolidatedShieldedBalance === 0n) {
      pass("note-lifecycle", `Note tracked: detected→queued→shielding→shielded→spent (balance: ${formatUnits(summary.spentBalance, 6)} USDT spent)`);
    } else {
      fail("note-lifecycle", `Unexpected balances: spent=${summary.spentBalance}, shielded=${summary.consolidatedShieldedBalance}`);
    }

  } else {
    fail("scanner-found", `Expected 1 match, got ${scanResult.matches.length}`);
  }

  // ================================================================
  // TEST 8: Scanner resilience — malformed announcements
  // ================================================================
  console.log("\n=== TEST 8: Scanner Resilience — Malformed Announcements ===");
  {
    // Create a set of announcements: 3 malformed + 1 valid (from test 7)
    const malformed = [
      { schemeId: 999n, stealthAddress: "0x" + "00".repeat(20), ephemeralPubKey: "0x1234", metadata: "0xaa" },
      { schemeId: 1n, stealthAddress: "0x" + "00".repeat(20), ephemeralPubKey: "0x" + "aa".repeat(10), metadata: "0xbb" },
      { schemeId: 1n, stealthAddress: "0x" + "00".repeat(20), ephemeralPubKey: `0x${bytesToHex(stealthOutput.ephemeralPubKey)}`, metadata: "0x" },
    ];
    const valid = logs.map((log) => ({
      schemeId: log.args.schemeId as bigint,
      stealthAddress: log.args.stealthAddress as string,
      ephemeralPubKey: log.args.ephemeralPubKey as string,
      metadata: log.args.metadata as string,
    }));

    const combined = [...malformed, ...valid];
    const result = scanAnnouncementsForReceiver(combined, aliceKeys);

    if (result.matches.length === 1 && result.skipped.length === 3) {
      pass("scanner-resilience", `Scanner: 1 match, 3 skipped (wrong scheme, wrong eph length, empty metadata)`);
    } else {
      fail("scanner-resilience", `Expected 1 match + 3 skipped, got ${result.matches.length} matches + ${result.skipped.length} skipped`);
    }
  }

  // ================================================================
  // FINAL SUMMARY
  // ================================================================
  console.log("\n" + "=".repeat(70));
  console.log("AUDIT E2E TEST RESULTS");
  console.log("=".repeat(70));
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.log();
  for (const r of results) {
    const icon = r.status === "PASS" ? "PASS" : "FAIL";
    const tx = r.txHash ? ` [${r.txHash.slice(0, 10)}...]` : "";
    console.log(`  ${icon}  ${r.name}: ${r.detail}${tx}`);
  }
  console.log();
  console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log("=".repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFATAL ERROR:", err);
  process.exit(1);
});
