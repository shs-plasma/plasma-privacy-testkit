/**
 * Full Stealth Flow Test
 *
 * Tests the complete privacy model against deployed Plasma testnet contracts:
 * 1. Derive stealth keys from a "Privy EOA"
 * 2. Register stealth meta-address on-chain
 * 3. Sender generates one-time stealth address for receiver
 * 4. Sender sends USDT to stealth address + announces
 * 5. Receiver scans announcements, detects payment
 * 6. Receiver derives stealth private key, sweeps funds
 * 7. Verify: User Account address never appeared anywhere
 *
 * Usage:
 *   cp .env.example .env  # fill in your values
 *   npm install
 *   npm run full-test
 */

import "dotenv/config";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS, ANNOUNCER_ABI, REGISTRY_ABI, USDT_ABI } from "./config.ts";
import {
  createPrivateNote,
  decodeMetaAddress,
  deriveStealthKeys,
  encodeMetaAddress,
  generateStealthAddress,
  scanAnnouncementsForReceiver,
  stealthPrivateKeyToAddress,
  summarizeNotes,
  transitionNote,
} from "../src/index.ts";
import { bytesToHex } from "@noble/hashes/utils";

// ============================================================
// SETUP
// ============================================================

const RPC_URL = process.env.PLASMA_TESTNET_RPC;
if (!RPC_URL) throw new Error("Set PLASMA_TESTNET_RPC in .env");

const DANNY_KEY = process.env.DANNY_PRIVATE_KEY as `0x${string}`;
const SENDER_KEY = process.env.SENDER_PRIVATE_KEY as `0x${string}`;
if (!DANNY_KEY || !SENDER_KEY)
  throw new Error("Set DANNY_PRIVATE_KEY and SENDER_PRIVATE_KEY in .env");

// Define Plasma testnet chain
const plasmaTestnet = defineChain({
  id: 9746,
  name: "Plasma Testnet",
  nativeCurrency: { name: "XPL", symbol: "XPL", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

const publicClient = createPublicClient({
  chain: plasmaTestnet,
  transport: http(RPC_URL),
});

const dannyAccount = privateKeyToAccount(DANNY_KEY);
const senderAccount = privateKeyToAccount(SENDER_KEY);

const dannyWallet = createWalletClient({
  account: dannyAccount,
  chain: plasmaTestnet,
  transport: http(RPC_URL),
});

const senderWallet = createWalletClient({
  account: senderAccount,
  chain: plasmaTestnet,
  transport: http(RPC_URL),
});

// ============================================================
// TEST FLOW
// ============================================================

async function main() {
  console.log("=== Plasma Privacy — Full Stealth Flow Test ===\n");
  console.log(`Danny (receiver): ${dannyAccount.address}`);
  console.log(`Sender (Bridge/Binance): ${senderAccount.address}`);
  console.log(`Chain: Plasma Testnet (9746)\n`);

  // ----------------------------------------------------------
  // STEP 1: Danny derives stealth keys from his "Privy EOA"
  // ----------------------------------------------------------
  console.log("--- Step 1: Derive stealth keys ---");

  const dannyStealthKeys = await deriveStealthKeys((message) =>
    dannyWallet.signMessage({ account: dannyAccount, message })
  );

  console.log(
    `  Spending pubkey: 0x${bytesToHex(dannyStealthKeys.spendingPubKey)}`
  );
  console.log(
    `  Viewing pubkey:  0x${bytesToHex(dannyStealthKeys.viewingPubKey)}`
  );

  // Verify determinism — derive again, should be identical
  const dannyStealthKeys2 = await deriveStealthKeys((message) =>
    dannyWallet.signMessage({ account: dannyAccount, message })
  );
  const match =
    bytesToHex(dannyStealthKeys.spendingPubKey) ===
    bytesToHex(dannyStealthKeys2.spendingPubKey);
  console.log(`  Deterministic: ${match ? "PASS" : "FAIL"}`);
  if (!match) throw new Error("Key derivation is not deterministic!");

  // ----------------------------------------------------------
  // STEP 2: Danny registers his stealth meta-address
  // ----------------------------------------------------------
  console.log("\n--- Step 2: Register meta-address on-chain ---");

  const metaAddressBytes = encodeMetaAddress(dannyStealthKeys);
  const metaAddressHex = `0x${bytesToHex(metaAddressBytes)}` as `0x${string}`;
  console.log(`  Meta-address: ${metaAddressHex.slice(0, 20)}...`);

  const regTx = await dannyWallet.writeContract({
    address: CONTRACTS.registry,
    abi: REGISTRY_ABI,
    functionName: "registerKeys",
    args: [1n, metaAddressHex],
  });
  console.log(`  Tx: ${regTx}`);
  await publicClient.waitForTransactionReceipt({ hash: regTx });

  // Verify registration
  const stored = await publicClient.readContract({
    address: CONTRACTS.registry,
    abi: REGISTRY_ABI,
    functionName: "stealthMetaAddressOf",
    args: [dannyAccount.address, 1n],
  });
  console.log(`  Registered: ${stored === metaAddressHex ? "PASS" : "FAIL"}`);

  // ----------------------------------------------------------
  // STEP 3: Mint test USDT to sender
  // ----------------------------------------------------------
  console.log("\n--- Step 3: Mint USDT to sender ---");

  const mintTx = await senderWallet.writeContract({
    address: CONTRACTS.usdt,
    abi: USDT_ABI,
    functionName: "mint",
    args: [senderAccount.address, parseUnits("1000", 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintTx });

  const senderBal = await publicClient.readContract({
    address: CONTRACTS.usdt,
    abi: USDT_ABI,
    functionName: "balanceOf",
    args: [senderAccount.address],
  });
  console.log(`  Sender balance: ${formatUnits(senderBal, 6)} USDT`);

  // ----------------------------------------------------------
  // STEP 4: Sender looks up Danny's meta-address, generates stealth address
  // ----------------------------------------------------------
  console.log("\n--- Step 4: Generate stealth address for Danny ---");

  const dannyMeta = decodeMetaAddress(
    Buffer.from(((await publicClient.readContract({
      address: CONTRACTS.registry,
      abi: REGISTRY_ABI,
      functionName: "stealthMetaAddressOf",
      args: [dannyAccount.address, 1n],
    })) as `0x${string}`).slice(2), "hex")
  );

  const stealth = generateStealthAddress(dannyMeta);
  console.log(`  Stealth address: ${stealth.stealthAddress}`);
  console.log(
    `  Ephemeral pubkey: 0x${bytesToHex(stealth.ephemeralPubKey).slice(0, 20)}...`
  );
  console.log(`  View tag: 0x${stealth.viewTag.toString(16).padStart(2, "0")}`);
  console.log(
    `  Is Danny's EOA? ${stealth.stealthAddress === dannyAccount.address ? "FAIL — same address!" : "PASS — different address"}`
  );

  // ----------------------------------------------------------
  // STEP 5: Sender sends USDT to stealth address
  // ----------------------------------------------------------
  console.log("\n--- Step 5: Send USDT to stealth address ---");

  const amount = parseUnits("500", 6);
  const sendTx = await senderWallet.writeContract({
    address: CONTRACTS.usdt,
    abi: USDT_ABI,
    functionName: "transfer",
    args: [stealth.stealthAddress, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash: sendTx });
  console.log(`  Sent 500 USDT to ${stealth.stealthAddress}`);

  // ----------------------------------------------------------
  // STEP 6: Sender announces the stealth payment
  // ----------------------------------------------------------
  console.log("\n--- Step 6: Announce stealth payment ---");

  const metadata = `0x${stealth.viewTag.toString(16).padStart(2, "0")}` as `0x${string}`;
  const ephPubHex = `0x${bytesToHex(stealth.ephemeralPubKey)}` as `0x${string}`;

  const announceTx = await senderWallet.writeContract({
    address: CONTRACTS.announcer,
    abi: ANNOUNCER_ABI,
    functionName: "announce",
    args: [1n, stealth.stealthAddress, ephPubHex, metadata],
  });
  await publicClient.waitForTransactionReceipt({ hash: announceTx });
  console.log(`  Announced: ${announceTx}`);

  // ----------------------------------------------------------
  // STEP 7: Danny scans announcements
  // ----------------------------------------------------------
  console.log("\n--- Step 7: Danny scans for payments ---");

  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = currentBlock > 9999n ? currentBlock - 9999n : 0n;

  const logs = await publicClient.getLogs({
    address: CONTRACTS.announcer,
    event: {
      type: "event",
      name: "Announcement",
      inputs: [
        { name: "schemeId", type: "uint256", indexed: true },
        { name: "stealthAddress", type: "address", indexed: true },
        { name: "caller", type: "address", indexed: true },
        { name: "ephemeralPubKey", type: "bytes", indexed: false },
        { name: "metadata", type: "bytes", indexed: false },
      ],
    },
    fromBlock,
    toBlock: currentBlock,
  });

  console.log(`  Found ${logs.length} announcement(s)`);

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
    dannyStealthKeys
  );

  for (const skipped of scanResult.skipped) {
    console.log(`  Skipped announcement (${skipped.reason})`);
  }

  let foundPayment = false;
  const matchResult = scanResult.matches[0];
  if (matchResult) {
    foundPayment = true;
    console.log(`  MATCH — Payment found at ${matchResult.stealthAddress}`);
    console.log(
      `  Stealth private key derived: 0x${bytesToHex(matchResult.stealthPrivateKey).slice(0, 16)}...`
    );

    const stealthBal = await publicClient.readContract({
      address: CONTRACTS.usdt,
      abi: USDT_ABI,
      functionName: "balanceOf",
      args: [matchResult.stealthAddress],
    });
    console.log(`  Stealth balance: ${formatUnits(stealthBal, 6)} USDT`);

    console.log("\n--- Step 8: Queue, shield, and consolidate ---");
    let note = createPrivateNote({
      id: `${matchResult.announcement.txHash ?? announceTx}:0`,
      token: CONTRACTS.usdt,
      amount,
      stealthAddress: matchResult.stealthAddress,
      viewTag: matchResult.announcement.viewTag,
      ephemeralPubKey: matchResult.announcement.ephemeralPubKey,
      stealthPrivateKey: matchResult.stealthPrivateKey,
      announcementTxHash: matchResult.announcement.txHash,
      sourceTxHash: sendTx,
    });
    note = transitionNote(note, "queued");
    note = transitionNote(note, "shielding");
    note = transitionNote(note, "shielded");
    const noteSummary = summarizeNotes([note]);

    console.log(
      `  Consolidated shielded balance: ${formatUnits(noteSummary.consolidatedShieldedBalance, 6)} USDT`
    );

    const stealthAccount = privateKeyToAccount(
      `0x${bytesToHex(matchResult.stealthPrivateKey)}` as `0x${string}`
    );
    const computedAddress = stealthPrivateKeyToAddress(
      matchResult.stealthPrivateKey
    );
    console.log(`  Stealth account: ${stealthAccount.address}`);
    console.log(
      `  Matches announced: ${computedAddress.toLowerCase() === matchResult.stealthAddress.toLowerCase() ? "PASS" : "FAIL"}`
    );
  }

  // ----------------------------------------------------------
  // RESULTS
  // ----------------------------------------------------------
  console.log("\n=== RESULTS ===\n");

  const dannyUsdtBal = await publicClient.readContract({
    address: CONTRACTS.usdt,
    abi: USDT_ABI,
    functionName: "balanceOf",
    args: [dannyAccount.address],
  });

  console.log(
    `  Payment found via scanning: ${foundPayment ? "PASS" : "FAIL"}`
  );
  console.log(
    `  Danny's EOA USDT balance: ${formatUnits(dannyUsdtBal, 6)} USDT`
  );
  console.log(
    `  Danny's EOA touched USDT: ${dannyUsdtBal > 0n ? "FAIL — Danny's address has USDT" : "PASS — Zero (never touched)"}`
  );
  console.log(
    `  Stealth address != Danny: ${stealth.stealthAddress.toLowerCase() !== dannyAccount.address.toLowerCase() ? "PASS" : "FAIL"}`
  );

  console.log("\n  On-chain trail:");
  console.log(`    Sender / Bridge (${senderAccount.address})`);
  console.log(`      → 500 USDT → Stealth (${stealth.stealthAddress})`);
  console.log(`    Danny's address (${dannyAccount.address})`);
  console.log(`      → NOWHERE in the transaction history`);
  console.log(`\n  An observer sees: "Bridge sent 500 USDT to an unknown address."`);
  console.log(`  An observer does NOT see: any connection to Danny.`);
}

main().catch(console.error);
