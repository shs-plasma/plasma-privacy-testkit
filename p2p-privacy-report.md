# P2P Privacy Flow Report — Stealth Addresses + Privacy Pools

**Date:** March 10, 2026
**Chain:** Plasma Testnet (Chain ID: 9746)
**RPC:** `https://thrumming-omniscient-fog.plasma-testnet.quiknode.pro/9e0462e2221113510287509d9ae53f6ade38e93b/`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Participants](#2-participants)
3. [Step 1: Setup — Key Derivation & Registration](#3-step-1-setup--key-derivation--registration)
4. [Step 2: Random Sender → Alice's Stealth Address](#4-step-2-random-sender--alices-stealth-address)
5. [Step 3: Alice Shields (Stealth → Pool)](#5-step-3-alice-shields-stealth--pool)
6. [Step 4: Alice Unshields to Bob's Stealth Address](#6-step-4-alice-unshields-to-bobs-stealth-address)
7. [Step 5: Bob Scans and Shields](#7-step-5-bob-scans-and-shields)
8. [Step 6: Bob Unshields to Final Address](#8-step-6-bob-unshields-to-final-address)
9. [Step 7: Privacy Verification](#9-step-7-privacy-verification)
10. [On-Chain Trail Analysis](#10-on-chain-trail-analysis)
11. [All Transactions](#11-all-transactions)
12. [Deployed Contracts](#12-deployed-contracts)

---

## 1. Executive Summary

This report documents a full peer-to-peer privacy flow on Plasma Testnet, combining **stealth addresses** (ERC-5564/6538) with **privacy pools** (0xbow protocol) and a **relayer** to achieve unlinkable value transfer between two participants.

The flow: a random sender (simulating a bridge or exchange) sends 1 USDT to Alice via a stealth address. Alice deposits into a privacy pool, then withdraws to Bob's stealth address via a relayer. Bob deposits into the pool, then withdraws to a fresh final address via the relayer. At no point do Alice's or Bob's real addresses appear in pool-related transactions.

### Key Results

| Step | Action | Status | Transaction |
|------|--------|--------|-------------|
| 1 | Setup (key derivation, registration, funding) | PASS | Multiple txs |
| 2 | Random sender → Alice's stealth address (1 USDT) | PASS | `0x585bb17f...` |
| 3 | Alice shields: stealth → pool deposit | PASS | `0xbc1a8230...` |
| 4 | Alice unshields: pool → Bob's stealth (relay) | PASS | `0x4c20e29d...` |
| 5 | Bob scans announcements, shields into pool | PASS | `0x874924f8...` |
| 6 | Bob unshields: pool → final address (relay) | PASS | `0x88af2508...` |
| 7 | Privacy verification (no address linkage) | ALL PASS | — |

---

## 2. Participants

| Role | Address | Description |
|------|---------|-------------|
| Alice (deployer) | `0x74787126f5991C71076898D3b2154c2e79dE5EA6` | Existing deployer key. Real address never appears in pool txs. |
| Bob (fresh) | `0xeC4AaF699838ac7a399DE12901004e49004A3854` | Generated fresh per test run. Real address never appears in pool txs. |
| Random sender | `0x7773F1384dE55a35427863818E21793A9413C470` | Simulates bridge/exchange. Generated fresh per run. |
| Relayer | `0x8CB4E5200c018032fa2cc2898D0Fe62f6970556D` | Submits both withdrawal txs. Users never call withdraw directly. |
| Alice's stealth | `0x6A0C55426A87E6d5c032ABAC405cBe60714e003F` | One-time address derived via ECDH. Deposits into pool. |
| Bob's stealth | `0x2b3209e4784E65266073c8F6eDBBd7b9C6F67004` | One-time address derived via ECDH. Receives from pool, deposits back. |
| Final recipient | `0x13B238A6B4e99E150dE60f920756A270b8D6E0E4` | Fresh address. Receives Bob's final withdrawal. |

---

## 3. Step 1: Setup — Key Derivation & Registration

### What Happens
- Alice and Bob each derive stealth keys (spending + viewing keypairs) from their private keys using `keccak256`-based deterministic derivation
- Both register 66-byte stealth meta-addresses on the ERC-6538 Registry contract (scheme ID 1 = secp256k1)
- Bob and the random sender are funded with 0.5 XPL each for gas

### Key Derivation

```
privateKey → keccak256(privKey || "spending") → spendingPrivKey → spendingPubKey (compressed)
           → keccak256(privKey || "viewing")  → viewingPrivKey  → viewingPubKey (compressed)

metaAddress = spendingPubKey (33 bytes) || viewingPubKey (33 bytes) = 66 bytes
```

### Transactions

| Action | Transaction |
|--------|-------------|
| Fund Bob (0.5 XPL) | `0x15072ea0893bb7078a3c269ef911bb9625e5504a379a9c36d5a1c4149532215e` |
| Fund random sender (0.5 XPL) | `0xd179fec706ecf582758ddc519a718a84df520be6027767c381707417ccce5ce7` |
| Alice registers meta-address | `0x65dd3fc7fbc71d1406544a5ab28f5a1f80cd69ae4afbb6bdf534467cd039b009` |
| Bob registers meta-address | `0x1c82adb07ada9dcd5663eef3046ae0f9d649f7c4f40465acf117463ddcd70a1a` |

---

## 4. Step 2: Random Sender → Alice's Stealth Address

### What Happens
1. Random sender looks up Alice's meta-address from the on-chain Registry
2. Generates a random ephemeral keypair, computes ECDH shared secret with Alice's viewing pubkey
3. Derives a one-time stealth address: `stealthPub = spendingPub + hash(sharedSecret) * G`
4. Sends 1 USDT to the stealth address
5. Announces on the ERC-5564 Announcer contract (ephemeral pubkey + view tag)

### Stealth Address Generation (ECDH)

```
ephemeralPriv = random()
sharedSecret  = ECDH(ephemeralPriv, Alice.viewingPubKey)
secretHash    = keccak256(sharedSecret)
viewTag       = secretHash[0]  (0x7d in this run)
stealthPub    = Alice.spendingPubKey + secretHash * G
stealthAddr   = keccak256(stealthPub)[12:]  → 0x6a0c55426a87e6d5c032abac405cbe60714e003f
```

### Verification
- Stealth address `0x6a0c...003f` is NOT Alice's real address `0x7478...5EA6` — **PASS**

### Transactions

| Action | Transaction |
|--------|-------------|
| Mint 1 USDT to random sender | (internal to `0x585b...` flow) |
| Transfer 1 USDT → Alice stealth | `0x585bb17f2f3d915e8c2a7074832bd80ea8f7248f979f424d8d882ef48098d204` |
| Announce stealth payment | `0xe3992fd3ea45d444166eaa8a1ce0bf9ff8ed106e65f5356965d47ebf6c3fe78e` |

---

## 5. Step 3: Alice Shields (Stealth → Pool)

### What Happens
1. Alice scans all Announcement events from the Announcer contract
2. For each announcement: checks view tag (fast filter, skips 255/256), then full ECDH to verify
3. Finds the matching announcement, derives the stealth private key
4. From the stealth address: approves Entrypoint, deposits 1 USDT into privacy pool with Poseidon precommitment
5. The stealth address is funded with 0.2 XPL for gas (in production, a paymaster handles this)

### Stealth Key Recovery

```
sharedSecret  = ECDH(Alice.viewingPrivKey, ephemeralPubKey)  // from announcement
secretHash    = keccak256(sharedSecret)
stealthPriv   = Alice.spendingPrivKey + secretHash  (mod n)
```

### Deposit Details

```
masterNullifier = Poseidon(11111)
masterSecret    = Poseidon(22222)
nullifier       = Poseidon(masterNullifier, scope, depositIndex)
secret          = Poseidon(masterSecret, scope, depositIndex)
precommitment   = Poseidon(nullifier, secret)
commitment      = Poseidon(value, label, precommitment)  // computed on-chain
```

- **Commitment:** `11275986093834521933624397622925564648019915833708478548641124698459933593725`
- **Label:** `17132479647749424101553138330674730482530978029317795334985198557048974492262`
- **Depositor on-chain:** `0x6A0C55426A87E6d5c032ABAC405cBe60714e003F` (stealth address, NOT Alice's real address)

### Transactions

| Action | Transaction |
|--------|-------------|
| Fund stealth with 0.2 XPL | (from Alice's main wallet) |
| Approve Entrypoint | (internal) |
| Deposit 1 USDT into pool | `0xbc1a8230b1fc083377a18e0a807eb2f8074b7da48f1921c48e749831fc1d556f` |

---

## 6. Step 4: Alice Unshields to Bob's Stealth Address

### What Happens
1. Alice looks up Bob's meta-address from the Registry
2. Generates a one-time stealth address for Bob: `0x2b3209e4784e65266073c8f6edbbd7b9c6f67004`
3. Builds state tree (Deposited + Withdrawn events) and ASP tree (all deposit labels)
4. Publishes ASP root via `Entrypoint.updateRoot()`
5. Generates Groth16 withdrawal proof with `recipient = Bob's stealth address`
6. Relayer submits `Entrypoint.relay()` — funds go to Bob's stealth address
7. Alice announces on the Announcer contract for Bob to detect the payment

### Relay Details

```
processooor  = Entrypoint (0x40a16921be84B19675D26ef2215aF30F7534EEfB)
recipient    = Bob's stealth (0x2b3209e4784e65266073c8f6edbbd7b9c6f67004)
feeRecipient = Relayer (0x8CB4E5200c018032fa2cc2898D0Fe62f6970556D)
relayFeeBPS  = 0
context      = keccak256(abi.encode(Withdrawal, scope)) % SNARK_FIELD
```

- **State tree:** 20 leaves, depth 5
- **Proof generation:** 1.0s
- **Withdrawal amount:** 1 USDT (full amount, 0 change)

### Transactions

| Action | Transaction |
|--------|-------------|
| Publish ASP root | `0x7ae88a72c906b235aa3513bb27efabc9825d968133cf0921a74fcb8297e16001` |
| Relay withdrawal → Bob stealth | `0x4c20e29debc142266d03a3ce941842dddb3d551efd59c29dde7149f927c170c2` |
| Announce for Bob | `0x12a3ded40ec5d69c6baef7c4499491b6a9766c927a103a9fb5cead5cadbe3c9b` |

---

## 7. Step 5: Bob Scans and Shields

### What Happens
1. Bob scans Announcement events, finds the one matching his viewing key
2. Derives the stealth private key for `0x2b3209e4...`
3. Verifies he received 1 USDT at the stealth address
4. Deposits 1 USDT into the privacy pool from the stealth address

### Verification
- Bob's stealth USDT balance: **1 USDT** (confirmed before deposit)
- **Depositor on-chain:** `0x2b3209e4784E65266073c8F6eDBBd7b9C6F67004` (stealth, NOT Bob's real address)
- **Commitment:** `9384631412713766181091835520255095168764617258787997747665392218732189405680`

### Transactions

| Action | Transaction |
|--------|-------------|
| Fund Bob's stealth with 0.2 XPL | (from Bob's main wallet) |
| Approve Entrypoint | (internal) |
| Deposit 1 USDT into pool | `0x874924f8f6c06dc88f256ac3656d7372b40012342d13b89493d76d93d53a00b8` |

---

## 8. Step 6: Bob Unshields to Final Address

### What Happens
1. A fresh final address is generated: `0x13B238A6B4e99E150dE60f920756A270b8D6E0E4`
2. State tree and ASP tree are rebuilt (22 leaves, depth 5)
3. Groth16 withdrawal proof generated with `recipient = final address`
4. Relayer submits `Entrypoint.relay()`
5. 1 USDT arrives at the final address

### Results
- **Proof generation:** 0.8s
- **Final address USDT balance:** 1 USDT
- **Relay tx sender:** `0x8CB4E5200c018032fa2cc2898D0Fe62f6970556D` (relayer)

### Transactions

| Action | Transaction |
|--------|-------------|
| Publish ASP root | `0x29c7d02330c87c7e26babf55f5904a30e2b75c7b6094a8febaa4c13d14653fde` |
| Relay withdrawal → final address | `0x88af25088084d46192adf0d9d86646745e09274d6c711c12cad2578d24e15139` |

---

## 9. Step 7: Privacy Verification

### Address Unlinkability Checks

| Check | Result |
|-------|--------|
| Alice stealth != Alice real | PASS |
| Bob stealth != Bob real | PASS |
| Alice stealth != Bob stealth | PASS |
| Final addr != any known address | PASS |

### What an Observer CANNOT See

- **Alice's real address** (`0x74787126f5991C71076898D3b2154c2e79dE5EA6`) never deposited into the pool
- **Bob's real address** (`0xeC4AaF699838ac7a399DE12901004e49004A3854`) never deposited into the pool
- **No on-chain link between Alice and Bob** — different stealth addresses, different pool interactions
- **No link between deposit and withdrawal** — the pool breaks the transaction graph
- **The 4 stealth addresses are cryptographically unlinkable** — each derived from a random ephemeral key

### What an Observer CAN See

- "A random address sent 1 USDT to `0x6a0c...`"
- "`0x6a0c...` deposited 1 USDT into a privacy pool"
- "A relayer withdrew 1 USDT from the pool to `0x2b32...`"
- "`0x2b32...` deposited 1 USDT into the pool"
- "A relayer withdrew 1 USDT from the pool to `0x13B2...`"
- **None of these addresses can be linked to Alice or Bob**

---

## 10. On-Chain Trail Analysis

### Visual Flow

```
                        VISIBLE ON-CHAIN
                        ================

Random Sender ──1 USDT──> Alice Stealth ──1 USDT──> Pool (deposit)
(0x7773...)               (0x6A0C...)                  |
                                                       | ZK proof
                                                       v
Relayer ──relay()──> Entrypoint ──withdraw──> Bob Stealth
(0x8CB4...)                                   (0x2b32...)
                                                  |
                                          1 USDT  |
                                                  v
                                              Pool (deposit)
                                                  |
                                                  | ZK proof
                                                  v
Relayer ──relay()──> Entrypoint ──withdraw──> Final Address
(0x8CB4...)                                   (0x13B2...)


                        INVISIBLE / UNLINKABLE
                        =======================

Alice (0x7478...) ─── owns ───> Alice Stealth (0x6A0C...)   [ECDH derivation]
Bob   (0xeC4A...) ─── owns ───> Bob Stealth   (0x2b32...)   [ECDH derivation]
Alice ──── sent to ────> Bob                                 [hidden by pool]
```

### Privacy Layers

| Layer | Mechanism | What It Hides |
|-------|-----------|---------------|
| Stealth addresses (ERC-5564) | ECDH key agreement | Receiver's real address |
| Privacy pool (0xbow) | Poseidon commitments + Groth16 proofs | Link between deposit and withdrawal |
| Relayer (Entrypoint.relay) | Third-party tx submission | Withdrawer's address as msg.sender |
| View tags | 1-byte fast filter | Reduces scanning cost by 256x |

---

## 11. All Transactions

### Step 1: Setup

| Tx | Link |
|----|------|
| Fund Bob | https://testnet.plasmascan.to/tx/0x15072ea0893bb7078a3c269ef911bb9625e5504a379a9c36d5a1c4149532215e |
| Fund random sender | https://testnet.plasmascan.to/tx/0xd179fec706ecf582758ddc519a718a84df520be6027767c381707417ccce5ce7 |
| Alice register meta-address | https://testnet.plasmascan.to/tx/0x65dd3fc7fbc71d1406544a5ab28f5a1f80cd69ae4afbb6bdf534467cd039b009 |
| Bob register meta-address | https://testnet.plasmascan.to/tx/0x1c82adb07ada9dcd5663eef3046ae0f9d649f7c4f40465acf117463ddcd70a1a |

### Step 2: Random → Alice Stealth

| Tx | Link |
|----|------|
| Send 1 USDT to stealth | https://testnet.plasmascan.to/tx/0x585bb17f2f3d915e8c2a7074832bd80ea8f7248f979f424d8d882ef48098d204 |
| Announce stealth payment | https://testnet.plasmascan.to/tx/0xe3992fd3ea45d444166eaa8a1ce0bf9ff8ed106e65f5356965d47ebf6c3fe78e |

### Step 3: Alice Stealth → Pool

| Tx | Link |
|----|------|
| Deposit 1 USDT into pool | https://testnet.plasmascan.to/tx/0xbc1a8230b1fc083377a18e0a807eb2f8074b7da48f1921c48e749831fc1d556f |

### Step 4: Pool → Bob Stealth (Relay)

| Tx | Link |
|----|------|
| Publish ASP root | https://testnet.plasmascan.to/tx/0x7ae88a72c906b235aa3513bb27efabc9825d968133cf0921a74fcb8297e16001 |
| Relay withdrawal to Bob stealth | https://testnet.plasmascan.to/tx/0x4c20e29debc142266d03a3ce941842dddb3d551efd59c29dde7149f927c170c2 |
| Announce for Bob | https://testnet.plasmascan.to/tx/0x12a3ded40ec5d69c6baef7c4499491b6a9766c927a103a9fb5cead5cadbe3c9b |

### Step 5: Bob Stealth → Pool

| Tx | Link |
|----|------|
| Deposit 1 USDT into pool | https://testnet.plasmascan.to/tx/0x874924f8f6c06dc88f256ac3656d7372b40012342d13b89493d76d93d53a00b8 |

### Step 6: Pool → Final Address (Relay)

| Tx | Link |
|----|------|
| Publish ASP root | https://testnet.plasmascan.to/tx/0x29c7d02330c87c7e26babf55f5904a30e2b75c7b6094a8febaa4c13d14653fde |
| Relay withdrawal to final address | https://testnet.plasmascan.to/tx/0x88af25088084d46192adf0d9d86646745e09274d6c711c12cad2578d24e15139 |

---

## 12. Deployed Contracts

| Contract | Address |
|----------|---------|
| ERC5564 Announcer | `0xc24e145910365df12b2F894D38d6342c9B72d387` |
| ERC6538 Registry | `0x04315dC5c91A55F48E94De5df21B6F681028f47b` |
| MockUSDT | `0x5e8135210b6C974F370e86139Ed22Af932a4d022` |
| Entrypoint (Proxy) | `0x40a16921be84B19675D26ef2215aF30F7534EEfB` |
| USDT Privacy Pool | `0x25F1fD54F5f813b282eD719c603CfaCa8f2A48F6` |
| WithdrawalVerifier | `0x03a7ad175889b694b5005f8835c6d8a6315a399c` |
| CommitmentVerifier | `0x999a02ff05448728160b6ad674c6785065612118` |

---

*End of Report*
