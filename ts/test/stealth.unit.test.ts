import assert from "node:assert/strict";
import test from "node:test";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import {
  createPrivateNote,
  decodeMetaAddress,
  deriveBackupKey,
  deriveKeyMaterialFromSignature,
  derivePrivacyKey,
  deriveSpendingKey,
  deriveStealthKeysFromSignatures,
  deriveStealthPrivateKey,
  encodeMetaAddress,
  generateStealthAddress,
  scanAnnouncementsForReceiver,
  stealthPrivateKeyToAddress,
  summarizeNotes,
  transitionNote,
} from "../src/index.ts";

const SPENDING_SIGNATURE =
  `0x${"11".repeat(32)}${"22".repeat(32)}1b` as `0x${string}`;
const VIEWING_SIGNATURE =
  `0x${"33".repeat(32)}${"44".repeat(32)}1c` as `0x${string}`;

const VECTOR_EXPECTATIONS = {
  spendingPrivKey:
    "0x4d9796faeb9b2e820578dc5b0c18a68c5bbe05931078a7f78011fb31e9ac3074",
  viewingPrivKey:
    "0x86fbbbaa004265c95f0f823eb91430321d2815a8afcf456e480e8a0339f530ee",
  spendingPubKey:
    "0x02276810b4a4eddd53458d6559430cf8bcc26e62310dd90aa49c79aea11a039a09",
  viewingPubKey:
    "0x02e9478997f63f29c412771feaaaa84ad30e4b68f7e2323541dd5f4f4067e74deb",
  metaAddress:
    "0x02276810b4a4eddd53458d6559430cf8bcc26e62310dd90aa49c79aea11a039a0902e9478997f63f29c412771feaaaa84ad30e4b68f7e2323541dd5f4f4067e74deb",
  ephemeralPubKey:
    "0x025cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc",
  stealthAddress: "0xf5d6040c4ecbb2093e1835177167281bab5175da",
  viewTag: 232,
  stealthPrivKey:
    "0x3620bd832c7c24cc07b5bec60adfc5fa0b7c3d32e748b303dcda9b40acdbda2a",
} as const;

function toCompactSignature(signature: `0x${string}`): `0x${string}` {
  const raw = hexToBytes(signature.slice(2));
  const compact = new Uint8Array(64);
  compact.set(raw.slice(0, 32), 0);
  compact.set(raw.slice(32, 64), 32);

  const recoveryId = raw[64] === 28 ? 1 : 0;
  compact[32] = (compact[32] ?? 0) | (recoveryId << 7);
  return `0x${bytesToHex(compact)}` as `0x${string}`;
}

test("derives identical key material from canonical and compact signatures", () => {
  const canonicalKeys = deriveStealthKeysFromSignatures(
    SPENDING_SIGNATURE,
    VIEWING_SIGNATURE,
  );
  const compactKeys = deriveStealthKeysFromSignatures(
    toCompactSignature(SPENDING_SIGNATURE),
    toCompactSignature(VIEWING_SIGNATURE),
  );

  assert.equal(
    bytesToHex(canonicalKeys.spendingPrivKey),
    bytesToHex(compactKeys.spendingPrivKey),
  );
  assert.equal(
    bytesToHex(canonicalKeys.viewingPrivKey),
    bytesToHex(compactKeys.viewingPrivKey),
  );
});

test("matches deterministic stealth vectors end to end", () => {
  const keys = deriveStealthKeysFromSignatures(
    SPENDING_SIGNATURE,
    VIEWING_SIGNATURE,
  );
  const encodedMeta = encodeMetaAddress(keys);
  const decodedMeta = decodeMetaAddress(encodedMeta);
  const payment = generateStealthAddress(decodedMeta, {
    ephemeralPrivateKey: hexToBytes(
      "0000000000000000000000000000000000000000000000000000000000000007",
    ),
  });
  const stealthPrivKey = deriveStealthPrivateKey(
    keys.spendingPrivKey,
    keys.viewingPrivKey,
    payment.ephemeralPubKey,
  );

  assert.equal(
    `0x${bytesToHex(keys.spendingPrivKey)}`,
    VECTOR_EXPECTATIONS.spendingPrivKey,
  );
  assert.equal(
    `0x${bytesToHex(keys.viewingPrivKey)}`,
    VECTOR_EXPECTATIONS.viewingPrivKey,
  );
  assert.equal(
    `0x${bytesToHex(keys.spendingPubKey)}`,
    VECTOR_EXPECTATIONS.spendingPubKey,
  );
  assert.equal(
    `0x${bytesToHex(keys.viewingPubKey)}`,
    VECTOR_EXPECTATIONS.viewingPubKey,
  );
  assert.equal(
    `0x${bytesToHex(encodedMeta)}`,
    VECTOR_EXPECTATIONS.metaAddress,
  );
  assert.equal(
    `0x${bytesToHex(payment.ephemeralPubKey)}`,
    VECTOR_EXPECTATIONS.ephemeralPubKey,
  );
  assert.equal(payment.stealthAddress, VECTOR_EXPECTATIONS.stealthAddress);
  assert.equal(payment.viewTag, VECTOR_EXPECTATIONS.viewTag);
  assert.equal(
    `0x${bytesToHex(stealthPrivKey)}`,
    VECTOR_EXPECTATIONS.stealthPrivKey,
  );
  assert.equal(
    stealthPrivateKeyToAddress(stealthPrivKey),
    VECTOR_EXPECTATIONS.stealthAddress,
  );
});

test("scans announcements defensively and skips malformed inputs", () => {
  const keys = deriveStealthKeysFromSignatures(
    SPENDING_SIGNATURE,
    VIEWING_SIGNATURE,
  );
  const payment = generateStealthAddress(decodeMetaAddress(encodeMetaAddress(keys)), {
    ephemeralPrivateKey: hexToBytes(
      "0000000000000000000000000000000000000000000000000000000000000007",
    ),
  });

  const result = scanAnnouncementsForReceiver(
    [
      {
        schemeId: 999n,
        stealthAddress: payment.stealthAddress,
        ephemeralPubKey: `0x${bytesToHex(payment.ephemeralPubKey)}`,
        metadata: `0x${payment.viewTag.toString(16).padStart(2, "0")}`,
      },
      {
        schemeId: 1n,
        stealthAddress: payment.stealthAddress,
        ephemeralPubKey: "0x1234",
        metadata: "0xab",
      },
      {
        schemeId: 1n,
        stealthAddress: payment.stealthAddress,
        ephemeralPubKey: `0x${bytesToHex(payment.ephemeralPubKey)}`,
        metadata: "0x",
      },
      {
        schemeId: 1n,
        stealthAddress: payment.stealthAddress,
        ephemeralPubKey: `0x${bytesToHex(payment.ephemeralPubKey)}`,
        metadata: `0x${payment.viewTag.toString(16).padStart(2, "0")}`,
      },
    ],
    keys,
  );

  assert.equal(result.matches.length, 1);
  assert.equal(result.skipped.length, 3);
  assert.equal(result.matches[0]?.stealthAddress, payment.stealthAddress);
});

test("models note lifecycle transitions and consolidated balances", () => {
  let note = createPrivateNote({
    id: "note-1",
    token: "USDT",
    amount: 500_000_000n,
    stealthAddress: VECTOR_EXPECTATIONS.stealthAddress,
    viewTag: VECTOR_EXPECTATIONS.viewTag,
    ephemeralPubKey: VECTOR_EXPECTATIONS.ephemeralPubKey,
    stealthPrivateKey: VECTOR_EXPECTATIONS.stealthPrivKey,
  });

  note = transitionNote(note, "queued");
  note = transitionNote(note, "shielding");
  note = transitionNote(note, "shielded");

  let summary = summarizeNotes([note]);
  assert.equal(summary.shieldedBalance, 500_000_000n);
  assert.equal(summary.consolidatedShieldedBalance, 500_000_000n);

  note = transitionNote(note, "spent");
  summary = summarizeNotes([note]);
  assert.equal(summary.spentBalance, 500_000_000n);
  assert.equal(summary.consolidatedShieldedBalance, 0n);

  assert.throws(() => transitionNote(note, "queued"));
});

test("derives privacy, spending, and backup keys from versioned messages", async () => {
  const signedMessages: string[] = [];
  const signMessage = async (message: string) => {
    signedMessages.push(message);
    if (message.includes("Privacy")) {
      return SPENDING_SIGNATURE;
    }
    return VIEWING_SIGNATURE;
  };

  const privacyKey = await derivePrivacyKey(signMessage);
  const backupKey = await deriveBackupKey(signMessage);
  const spendingKey = deriveSpendingKey(privacyKey);

  assert.equal(
    `0x${bytesToHex(privacyKey)}`,
    `0x${bytesToHex(deriveKeyMaterialFromSignature(SPENDING_SIGNATURE))}`,
  );
  assert.equal(
    `0x${bytesToHex(backupKey)}`,
    `0x${bytesToHex(deriveKeyMaterialFromSignature(VIEWING_SIGNATURE))}`,
  );
  assert.equal(spendingKey.length, 32);
  assert.deepEqual(signedMessages, [
    "Plasma Privacy Key v1",
    "Plasma Backup Key v1",
  ]);
});
