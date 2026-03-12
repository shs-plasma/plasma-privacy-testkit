import {
  checkViewTag,
  computeStealthAddress,
  deriveStealthPrivateKey,
  STEALTH_SCHEME_ID,
  type StealthKeys,
} from "./stealth.ts";
import { hexToBytes } from "@noble/hashes/utils";

export interface AnnouncementRecord {
  schemeId: bigint | number;
  stealthAddress: string;
  ephemeralPubKey: Uint8Array | string;
  metadata: Uint8Array | string;
  txHash?: string;
  blockNumber?: bigint;
  caller?: string;
}

export interface ParsedAnnouncement {
  schemeId: bigint;
  stealthAddress: `0x${string}`;
  ephemeralPubKey: Uint8Array;
  metadata: Uint8Array;
  viewTag: number;
  txHash?: string;
  blockNumber?: bigint;
  caller?: string;
}

export interface AnnouncementMatch {
  announcement: ParsedAnnouncement;
  stealthAddress: `0x${string}`;
  stealthPrivateKey: Uint8Array;
}

export interface AnnouncementSkip {
  announcement: AnnouncementRecord;
  reason: string;
}

export interface AnnouncementScanResult {
  matches: AnnouncementMatch[];
  skipped: AnnouncementSkip[];
}

function normalizeBytes(
  value: Uint8Array | string,
  label: string,
): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (!value.startsWith("0x")) {
    throw new Error(`Invalid ${label}: expected 0x-prefixed hex`);
  }

  return hexToBytes(value.slice(2));
}

export function parseAnnouncement(
  announcement: AnnouncementRecord,
): ParsedAnnouncement {
  const schemeId = BigInt(announcement.schemeId);
  if (schemeId !== STEALTH_SCHEME_ID) {
    throw new Error(`Unsupported scheme: ${schemeId.toString()}`);
  }

  const ephemeralPubKey = normalizeBytes(
    announcement.ephemeralPubKey,
    "ephemeral pubkey",
  );
  if (ephemeralPubKey.length !== 33) {
    throw new Error(
      `Invalid ephemeral pubkey: expected 33 bytes, got ${ephemeralPubKey.length}`,
    );
  }

  const metadata = normalizeBytes(announcement.metadata, "metadata");
  if (metadata.length === 0) {
    throw new Error("Invalid metadata: expected at least 1 byte");
  }

  const stealthAddress = announcement.stealthAddress as `0x${string}`;
  if (!stealthAddress.startsWith("0x") || stealthAddress.length !== 42) {
    throw new Error(`Invalid stealth address: ${announcement.stealthAddress}`);
  }

  return {
    schemeId,
    stealthAddress,
    ephemeralPubKey,
    metadata,
    viewTag: metadata[0] ?? 0,
    txHash: announcement.txHash,
    blockNumber: announcement.blockNumber,
    caller: announcement.caller,
  };
}

export function scanAnnouncementsForReceiver(
  announcements: AnnouncementRecord[],
  keys: Pick<StealthKeys, "spendingPubKey" | "spendingPrivKey" | "viewingPrivKey">,
): AnnouncementScanResult {
  const matches: AnnouncementMatch[] = [];
  const skipped: AnnouncementSkip[] = [];

  for (const announcement of announcements) {
    let parsed: ParsedAnnouncement;
    try {
      parsed = parseAnnouncement(announcement);
    } catch (error) {
      skipped.push({
        announcement,
        reason: error instanceof Error ? error.message : "Unknown parse error",
      });
      continue;
    }

    if (
      !checkViewTag(keys.viewingPrivKey, parsed.ephemeralPubKey, parsed.viewTag)
    ) {
      skipped.push({
        announcement,
        reason: "View tag mismatch",
      });
      continue;
    }

    const computedStealthAddress = computeStealthAddress(
      keys.spendingPubKey,
      keys.viewingPrivKey,
      parsed.ephemeralPubKey,
    );

    if (computedStealthAddress.toLowerCase() !== parsed.stealthAddress.toLowerCase()) {
      skipped.push({
        announcement,
        reason: "Stealth address mismatch",
      });
      continue;
    }

    matches.push({
      announcement: parsed,
      stealthAddress: computedStealthAddress,
      stealthPrivateKey: deriveStealthPrivateKey(
        keys.spendingPrivKey,
        keys.viewingPrivKey,
        parsed.ephemeralPubKey,
      ),
    });
  }

  return { matches, skipped };
}
