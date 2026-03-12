import { bytesToHex } from "@noble/hashes/utils";

export type NoteStatus =
  | "detected"
  | "queued"
  | "shielding"
  | "shielded"
  | "spent"
  | "withdrawn";

export interface PrivateNote {
  id: string;
  token: `0x${string}` | string;
  amount: bigint;
  stealthAddress: `0x${string}`;
  status: NoteStatus;
  viewTag: number;
  ephemeralPubKey: `0x${string}`;
  stealthPrivateKey?: `0x${string}`;
  announcementTxHash?: string;
  sourceTxHash?: string;
  shieldTxHash?: string;
  spendTxHash?: string;
  withdrawTxHash?: string;
  detectedAt: number;
  updatedAt: number;
}

export interface NoteSummary {
  detectedBalance: bigint;
  queuedBalance: bigint;
  shieldingBalance: bigint;
  shieldedBalance: bigint;
  spentBalance: bigint;
  withdrawnBalance: bigint;
  consolidatedShieldedBalance: bigint;
}

const NOTE_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  detected: ["queued"],
  queued: ["shielding"],
  shielding: ["shielded"],
  shielded: ["spent", "withdrawn"],
  spent: [],
  withdrawn: [],
};

export function createPrivateNote(input: {
  id: string;
  token: `0x${string}` | string;
  amount: bigint;
  stealthAddress: `0x${string}`;
  viewTag: number;
  ephemeralPubKey: Uint8Array | `0x${string}`;
  stealthPrivateKey?: Uint8Array | `0x${string}`;
  announcementTxHash?: string;
  sourceTxHash?: string;
  detectedAt?: number;
}): PrivateNote {
  const detectedAt = input.detectedAt ?? Date.now();
  return {
    id: input.id,
    token: input.token,
    amount: input.amount,
    stealthAddress: input.stealthAddress,
    status: "detected",
    viewTag: input.viewTag,
    ephemeralPubKey:
      typeof input.ephemeralPubKey === "string"
        ? input.ephemeralPubKey
        : (`0x${bytesToHex(input.ephemeralPubKey)}` as `0x${string}`),
    stealthPrivateKey:
      typeof input.stealthPrivateKey === "string"
        ? input.stealthPrivateKey
        : input.stealthPrivateKey
          ? (`0x${bytesToHex(input.stealthPrivateKey)}` as `0x${string}`)
          : undefined,
    announcementTxHash: input.announcementTxHash,
    sourceTxHash: input.sourceTxHash,
    detectedAt,
    updatedAt: detectedAt,
  };
}

export function transitionNote(
  note: PrivateNote,
  nextStatus: NoteStatus,
  patch: Partial<PrivateNote> = {},
): PrivateNote {
  const allowedNextStatuses = NOTE_TRANSITIONS[note.status];
  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new Error(`Invalid note transition: ${note.status} -> ${nextStatus}`);
  }

  return {
    ...note,
    ...patch,
    status: nextStatus,
    updatedAt: Date.now(),
  };
}

export function summarizeNotes(notes: PrivateNote[]): NoteSummary {
  const summary: NoteSummary = {
    detectedBalance: 0n,
    queuedBalance: 0n,
    shieldingBalance: 0n,
    shieldedBalance: 0n,
    spentBalance: 0n,
    withdrawnBalance: 0n,
    consolidatedShieldedBalance: 0n,
  };

  for (const note of notes) {
    if (note.status === "detected") {
      summary.detectedBalance += note.amount;
    } else if (note.status === "queued") {
      summary.queuedBalance += note.amount;
    } else if (note.status === "shielding") {
      summary.shieldingBalance += note.amount;
    } else if (note.status === "shielded") {
      summary.shieldedBalance += note.amount;
      summary.consolidatedShieldedBalance += note.amount;
    } else if (note.status === "spent") {
      summary.spentBalance += note.amount;
    } else if (note.status === "withdrawn") {
      summary.withdrawnBalance += note.amount;
    }
  }

  return summary;
}
