import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { privateKeyToAccount } from "viem/accounts";

export type DerivationVersion = "v1";

export interface StealthMetaAddress {
  spendingPubKey: Uint8Array;
  viewingPubKey: Uint8Array;
}

export interface StealthKeys extends StealthMetaAddress {
  spendingPrivKey: Uint8Array;
  viewingPrivKey: Uint8Array;
}

export interface StealthOutput {
  stealthAddress: `0x${string}`;
  ephemeralPubKey: Uint8Array;
  viewTag: number;
}

export interface StealthGenerationOptions {
  ephemeralPrivateKey?: Uint8Array;
}

export const STEALTH_SCHEME_ID = 1n;
export const DERIVATION_VERSION: DerivationVersion = "v1";
export const DERIVATION_MESSAGES = {
  stealthSpending: "Plasma Stealth Spending Key v1",
  stealthViewing: "Plasma Stealth Viewing Key v1",
  privacy: "Plasma Privacy Key v1",
  backup: "Plasma Backup Key v1",
} as const;

const COMPRESSED_PUBKEY_LENGTH = 33;
const META_ADDRESS_LENGTH = 66;
const PRIVATE_KEY_LENGTH = 32;

type DerivationPurpose = keyof typeof DERIVATION_MESSAGES;

function expectPrivateKeyLength(bytes: Uint8Array, label: string) {
  if (bytes.length !== PRIVATE_KEY_LENGTH) {
    throw new Error(`Invalid ${label}: expected 32 bytes, got ${bytes.length}`);
  }
}

function expectCompressedPublicKey(bytes: Uint8Array, label: string) {
  if (bytes.length !== COMPRESSED_PUBKEY_LENGTH) {
    throw new Error(
      `Invalid ${label}: expected 33 bytes, got ${bytes.length}`,
    );
  }

  if (bytes[0] !== 0x02 && bytes[0] !== 0x03) {
    throw new Error(
      `Invalid ${label} prefix: expected 0x02/0x03, got 0x${bytes[0].toString(16)}`,
    );
  }
}

function parseHexBytes(sigHex: string): Uint8Array {
  const normalized = sigHex.startsWith("0x") ? sigHex.slice(2) : sigHex;
  return hexToBytes(normalized);
}

export function deriveKeyMaterialFromSignature(sigHex: string): Uint8Array {
  const raw = parseHexBytes(sigHex);
  let r: Uint8Array;
  let s: Uint8Array;
  let v: number;

  if (raw.length === 65) {
    r = raw.slice(0, 32);
    s = raw.slice(32, 64);
    v = raw[64] ?? 0;
  } else if (raw.length === 64) {
    r = raw.slice(0, 32);
    const yParityAndS = raw.slice(32, 64);
    v = (yParityAndS[0] ?? 0) >> 7;
    s = new Uint8Array(32);
    s.set(yParityAndS);
    s[0] = (s[0] ?? 0) & 0x7f;
  } else {
    throw new Error(`Unexpected signature length: ${raw.length}`);
  }

  if (v >= 27) {
    v -= 27;
  }

  if (v !== 0 && v !== 1) {
    throw new Error(`Invalid recovery id: ${v}`);
  }

  const normalized = new Uint8Array(65);
  normalized.set(r, 0);
  normalized.set(s, 32);
  normalized[64] = v;
  return keccak_256(normalized);
}

export function deriveStealthKeysFromSignatures(
  spendingSigHex: string,
  viewingSigHex: string,
): StealthKeys {
  const spendingPrivKey = deriveKeyMaterialFromSignature(spendingSigHex);
  const viewingPrivKey = deriveKeyMaterialFromSignature(viewingSigHex);

  return {
    spendingPrivKey,
    viewingPrivKey,
    spendingPubKey: secp256k1.getPublicKey(spendingPrivKey, true),
    viewingPubKey: secp256k1.getPublicKey(viewingPrivKey, true),
  };
}

async function deriveKeyWithVersion(
  signMessage: (message: string) => Promise<string>,
  purpose: DerivationPurpose,
  version: DerivationVersion,
): Promise<Uint8Array> {
  if (version !== DERIVATION_VERSION) {
    throw new Error(`Unsupported derivation version: ${version}`);
  }

  return deriveKeyMaterialFromSignature(
    await signMessage(DERIVATION_MESSAGES[purpose]),
  );
}

export async function deriveStealthKeys(
  signMessage: (message: string) => Promise<string>,
  version: DerivationVersion = DERIVATION_VERSION,
): Promise<StealthKeys> {
  const [spendingPrivKey, viewingPrivKey] = await Promise.all([
    deriveKeyWithVersion(signMessage, "stealthSpending", version),
    deriveKeyWithVersion(signMessage, "stealthViewing", version),
  ]);

  return {
    spendingPrivKey,
    viewingPrivKey,
    spendingPubKey: secp256k1.getPublicKey(spendingPrivKey, true),
    viewingPubKey: secp256k1.getPublicKey(viewingPrivKey, true),
  };
}

export async function deriveStealthKeysFromPrivateKey(
  privateKey: `0x${string}` | Uint8Array,
  version: DerivationVersion = DERIVATION_VERSION,
): Promise<StealthKeys> {
  const privateKeyHex =
    typeof privateKey === "string"
      ? privateKey
      : (`0x${bytesToHex(privateKey)}` as `0x${string}`);
  const account = privateKeyToAccount(privateKeyHex);

  return deriveStealthKeys(
    async (message) => account.signMessage({ message }),
    version,
  );
}

export async function derivePrivacyKey(
  signMessage: (message: string) => Promise<string>,
  version: DerivationVersion = DERIVATION_VERSION,
): Promise<Uint8Array> {
  return deriveKeyWithVersion(signMessage, "privacy", version);
}

export function deriveSpendingKey(privacyKey: Uint8Array): Uint8Array {
  expectPrivateKeyLength(privacyKey, "privacy key");
  return keccak_256(privacyKey);
}

export async function deriveBackupKey(
  signMessage: (message: string) => Promise<string>,
  version: DerivationVersion = DERIVATION_VERSION,
): Promise<Uint8Array> {
  return deriveKeyWithVersion(signMessage, "backup", version);
}

export function computeStealthMetaAddress(
  keys: Pick<StealthKeys, "spendingPubKey" | "viewingPubKey">,
): StealthMetaAddress {
  expectCompressedPublicKey(keys.spendingPubKey, "spending pubkey");
  expectCompressedPublicKey(keys.viewingPubKey, "viewing pubkey");
  return {
    spendingPubKey: keys.spendingPubKey,
    viewingPubKey: keys.viewingPubKey,
  };
}

export function encodeMetaAddress(meta: StealthMetaAddress): Uint8Array {
  expectCompressedPublicKey(meta.spendingPubKey, "spending pubkey");
  expectCompressedPublicKey(meta.viewingPubKey, "viewing pubkey");

  const encoded = new Uint8Array(META_ADDRESS_LENGTH);
  encoded.set(meta.spendingPubKey, 0);
  encoded.set(meta.viewingPubKey, COMPRESSED_PUBKEY_LENGTH);
  return encoded;
}

export function decodeMetaAddress(bytes: Uint8Array): StealthMetaAddress {
  if (bytes.length !== META_ADDRESS_LENGTH) {
    throw new Error(
      `Invalid meta-address: expected 66 bytes, got ${bytes.length}`,
    );
  }

  const spendingPubKey = bytes.slice(0, COMPRESSED_PUBKEY_LENGTH);
  const viewingPubKey = bytes.slice(
    COMPRESSED_PUBKEY_LENGTH,
    META_ADDRESS_LENGTH,
  );
  expectCompressedPublicKey(spendingPubKey, "spending pubkey");
  expectCompressedPublicKey(viewingPubKey, "viewing pubkey");

  return { spendingPubKey, viewingPubKey };
}

function deriveSharedSecretHash(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  privateKeyLabel: string,
  publicKeyLabel: string,
): Uint8Array {
  expectPrivateKeyLength(privateKey, privateKeyLabel);
  expectCompressedPublicKey(publicKey, publicKeyLabel);
  return keccak_256(secp256k1.getSharedSecret(privateKey, publicKey));
}

function computeStealthAddressFromSecretHash(
  spendingPubKey: Uint8Array,
  secretHash: Uint8Array,
): `0x${string}` {
  expectCompressedPublicKey(spendingPubKey, "spending pubkey");
  const hashScalar =
    BigInt(`0x${bytesToHex(secretHash)}`) % secp256k1.CURVE.n;
  const stealthPoint = secp256k1.ProjectivePoint.fromHex(spendingPubKey).add(
    secp256k1.ProjectivePoint.BASE.multiply(hashScalar),
  );
  const uncompressed = stealthPoint.toRawBytes(false);
  const addressHash = keccak_256(uncompressed.slice(1));
  return `0x${bytesToHex(addressHash.slice(-20))}`;
}

export function computeStealthAddress(
  spendingPubKey: Uint8Array,
  viewingPrivKey: Uint8Array,
  ephemeralPubKey: Uint8Array,
): `0x${string}` {
  const secretHash = deriveSharedSecretHash(
    viewingPrivKey,
    ephemeralPubKey,
    "viewing private key",
    "ephemeral pubkey",
  );
  return computeStealthAddressFromSecretHash(spendingPubKey, secretHash);
}

export function generateStealthAddress(
  recipientMeta: StealthMetaAddress,
  options: StealthGenerationOptions = {},
): StealthOutput {
  const meta = computeStealthMetaAddress(recipientMeta);
  const ephemeralPrivateKey =
    options.ephemeralPrivateKey ?? secp256k1.utils.randomPrivateKey();
  expectPrivateKeyLength(ephemeralPrivateKey, "ephemeral private key");

  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivateKey, true);
  const sharedSecretHash = deriveSharedSecretHash(
    ephemeralPrivateKey,
    meta.viewingPubKey,
    "ephemeral private key",
    "viewing pubkey",
  );

  return {
    stealthAddress: computeStealthAddressFromSecretHash(
      meta.spendingPubKey,
      sharedSecretHash,
    ),
    ephemeralPubKey,
    viewTag: sharedSecretHash[0] ?? 0,
  };
}

export function checkViewTag(
  viewingPrivKey: Uint8Array,
  ephemeralPubKey: Uint8Array,
  announcementViewTag: number,
): boolean {
  const sharedSecretHash = deriveSharedSecretHash(
    viewingPrivKey,
    ephemeralPubKey,
    "viewing private key",
    "ephemeral pubkey",
  );
  return (sharedSecretHash[0] ?? 0) === announcementViewTag;
}

export const matchesViewTag = checkViewTag;

export function deriveStealthPrivateKey(
  spendingPrivKey: Uint8Array,
  viewingPrivKey: Uint8Array,
  ephemeralPubKey: Uint8Array,
): Uint8Array {
  expectPrivateKeyLength(spendingPrivKey, "spending private key");
  const sharedSecretHash = deriveSharedSecretHash(
    viewingPrivKey,
    ephemeralPubKey,
    "viewing private key",
    "ephemeral pubkey",
  );
  const spendScalar = BigInt(`0x${bytesToHex(spendingPrivKey)}`);
  const sharedScalar =
    BigInt(`0x${bytesToHex(sharedSecretHash)}`) % secp256k1.CURVE.n;
  const stealthScalar = (spendScalar + sharedScalar) % secp256k1.CURVE.n;
  return hexToBytes(stealthScalar.toString(16).padStart(64, "0"));
}

export function stealthPrivateKeyToAddress(
  stealthPrivateKey: Uint8Array,
): `0x${string}` {
  expectPrivateKeyLength(stealthPrivateKey, "stealth private key");
  const publicKey = secp256k1.getPublicKey(stealthPrivateKey, false);
  const addressHash = keccak_256(publicKey.slice(1));
  return `0x${bytesToHex(addressHash.slice(-20))}`;
}
