#!/usr/bin/env node

import { formatUnits } from "viem";
import {
  createPrivateNote,
  deriveStealthKeysFromPrivateKey,
  encodeMetaAddress,
  summarizeNotes,
  transitionNote,
} from "./index.ts";
import { bytesToHex } from "@noble/hashes/utils";

function printUsage() {
  console.log(`Usage:
  npm run derive-keys -- <private-key>
  npm run lifecycle-demo
`);
}

async function runDeriveKeys(privateKey: string | undefined) {
  if (!privateKey?.startsWith("0x")) {
    throw new Error("derive-keys requires a 0x-prefixed private key");
  }

  const keys = await deriveStealthKeysFromPrivateKey(privateKey as `0x${string}`);
  const metaAddress = encodeMetaAddress(keys);

  console.log(`Stealth derivation version: v1`);
  console.log(`Spending pubkey: 0x${bytesToHex(keys.spendingPubKey)}`);
  console.log(`Viewing pubkey:  0x${bytesToHex(keys.viewingPubKey)}`);
  console.log(`Meta-address:    0x${bytesToHex(metaAddress)}`);
}

function runLifecycleDemo() {
  let note = createPrivateNote({
    id: "demo-note",
    token: "USDT",
    amount: 500_000_000n,
    stealthAddress: "0x0000000000000000000000000000000000000abc",
    viewTag: 0xab,
    ephemeralPubKey: "0x03".padEnd(68, "0") as `0x${string}`,
  });

  note = transitionNote(note, "queued");
  note = transitionNote(note, "shielding");
  note = transitionNote(note, "shielded");

  const summary = summarizeNotes([note]);
  console.log(`Shielded balance: ${formatUnits(summary.shieldedBalance, 6)} USDT`);
}

async function main() {
  const [command, arg] = process.argv.slice(2);

  if (!command) {
    printUsage();
    return;
  }

  if (command === "derive-keys") {
    await runDeriveKeys(arg);
    return;
  }

  if (command === "lifecycle-demo") {
    runLifecycleDemo();
    return;
  }

  printUsage();
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
