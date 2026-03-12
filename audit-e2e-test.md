# Audit E2E Test Report — Post-Audit Stealth Contracts on Plasma Testnet

**Date:** March 11, 2026
**Chain:** Plasma Testnet (Chain ID: 9746)
**RPC:** `https://thrumming-omniscient-fog.plasma-testnet.quiknode.pro/9e0462e2221113510287509d9ae53f6ade38e93b/`
**Audit Reference:** [`audit.md`](./audit.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Deployed Contracts (v2)](#2-deployed-contracts-v2)
3. [Test 1–2: Registry Input Validation [P2]](#3-test-12-registry-input-validation-p2)
4. [Test 3–5: Announcer Input Validation [P1]](#4-test-35-announcer-input-validation-p1)
5. [Test 6: Versioned Key Derivation [P1]](#5-test-6-versioned-key-derivation-p1)
6. [Test 7: Full Stealth Payment Flow [P2]](#6-test-7-full-stealth-payment-flow-p2)
7. [Test 8: Scanner Resilience](#7-test-8-scanner-resilience)
8. [Pre-Existing Test Suite Results](#8-pre-existing-test-suite-results)
9. [All Transactions](#9-all-transactions)
10. [Conclusion](#10-conclusion)

---

## 1. Executive Summary

This report documents the live testnet verification of all audit remediations identified in [`audit.md`](./audit.md). The updated ERC5564Announcer and ERC6538Registry contracts were redeployed to Plasma Testnet, and 17 end-to-end tests were executed against the live chain using the new TypeScript SDK.

### Results

| # | Test | Audit Finding | Status |
|---|------|---------------|--------|
| 1 | Registry rejects unsupported scheme | [P2] | PASS |
| 2 | Registry rejects malformed meta-address | [P2] | PASS |
| 3 | Announcer rejects unsupported scheme | [P1] | PASS |
| 4 | Announcer rejects invalid ephemeral pubkey | [P1] | PASS |
| 5 | Announcer rejects empty metadata | [P1] | PASS |
| 6 | Versioned key derivation (signMessage) | [P1] | PASS |
| 7a | Register meta-address (66 bytes) | [P2] | PASS |
| 7b | On-chain meta-address roundtrip | [P2] | PASS |
| 7c | Stealth address differs from real address | [P2] | PASS |
| 7d | USDT sent to stealth address | — | PASS |
| 7e | Announcement accepted (validated payload) | [P1] | PASS |
| 7f | Scanner found correct match | [P2] | PASS |
| 7g | Scanner-derived address matches | [P2] | PASS |
| 7h | Stealth private key controls address | [P2] | PASS |
| 7i | Stealth sweep (real key ownership proof) | [P2] | PASS |
| 7j | Note lifecycle tracking | — | PASS |
| 8 | Scanner resilience (3 malformed skipped) | [P1] | PASS |
| | **Total: 17 passed, 0 failed** | | |

---

## 2. Deployed Contracts (v2)

These are the freshly deployed contracts with all audit remediations applied:

| Contract | Address | Deploy Tx |
|----------|---------|-----------|
| ERC5564Announcer v2 | `0x7825081E008edc91D2841c72574d705253D24e6A` | [`0x30815eb2...`](https://testnet.plasmascan.to/tx/0x30815eb2506546e8efdfcf5236dd4defc754bf1378cd7f3aba2b0ae31f399d97) |
| ERC6538Registry v2 | `0xaC4a9A6D070Fe244B7D172499192C1CDF064Fe00` | [`0xcf447dd4...`](https://testnet.plasmascan.to/tx/0xcf447dd410ea1029bcb115d54b3accc59e66127adca968536e41122411882773) |
| MockUSDT v2 | `0x617BFC71cE983f856867d696a65234186bb111Db` | [`0xda74c110...`](https://testnet.plasmascan.to/tx/0xda74c110b3f5911346e6577bab63ca96b53ad169ac177d09749e1e636a39f03a) |

### Changes from v1

| Contract | v1 Address | What Changed |
|----------|-----------|--------------|
| ERC5564Announcer | `0xc24e145910365df12b2F894D38d6342c9B72d387` | Added `UnsupportedScheme`, `InvalidEphemeralPubKeyLength`, `EmptyMetadata` reverts |
| ERC6538Registry | `0x04315dC5c91A55F48E94De5df21B6F681028f47b` | Added `UnsupportedScheme`, `InvalidMetaAddressLength` reverts |

---

## 3. Test 1–2: Registry Input Validation [P2]

**Audit finding:** Registry accepted arbitrary bytes for any `schemeId`, allowing malformed registrations that could cause sender mis-derivation or scanner failures.

### Test 1: Reject Unsupported Scheme

```
registerKeys(schemeId=99, metaAddress=<valid 66 bytes>)
→ Reverted with UnsupportedScheme(99)  ✓
```

### Test 2: Reject Malformed Meta-Address Length

```
registerKeys(schemeId=1, metaAddress=<40 bytes, not 66>)
→ Reverted with InvalidMetaAddressLength(66, 40)  ✓
```

**Remediation verified:** The registry now enforces `schemeId == 1` and exactly 66 bytes for the meta-address.

---

## 4. Test 3–5: Announcer Input Validation [P1]

**Audit finding:** `announce()` accepted arbitrary `ephemeralPubKey` and `metadata` bytes. Malformed payloads could break off-chain scanners.

### Test 3: Reject Unsupported Scheme

```
announce(schemeId=99, ..., ephPubKey=<33 bytes>, metadata=<1 byte>)
→ Reverted with UnsupportedScheme(99)  ✓
```

### Test 4: Reject Invalid Ephemeral PubKey Length

```
announce(schemeId=1, ..., ephPubKey=<20 bytes>, metadata=<1 byte>)
→ Reverted with InvalidEphemeralPubKeyLength(33, 20)  ✓
```

### Test 5: Reject Empty Metadata

```
announce(schemeId=1, ..., ephPubKey=<33 bytes>, metadata=<0 bytes>)
→ Reverted with EmptyMetadata()  ✓
```

**Remediation verified:** The announcer now enforces `schemeId == 1`, exactly 33 bytes for ephemeral pubkey, and non-empty metadata.

---

## 5. Test 6: Versioned Key Derivation [P1]

**Audit finding:** Stealth keys were derived by hashing raw `signMessage()` output bytes directly. A provider change could derive different keys.

### What Changed

Key derivation now uses explicit versioned messages:

```
"Plasma Stealth Spending Key v1"  →  spendingPrivKey
"Plasma Stealth Viewing Key v1"  →  viewingPrivKey
```

Signature normalization supports both 65-byte canonical and 64-byte compact forms before deriving key material.

### Test Result

```
deriveStealthKeysFromPrivateKey(DEPLOYER_KEY) called twice
→ Both produce identical spending/viewing keys  ✓
→ Spending pubkey: 0x02157a51240deb14...
```

**Remediation verified:** Keys are deterministic and derived from versioned messages.

---

## 6. Test 7: Full Stealth Payment Flow [P2]

**Audit finding:** Passing tests did not prove the real stealth flow — they used `vm.addr()` stand-ins and hard-coded values.

This test exercises the complete cryptographic flow on live Plasma Testnet:

### 7a–7b: Key Derivation and Registration

1. Alice derives stealth keys using `deriveStealthKeysFromPrivateKey()` (versioned `signMessage` internally)
2. Encodes 66-byte meta-address (spending pubkey ‖ viewing pubkey)
3. Registers on the new Registry — accepted (validates scheme + length)
4. Reads back from on-chain — **roundtrip matches** ✓

### 7c–7d: Stealth Address Generation and Funding

1. Sender looks up Alice's meta-address from the Registry
2. Generates one-time stealth address via ECDH:
   ```
   ephemeralPriv = random()
   sharedSecret  = ECDH(ephemeralPriv, Alice.viewingPubKey)
   stealthPub    = Alice.spendingPubKey + keccak256(sharedSecret) * G
   stealthAddr   = keccak256(stealthPub)[12:]
   ```
3. Stealth address `0xec89577d...` differs from Alice's real address `0x74787126...` ✓
4. Sends 1 USDT to stealth address ✓

### 7e: Announcement (Validated)

1. Sender announces on the new Announcer with 33-byte ephemeral pubkey + 1-byte view tag metadata
2. Announcer accepts the payload (all validation checks pass) ✓

### 7f: Scanner Detection

1. Alice scans Announcement events using `scanAnnouncementsForReceiver()`
2. Scanner checks view tag (fast filter), then full ECDH verification
3. Found exactly 1 match ✓
4. Scanner-derived address matches generated stealth address ✓

### 7g–7h: Key Ownership Proof

1. Alice derives stealth private key: `stealthPriv = spendingPriv + keccak256(sharedSecret) mod n`
2. `stealthPrivateKeyToAddress(stealthPrivKey) === stealthAddress` ✓
3. Alice sweeps 1 USDT from stealth to a fresh address using the derived key ✓

### 7i: Note Lifecycle

1. Note created in `detected` state
2. Transitions: `detected → queued → shielding → shielded → spent`
3. Summary: `spentBalance = 1 USDT`, `consolidatedShieldedBalance = 0` ✓
4. Invalid transitions (e.g., `spent → queued`) throw as expected

**Remediation verified:** The full cryptographic flow works end-to-end on live testnet with real ECDH, real key derivation, and real fund movement.

---

## 7. Test 8: Scanner Resilience

**Audit finding:** Off-chain scanner assumed announcement payloads were valid and could throw while processing public events.

### Test

Scanner receives 4 announcements: 3 malformed + 1 valid:

| # | Issue | Scanner Action |
|---|-------|----------------|
| 1 | `schemeId = 999` (unsupported) | Skipped: "Unsupported scheme: 999" |
| 2 | `ephemeralPubKey = 10 bytes` (too short) | Skipped: "Invalid ephemeral pubkey: expected 33 bytes, got 10" |
| 3 | `metadata = 0x` (empty) | Skipped: "Invalid metadata: expected at least 1 byte" |
| 4 | Valid announcement | Matched ✓ |

**Result:** 1 match, 3 skipped — scanner does not throw on malformed data ✓

**Remediation verified:** Scanner treats announcements as untrusted input and skips malformed entries gracefully.

---

## 8. Pre-Existing Test Suite Results

In addition to the live testnet E2E test above, all pre-existing test suites pass:

### Forge Tests (16/16)

```
forge test --offline -vvv

Ran 5 tests for test/BN254.t.sol:BN254Test                    — ALL PASS
Ran 4 tests for src/BN254PrecompileTest.sol:BN254PrecompileTest — ALL PASS
Ran 7 tests for test/StealthFlow.t.sol:StealthFlowTest          — ALL PASS
```

Key Solidity tests:
- `test_RevertOnUnsupportedAnnouncementScheme()` — Announcer rejects `schemeId != 1`
- `test_RevertOnMalformedEphemeralPubKey()` — Announcer rejects wrong length
- `test_RevertOnEmptyMetadata()` — Announcer rejects `metadata.length == 0`
- `test_RevertOnUnsupportedRegistryScheme()` — Registry rejects `schemeId != 1`
- `test_RevertOnMalformedMetaAddress()` — Registry rejects `length != 66`
- `test_RegisterStealthMetaAddress()` — Valid registration succeeds
- `test_AnnounceEmitsEventForValidPayload()` — Valid announcement emits event

### TypeScript Unit Tests (5/5)

```
npm test

✓ derives identical key material from canonical and compact signatures
✓ matches deterministic stealth vectors end to end
✓ scans announcements defensively and skips malformed inputs
✓ models note lifecycle transitions and consolidated balances
✓ derives privacy, spending, and backup keys from versioned messages
```

### TypeScript E2E Test (1/1)

```
npm run test:e2e

✓ deploys local contracts and proves the real stealth key controls the funded address
```

This test spins up a local Anvil instance, deploys contracts, and runs the full flow: derive keys → register → generate stealth → fund → scan → derive private key → sweep.

### TypeScript Type Check

```
npm run typecheck  →  Clean (no errors)
```

---

## 9. All Transactions

### Contract Deployment

| Contract | Tx |
|----------|----|
| ERC5564Announcer v2 | https://testnet.plasmascan.to/tx/0x30815eb2506546e8efdfcf5236dd4defc754bf1378cd7f3aba2b0ae31f399d97 |
| ERC6538Registry v2 | https://testnet.plasmascan.to/tx/0xcf447dd410ea1029bcb115d54b3accc59e66127adca968536e41122411882773 |
| MockUSDT v2 | https://testnet.plasmascan.to/tx/0xda74c110b3f5911346e6577bab63ca96b53ad169ac177d09749e1e636a39f03a |

### E2E Test Transactions

*Note: Transaction hashes change per run due to random ephemeral keys. These are from the latest successful run.*

| Action | Tx |
|--------|----|
| Register Alice meta-address | [`0x979d9146...`](https://testnet.plasmascan.to/tx/0x979d9146) |
| Send 1 USDT to stealth | [`0xbec5c8a7...`](https://testnet.plasmascan.to/tx/0xbec5c8a7) |
| Announce stealth payment | [`0x333373e3...`](https://testnet.plasmascan.to/tx/0x333373e3) |
| Sweep 1 USDT from stealth | [`0xf73adca1...`](https://testnet.plasmascan.to/tx/0xf73adca1) |

---

## 10. Conclusion

All 17 live testnet tests pass, confirming that the audit remediations are correctly implemented and deployed:

| Audit Finding | Severity | Verification |
|---------------|----------|--------------|
| Malformed announcements could break scanners | P1 | On-chain rejection (tests 3–5) + off-chain resilience (test 8) |
| Key derivation tied to raw signature bytes | P1 | Versioned derivation confirmed (test 6) |
| Registry accepted malformed meta-addresses | P2 | On-chain rejection (tests 1–2) |
| Tests didn't prove real crypto flow | P2 | Full ECDH → stealth → sweep on live testnet (test 7) |

Combined with the pre-existing test suites (16 Forge + 5 unit + 1 local E2E), the repository now has comprehensive coverage across both contract-level validation and real cryptographic correctness.

---

*Test script: [`ts/scripts/audit-e2e-test.ts`](./ts/scripts/audit-e2e-test.ts)*
*Generated: March 11, 2026*
