# Plasma Privacy Testkit

Minimal reference implementation for the stealth-address layer of the Plasma privacy design.

What is real in this repo:
- `ERC6538Registry` stores 66-byte secp256k1 stealth meta-addresses on chain.
- `ERC5564Announcer` emits typed announcement events for one-time stealth payments.
- The TypeScript SDK in [`ts/src`](./ts/src) performs the actual secp256k1 key derivation, stealth address generation, announcement scanning, and note lifecycle modeling.
- The TypeScript test suite includes deterministic cryptographic vectors and a local Anvil end-to-end flow that proves the derived stealth private key controls the funded address.

What is not in scope here:
- Privacy pool circuits and verifier integration
- Relayer, queue worker, or prover services
- Production wallet recovery UX
- Full card, P2P, and withdrawal product flows

## Repo Layout

- `src/`: on-chain stealth primitives and BN254 checks
- `script/DeployStealth.s.sol`: deploy announcer, registry, and mock USDT
- `test/`: Solidity contract tests for registry/announcer validation
- `ts/src/`: canonical stealth SDK
- `ts/test/`: deterministic SDK tests and local-chain end-to-end tests
- `ts/scripts/full-flow-test.ts`: live Plasma testnet smoke test

## Local Development

### Solidity

```sh
forge fmt
forge build
forge test -vvv
```

If local macOS Foundry/OpenChain resolution causes `forge test` to panic, use:

```sh
forge test --offline -vvv
```

### SDK

```sh
cd ts
npm ci
npm run typecheck
npm test
npm run test:e2e
```

### Live Testnet Smoke Test

Fill `ts/.env` from `ts/.env.example`, then run:

```sh
cd ts
npm run full-test
```

This will:
1. Derive real stealth keys from deterministic wallet signatures.
2. Register the receiver's meta-address on chain.
3. Generate a one-time stealth address.
4. Send USDT and emit the announcement.
5. Scan announcements defensively and model the note lifecycle through `detected -> queued -> shielding -> shielded`.

## Design Notes

- Supported stealth scheme: `schemeId = 1` (secp256k1 compressed pubkeys).
- Registry entries are validated on-chain to exactly 66 bytes.
- Announcements are treated as untrusted input off chain and skipped if malformed.
- Key derivation is versioned through explicit signing messages:
  - `Plasma Stealth Spending Key v1`
  - `Plasma Stealth Viewing Key v1`
  - `Plasma Privacy Key v1`
  - `Plasma Backup Key v1`
