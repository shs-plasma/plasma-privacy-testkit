# Audit Report

Date: 2026-03-11

## Scope

This document captures the main issues identified during the repository review, ordered by severity, along with their remediation status in the current working tree.

Reviewed surface:
- `src/`
- `test/`
- `sdk/`
- `ts/src/`
- `ts/scripts/`
- `ts/package.json`
- `README.md`
- `.github/workflows/test.yml`

Excluded:
- `lib/`
- `out/`
- `cache/`
- `broadcast/`
- `ts/node_modules/`

## Executive Summary

The original repo was a reasonable prototype of the stealth-address layer, but it had three trust gaps:
- the on-chain contracts accepted payloads that the off-chain consumers treated as well-formed,
- the key-derivation path depended on raw wallet signature bytes without a compatibility contract,
- the passing test suite did not validate the real cryptographic flow.

Those issues have now been addressed in the current working tree. The most important remaining risks are operational rather than purely code-level: production wallet compatibility, live testnet coverage in CI, and the fact that note lifecycle and shielding remain modeled locally rather than integrated with a relayer / queue / prover stack.

## Findings

### [P1] Malformed announcements could break off-chain scanners

- Original location: `src/ERC5564Announcer.sol`
- Original impact:
  - `announce()` accepted arbitrary `ephemeralPubKey` and `metadata` bytes.
  - The off-chain scanner path assumed those values were valid and could throw while processing public events.
  - Because announcements are public and permissionless, malformed payloads could become an availability problem for naive scanners.
- Remediation:
  - On-chain payload validation was added in `src/ERC5564Announcer.sol`.
  - The scanner now treats announcement logs as untrusted input and skips malformed entries instead of throwing in `ts/src/announcements.ts`.
- Current status: remediated in the current working tree.
- Relevant files:
  - `src/ERC5564Announcer.sol`
  - `ts/src/announcements.ts`

### [P1] Key derivation was tied to raw signature bytes

- Original location: `sdk/stealth.ts`
- Original impact:
  - Stealth keys, privacy key, and backup key were derived by hashing raw `signMessage()` output bytes directly.
  - Recovery depended on wallets continuing to return the same signature encoding and deterministic behavior forever.
  - A provider change from 65-byte signatures to compact signatures, or any encoding normalization change, could derive different keys for the same user.
- Remediation:
  - Key derivation is now versioned in `ts/src/stealth.ts`.
  - Explicit derivation messages were introduced:
    - `Plasma Stealth Spending Key v1`
    - `Plasma Stealth Viewing Key v1`
    - `Plasma Privacy Key v1`
    - `Plasma Backup Key v1`
  - Signature normalization now supports both canonical 65-byte and compact 64-byte forms before deriving key material.
  - Unit tests cover the normalization behavior in `ts/test/stealth.unit.test.ts`.
- Current status: remediated in the current working tree.
- Relevant files:
  - `ts/src/stealth.ts`
  - `ts/test/stealth.unit.test.ts`

### [P2] Registry accepted malformed stealth meta-address payloads

- Original location: `src/ERC6538Registry.sol`
- Original impact:
  - The registry accepted arbitrary bytes for any `schemeId`.
  - Off-chain decoding later assumed a specific format: two 33-byte compressed secp256k1 pubkeys.
  - A malformed registration could cause sender mis-derivation, scanner failures, or permanent self-lockout.
- Remediation:
  - The registry now rejects unsupported schemes and enforces the 66-byte meta-address length in `src/ERC6538Registry.sol`.
  - The decoder in `ts/src/stealth.ts` also fails closed on malformed payloads.
- Current status: remediated in the current working tree.
- Relevant files:
  - `src/ERC6538Registry.sol`
  - `ts/src/stealth.ts`

### [P2] Passing tests did not prove the real stealth flow

- Original location: `test/StealthFlow.t.sol:57`
- Original impact:
  - The Solidity suite used `vm.addr()` values as stand-ins for real public keys.
  - It used hard-coded "ephemeral" bytes and ordinary ERC20 transfers between preselected addresses.
  - The suite could stay green even if actual key derivation, meta-address encoding, announcement parsing, or stealth private key recovery were broken.
- Remediation:
  - The Solidity test was reduced to what Solidity can actually validate: contract-level input validation and event emission.
  - Real cryptographic coverage was moved into TypeScript:
    - deterministic vector tests in `ts/test/stealth.unit.test.ts`
    - a local Anvil end-to-end test in `ts/test/stealth.e2e.test.ts`
  - The end-to-end test derives keys from real `signMessage()` calls, registers the meta-address, generates a one-time stealth address, sends funds, scans the announcement, derives the stealth private key, and proves ownership by sweeping the funded address.
- Current status: remediated in the current working tree.
- Relevant files:
  - `test/StealthFlow.t.sol`
  - `ts/test/stealth.unit.test.ts`
  - `ts/test/stealth.e2e.test.ts`

### [P3] The published TypeScript package surface was internally inconsistent

- Original location: `ts/package.json`
- Original impact:
  - The package advertised commands that did not line up with the actual script files present under `ts/scripts/`.
  - This increased operator confusion and made the repo harder to use as a reference implementation.
- Remediation:
  - The TypeScript surface was consolidated into a canonical SDK under `ts/src/`.
  - Package scripts now point to real entrypoints.
  - Compatibility re-exports were added so older import paths continue to resolve:
    - `sdk/stealth.ts`
    - `ts/scripts/stealth-crypto.ts`
- Current status: remediated in the current working tree.
- Relevant files:
  - `ts/package.json`
  - `ts/src/index.ts`
  - `sdk/stealth.ts`
  - `ts/scripts/stealth-crypto.ts`

## Additional Improvements Implemented

The audit also drove several structural improvements that were not standalone vulnerabilities but materially improved trustworthiness:

- Added an explicit note lifecycle model in `ts/src/note-lifecycle.ts`:
  - `detected`
  - `queued`
  - `shielding`
  - `shielded`
  - `spent`
  - `withdrawn`
- Replaced the generic Foundry boilerplate README with a repo-specific `README.md`.
- Removed leftover Counter scaffold files.
- Expanded CI in `.github/workflows/test.yml` to run:
  - `forge fmt --check`
  - `forge build --sizes`
  - `forge test -vvv`
  - `npm run typecheck`
  - `npm test`
  - `npm run test:e2e`

## Residual Risks

The following items are still worth calling out:

### [Residual] Live testnet flow is not exercised in CI

- The local SDK and Anvil tests now cover the real cryptographic path, but the live Plasma smoke test in `ts/scripts/full-flow-test.ts` is not run automatically because it depends on real RPC and private-key configuration.
- Recommendation:
  - Keep the local e2e test as the required baseline.
  - Add a separately triggered environment-backed smoke job for testnet once stable credentials and deployment targets exist.

### [Residual] Recovery still depends on target-wallet behavior

- Signature normalization and versioning remove the most obvious format fragility, but recovery still depends on the target wallet continuing to sign the exact derivation messages consistently.
- Recommendation:
  - Capture and preserve golden test vectors for each production wallet/provider combination that will be supported.
  - Treat derivation message changes as a versioned migration event, not a silent refactor.

### [Residual] Shielding and note handling are modeled, not fully integrated

- The repo now has a clear off-chain note lifecycle model, but it still does not implement the relayer / queue / prover / privacy-pool services that would make this a production privacy system.
- Recommendation:
  - Keep presenting this repo as a stealth-layer reference implementation, not a complete end-to-end privacy product.

## Verification Snapshot

Current local verification completed successfully on 2026-03-11:

- `forge test --offline -vvv`
- `cd ts && npm run typecheck`
- `cd ts && npm test`
- `cd ts && npm run test:e2e`

## Conclusion

The original audit findings were valid for the earlier version of the repository. In the current working tree, those findings have been remediated, and the repo is now materially stronger as a reference implementation for the stealth-address layer. The main remaining gaps are operational and product-integration scope, not basic correctness of the local cryptographic path.
