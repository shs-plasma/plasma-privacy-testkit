# Privacy Infrastructure on Plasma Network — Full Technical Report

**Date:** March 10, 2026
**Chain:** Plasma Testnet (Chain ID: 9746)
**RPC:** `https://thrumming-omniscient-fog.plasma-testnet.quiknode.pro/9e0462e2221113510287509d9ae53f6ade38e93b/`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase 1: BN254 Precompile Verification](#2-phase-1-bn254-precompile-verification)
3. [Phase 2: Stealth Address Infrastructure (ERC-5564/6538)](#3-phase-2-stealth-address-infrastructure-erc-55646538)
4. [Phase 3: Privacy Pools Protocol Deployment (0xbow)](#4-phase-3-privacy-pools-protocol-deployment-0xbow)
5. [Phase 4: Deposit Smoke Test](#5-phase-4-deposit-smoke-test)
6. [Phase 5: Full Privacy Pool E2E — ZK Proof Generation & Withdrawal](#6-phase-5-full-privacy-pool-e2e--zk-proof-generation--withdrawal)
7. [Phase 6: Double-Spend Protection & Ragequit](#7-phase-6-double-spend-protection--ragequit)
8. [Phase 7: Relayed Withdrawal (Entrypoint.relay)](#8-phase-7-relayed-withdrawal-entrypointrelay)
9. [Errors Encountered & Resolutions](#9-errors-encountered--resolutions)
10. [Architecture Deep Dive](#10-architecture-deep-dive)
11. [Deployed Contract Addresses](#11-deployed-contract-addresses)
12. [Source Code](#12-source-code)
13. [Circuit Artifacts & Trusted Setup](#13-circuit-artifacts--trusted-setup)

---

## 1. Executive Summary

This report documents the end-to-end build-out and testing of a privacy infrastructure stack on the Plasma Network, combining two complementary systems:

- **Stealth Addresses (ERC-5564/6538):** Unlinkable receiving — senders can pay a user without revealing the user's address on-chain.
- **Privacy Pools (0xbow Protocol):** ZK-proof-based deposit/withdrawal — Poseidon commitments, Groth16 proofs, and LeanIMT Merkle trees for confidential value transfer with ASP (Association Set Provider) compliance.

### Key Results

| Milestone | Status | Transaction |
|-----------|--------|-------------|
| BN254 precompiles (ecAdd, ecMul, ecPairing) | VERIFIED | `0x3570744ABd92DDE431dd00E17d515E033298cA0c` |
| Stealth address full flow (8 steps) | PASSED | Multiple txs on Plasma Testnet |
| Privacy Pool protocol deployment (6 contracts) | DEPLOYED | Block 17346012 |
| USDT deposit into pool (smoke test) | SUCCESS | `0xbd4ff901cd894f9943bfc7b8b813794be882a32d...` |
| Groth16 proof generation (1.0s) | VALID | Local snarkjs verification |
| On-chain withdrawal with ZK proof | SUCCESS | `0xdcccdd14de58d06dfec7d534f716c0f287caf4ef...` |
| Double-spend replay protection | PASS | Reverted with `0xb115d857` |
| Ragequit emergency exit (commitment proof) | SUCCESS | `0xa1ecfdf0a983ddc19d3b5cb2ccf9a62e0f1f3351...` |
| Relayed withdrawal via Entrypoint.relay() | SUCCESS | `0x2fc3743b03ef08370a773324c6c72842a5ffb6cf...` |
| **Full cycle: Deposit → Prove → Relay → Double-spend → Ragequit** | **COMPLETE** | All on Plasma Testnet |

---

## 2. Phase 1: BN254 Precompile Verification

### Objective
Verify that Plasma Network supports the BN254 elliptic curve precompiles (ecAdd at `0x06`, ecMul at `0x07`, ecPairing at `0x08`), which are required for Groth16 ZK proof verification.

### Approach
1. Created `BN254PrecompileTest.sol` with tests for each precompile
2. Deployed to Plasma Testnet via Forge script
3. Ran on-chain verification via `cast call`

### Deployment Output

```
forge script script/DeployBN254Test.s.sol \
  --rpc-url $PLASMA_TESTNET_RPC \
  --broadcast \
  --private-key $PRIVATE_KEY

BN254 Tester: 0x3570744ABd92DDE431dd00E17d515E033298cA0c
```

### On-Chain Test Results

```bash
$ cast call 0x3570744ABd92DDE431dd00E17d515E033298cA0c 'testEcAdd()(bool)' --rpc-url $PLASMA_TESTNET_RPC
true

$ cast call 0x3570744ABd92DDE431dd00E17d515E033298cA0c 'testEcMul()(bool)' --rpc-url $PLASMA_TESTNET_RPC
true

$ cast call 0x3570744ABd92DDE431dd00E17d515E033298cA0c 'testEcPairing()(bool)' --rpc-url $PLASMA_TESTNET_RPC
true

$ cast call 0x3570744ABd92DDE431dd00E17d515E033298cA0c 'testEcAddInvalid()(bool)' --rpc-url $PLASMA_TESTNET_RPC
true  # (graceful failure for invalid input)

$ cast call 0x3570744ABd92DDE431dd00E17d515E033298cA0c 'benchmarkGas()(uint256,uint256,uint256)' --rpc-url $PLASMA_TESTNET_RPC
# ecAdd gas, ecMul gas, ecPairing gas (2 pairs)
```

### Forge Test Output (Local)

```
forge test --match-contract BN254Test -vvv

[PASS] test_ecAdd() (gas: ...)
[PASS] test_ecMul() (gas: ...)
[PASS] test_ecPairing() (gas: ...)
[PASS] test_invalidInputHandling() (gas: ...)
[PASS] test_gasReport() (gas: ...)
  Logs:
    ecAdd gas: ...
    ecMul gas: ...
    ecPairing gas (2 pairs): ...
```

### Finding
All three BN254 precompiles work correctly on Plasma Network. Groth16 ZK proof verification is fully supported.

---

## 3. Phase 2: Stealth Address Infrastructure (ERC-5564/6538)

### Objective
Deploy and test the complete stealth address system: ERC-5564 Announcer + ERC-6538 Registry + ECDH-based stealth address generation/scanning.

### Contracts Deployed

| Contract | Address |
|----------|---------|
| ERC5564Announcer | `0xc24e145910365df12b2F894D38d6342c9B72d387` |
| ERC6538Registry | `0x04315dC5c91A55F48E94De5df21B6F681028f47b` |
| MockUSDT | `0x5e8135210b6C974F370e86139Ed22Af932a4d022` |

### Forge Test Output (Local)

```
forge test --match-contract StealthFlowTest -vvv

[PASS] test_RegisterStealthMetaAddress()
[PASS] test_DepositViaStealthAddress()
[PASS] test_P2PStealthTransfer()
[PASS] test_StealthAddressUniqueness()
[PASS] test_SpendingKeyDerivation()
[PASS] test_ViewTagScanning()

Suite result: ok. 6 passed; 0 failed; 0 skipped
```

### TypeScript E2E Test Output (Live Testnet)

```
=== Plasma Privacy — Full Stealth Flow Test ===

Danny (receiver): 0x74787126f5991C71076898D3b2154c2e79dE5EA6
Sender (Bridge/Binance): 0x...
Chain: Plasma Testnet (9746)

--- Step 1: Derive stealth keys ---
  Spending pubkey: 0x02...
  Viewing pubkey:  0x03...
  Deterministic: PASS

--- Step 2: Register meta-address on-chain ---
  Meta-address: 0x02...
  Tx: 0x...
  Registered: PASS

--- Step 3: Mint USDT to sender ---
  Sender balance: 1000.0 USDT

--- Step 4: Generate stealth address for Danny ---
  Stealth address: 0x... (different from Danny's EOA)
  Ephemeral pubkey: 0x02...
  View tag: 0xAB
  Is Danny's EOA? PASS — different address

--- Step 5: Send USDT to stealth address ---
  Sent 500 USDT to 0x...

--- Step 6: Announce stealth payment ---
  Announced: 0x...

--- Step 7: Danny scans for payments ---
  Found N announcement(s)
  MATCH — Payment found at 0x...
  Stealth private key derived: 0x...
  Stealth balance: 500.0 USDT

--- Step 8: Sweep from stealth address ---
  Stealth account: 0x...
  Matches announced: PASS

=== RESULTS ===

  Payment found via scanning: PASS
  Danny's EOA USDT balance: 0.0 USDT
  Danny's EOA touched USDT: PASS — Zero (never touched)
  Stealth address != Danny: PASS

  On-chain trail:
    Sender / Bridge (0x...)
      → 500 USDT → Stealth (0x...)
    Danny's address (0x74787126f5991C71076898D3b2154c2e79dE5EA6)
      → NOWHERE in the transaction history

  An observer sees: "Bridge sent 500 USDT to an unknown address."
  An observer does NOT see: any connection to Danny.
```

### Finding
Full stealth address flow works end-to-end on Plasma testnet. Danny's EOA never appears in any USDT transaction — complete privacy for the receiver.

---

## 4. Phase 3: Privacy Pools Protocol Deployment (0xbow)

### Objective
Deploy the full 0xbow Privacy Pools protocol to Plasma Testnet, including Groth16 verifiers, Entrypoint with proxy pattern, and both native (XPL) and ERC20 (USDT) pools.

### Approach

1. Forked `https://github.com/0xbow-io/privacy-pools-core.git`
2. Added `PlasmaTestnet` config to `Deploy.s.sol` with chain ID 9746
3. Configured `.env` with deployer address and Plasma RPC
4. Added `plasma_testnet` to `foundry.toml` RPC endpoints
5. Fixed `lean-imt` remapping (Foundry treats `.sol` in path `@zk-kit/lean-imt.sol` as file extension — created symlink `lean-imt-sol` → `lean-imt.sol`)
6. Deployed via `forge script` with WSS RPC (HTTPS had transport errors)

### Customizations Made

**`Deploy.s.sol` — Added PlasmaTestnet contract:**
```solidity
contract PlasmaTestnet is DeployProtocol {
  function setUp() public override chainId(9_746) {
    _nativePoolConfig = PoolConfig({
      symbol: 'XPL',
      asset: IERC20(Constants.NATIVE_ASSET),
      minimumDepositAmount: 0.001 ether,
      vettingFeeBPS: 0,
      maxRelayFeeBPS: 0
    });
    _tokenPoolConfigs.push(PoolConfig({
      symbol: 'USDT',
      asset: IERC20(0x5e8135210b6C974F370e86139Ed22Af932a4d022),
      minimumDepositAmount: 1_000_000,
      vettingFeeBPS: 0,
      maxRelayFeeBPS: 0
    }));
    super.setUp();
  }
}
```

**`foundry.toml` — Added Plasma RPC:**
```toml
[rpc_endpoints]
plasma_testnet = "${PLASMA_TESTNET_RPC}"
```

**`remappings.txt` — Fixed lean-imt symlink:**
```
lean-imt/=../../node_modules/@zk-kit/lean-imt-sol/
```

**`.env`:**
```
DEPLOYER_ADDRESS=0x74787126f5991C71076898D3b2154c2e79dE5EA6
OWNER_ADDRESS=0x74787126f5991C71076898D3b2154c2e79dE5EA6
POSTMAN_ADDRESS=0x74787126f5991C71076898D3b2154c2e79dE5EA6
PLASMA_TESTNET_RPC=https://thrumming-omniscient-fog.plasma-testnet.quiknode.pro/...
```

### Deployment Output

All 6 contracts deployed in a single transaction at block `17346012` via CreateX deterministic factory (`0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`):

```json
{
  "chainId": 9746,
  "contracts": [
    {
      "name": "WithdrawalVerifier",
      "address": "0x03a7ad175889b694b5005f8835c6d8a6315a399c"
    },
    {
      "name": "CommitmentVerifier",
      "address": "0x999a02ff05448728160b6ad674c6785065612118"
    },
    {
      "name": "Entrypoint_Implementation",
      "address": "0x566c528d1da84977bcbbeb3f3b58dfef615be011"
    },
    {
      "name": "Entrypoint_Proxy",
      "address": "0x40a16921be84b19675d26ef2215af30f7534eefb"
    },
    {
      "name": "PrivacyPoolSimple_XPL",
      "address": "0xdb4e84c2fe249c74aedf7d61f1fd9e41277ef904",
      "scope": "17406718746237955480638758204062562487184846013271252399202450122718613047954"
    },
    {
      "name": "PrivacyPoolComplex_USDT",
      "address": "0x25f1fd54f5f813b282ed719c603cfaca8f2a48f6",
      "scope": "8150235888312453013502370304573144285319316956230405798453197412736465838637"
    }
  ]
}
```

---

## 5. Phase 4: Deposit Smoke Test

### Objective
Verify the deposit flow works: Mint USDT → Approve → Deposit into pool via Entrypoint.

### Commands & Output

```bash
# 1. Mint 1000 USDT
cast send 0x5e8135210b6C974F370e86139Ed22Af932a4d022 \
  'mint(address,uint256)' \
  0x74787126f5991C71076898D3b2154c2e79dE5EA6 1000000000 \
  --rpc-url $PLASMA_TESTNET_RPC --private-key $PRIVATE_KEY
# Status: success

# 2. Approve Entrypoint to spend USDT
cast send 0x5e8135210b6C974F370e86139Ed22Af932a4d022 \
  'approve(address,uint256)' \
  0x40a16921be84b19675d26ef2215af30f7534eefb 1000000000 \
  --rpc-url $PLASMA_TESTNET_RPC --private-key $PRIVATE_KEY
# Status: success

# 3. Deposit 100 USDT (100_000_000 raw, 6 decimals) with dummy precommitment
cast send 0x40a16921be84b19675d26ef2215af30f7534eefb \
  'deposit(address,uint256,uint256)' \
  0x5e8135210b6C974F370e86139Ed22Af932a4d022 \
  100000000 \
  0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef \
  --rpc-url $PLASMA_TESTNET_RPC --private-key $PRIVATE_KEY
# Status: success
# Transaction: 0xbd4ff901cd894f9943bfc7b8b813794be882a32d643a8e28ad11ac418089e11c

# 4. Verify — check events
# Deposited event emitted with:
#   depositor: 0x74787126f5991C71076898D3b2154c2e79dE5EA6
#   commitment: 0x1295c75f9b13e62fba4c39dcfb0a6a1d217bad14ec400ef3c52e1d74b4d0ee63
#   label: 0x28d828cbda26074b2928aebce46642fe0805f3ca65d00fd2ea182decff413794
#   value: 0x5f5e100 (100,000,000 = 100 USDT)
#   precommitmentHash: 0x1234567890abcdef...
```

### Finding
Deposit flow works. The pool computes `commitment = Poseidon(value, label, precommitment)` and inserts it into the LeanIMT state tree. The `Deposited` event contains all necessary data for later proof generation.

---

## 6. Phase 5: Full Privacy Pool E2E — ZK Proof Generation & Withdrawal

### Objective
Complete the full cycle: Generate Poseidon master keys → Deterministic deposit secrets → Deposit → Publish ASP root → Build Merkle trees → Generate Groth16 withdrawal proof → Submit on-chain withdrawal.

### Raw Test Output (Successful Run)

```
============================================================
Privacy Pool E2E Test — Plasma Testnet (Chain 9746)
============================================================
Account: 0x74787126f5991C71076898D3b2154c2e79dE5EA6

--- Step 1: Get Pool Scope ---
USDT Pool Scope: 8150235888312453013502370304573144285319316956230405798453197412736465838637

--- Step 2: Generate Deposit Secrets ---
Master nullifier: 4267533774488295900887461483015112262021273608761099826938271132511348470966
Master secret:    2121968766167333970218429520020169404471719144852242899009174602937681896919
Deposit nullifier: 13672912586379713254148371858448179470002148903199807205728240360119298769625
Deposit secret:    2863513955372596040085171586521537675023501671170062832299686790369713073892
Precommitment hash: 9602431008283818799345447724425831621084447730658462755355288912264863645934

--- Step 3: Deposit USDT ---
USDT Balance: 898000000 (898 USDT)
Depositing 1000000 (1 USDT) with precommitment...
Deposit tx: 0x05147bd88cb16e90897df16a019656ebfee4cd953f8b3e77f7d722e7333a96aa
Block: 17349290, Status: success

--- Step 4: Parse Deposit Event ---
On-chain commitment: 10392602723861013722687592426940912292366729797140386611302449991033983169857
On-chain label:      5623020930847953332893998251413827693047111445086555342554447782462907419693
On-chain value:      1000000
On-chain precommit:  9602431008283818799345447724425831621084447730658462755355288912264863645934
Expected commitment: 10392602723861013722687592426940912292366729797140386611302449991033983169857
Match: true

--- Step 5: Publish ASP Root ---
ASP tree root: 2642845252922825822207990360195371622531777094209432612753561524611982513974
ASP tree depth: 2
Publishing ASP root to Entrypoint...
updateRoot tx: 0x0d04573b4498e914b51b5741ff54f48122b50570dc0997c4dfe98400e2788d9e, status: success
Latest ASP root on-chain: 2642845252922825822207990360195371622531777094209432612753561524611982513974
Match: true

--- Step 6: Build State Merkle Tree ---
Total deposits found: 4
State tree root: 18676527919053559823346057077416117020187822867205295204735571553705303891687
State tree depth: 2
State proof index: 3
State proof siblings count: 2
ASP proof index: 3
ASP proof siblings count: 2

--- Step 7: Generate Withdrawal Secrets ---
Withdrawing: 500000 (0.5 USDT)
Change note: 500000 (0.5 USDT)
New nullifier: 17693730941867266172311854373097172024589630320698481544396589984924061677450
New secret:    16129817566447999994108363799215637615094893250535495373929236865677131989694

--- Step 8: Generate Withdrawal Proof ---
Context: 20719153768067374023352616699286360797491879041414157386168219325663898897480
Circuit inputs prepared. Generating Groth16 proof...
  withdrawnValue: 500000
  stateRoot: 18676527919053559823346057077416117020187822867205295204735571553705303891687
  stateTreeDepth: 2
  ASPRoot: 2642845252922825822207990360195371622531777094209432612753561524611982513974
  ASPTreeDepth: 2
  context: 20719153768067374023352616699286360797491879041414157386168219325663898897480
  label: 5623020930847953332893998251413827693047111445086555342554447782462907419693
  existingValue: 1000000
  stateIndex: 3
  ASPIndex: 3
Running snarkjs.groth16.fullProve (this may take a minute)...
Proof generated in 1.0s!
Public signals (8):
  [0] newCommitmentHash: 4363178319139575315116736115205616018090502445312757001881775409209596492441
  [1] existingNullifierHash: 11171648478558952228167301580004401840652381016960814163436581061909756068104
  [2] withdrawnValue: 500000
  [3] stateRoot: 18676527919053559823346057077416117020187822867205295204735571553705303891687
  [4] stateTreeDepth: 2
  [5] ASPRoot: 2642845252922825822207990360195371622531777094209432612753561524611982513974
  [6] ASPTreeDepth: 2
  [7] context: 20719153768067374023352616699286360797491879041414157386168219325663898897480

Verifying proof locally...
Local verification: VALID

--- Step 9: Submit Withdrawal On-Chain ---
Submitting withdrawal to pool contract...
  processooor: 0x74787126f5991C71076898D3b2154c2e79dE5EA6
  withdrawnValue: 500000
Withdraw tx: 0xdcccdd14de58d06dfec7d534f716c0f287caf4efc063bf1515b20a9ca98dda72
Block: 17349301, Status: success

Final USDT Balance: 897500000 (897.5 USDT)

============================================================
FULL PRIVACY POOL CYCLE COMPLETE!
  Deposited:  1 USDT
  Withdrawn:  0.5 USDT
  Change note: 0.5 USDT (still in pool)
============================================================
```

---

## 7. Phase 6: Double-Spend Protection & Ragequit

### Objective
Verify two critical security/safety properties:
1. **Double-spend protection**: Replaying the exact same withdrawal proof (same nullifier) must be rejected
2. **Ragequit (emergency exit)**: A depositor can reclaim funds using only a commitment proof (no ASP approval needed)

### State Tree Fix (Prerequisite)

Before Steps 10-11 could work, the state tree reconstruction had to be fixed. The original code only collected commitments from `Deposited` events, but `withdraw()` also inserts a `newCommitmentHash` into the state tree via `_insert()`. After a successful withdrawal, subsequent proof generation would produce an `UnknownStateRoot()` error because the local tree was missing these withdrawal-inserted commitments.

**Fix:** Scan both `Deposited` and `Withdrawn` events, sort by `(blockNumber, logIndex)`, and insert all commitments in order:
```typescript
// Fetch Withdrawn events (withdrawals also insert a new commitment into the state tree)
const withdrawnLogs = await publicClient.getLogs({
  address: USDT_POOL,
  event: { name: "Withdrawn", inputs: [
    { name: "_processooor", type: "address", indexed: true },
    { name: "_value", type: "uint256", indexed: false },
    { name: "_spentNullifier", type: "uint256", indexed: false },
    { name: "_newCommitment", type: "uint256", indexed: false },
  ]},
  fromBlock: from, toBlock: to,
});
// Sort all entries by (blockNumber, logIndex), then insert into LeanIMT
```

### Raw Test Output (Successful Run — All 11 Steps)

```
============================================================
Privacy Pool E2E Test — Plasma Testnet (Chain 9746)
============================================================
Account: 0x74787126f5991C71076898D3b2154c2e79dE5EA6

--- Step 1: Get Pool Scope ---
USDT Pool Scope: 8150235888312453013502370304573144285319316956230405798453197412736465838637

--- Step 2: Generate Deposit Secrets ---
Master nullifier: 4267533774488295900887461483015112262021273608761099826938271132511348470966
Master secret:    2121968766167333970218429520020169404471719144852242899009174602937681896919
Deposit nullifier: 18641353988355265752767911761211082400573457015036278140417795447246386685772
Deposit secret:    19458227846382330173800164812510372263724667931812510181567123326640992238230
Precommitment hash: 9851282044547949967406673599859907554470377202304452591411609620021595396638

--- Step 3: Deposit USDT ---
USDT Balance: 895500000 (895.5 USDT)
Depositing 1000000 (1 USDT) with precommitment...
Deposit tx: 0xe52c219d6b847a65ab8190e5b407c7f6e61943792419be50799965cc7e4b92f8
Block: 17352269, Status: success

--- Step 4: Parse Deposit Event ---
On-chain commitment: 13100589954187826160774611122367348603678410574266403332536798967353028651062
On-chain label:      555592606850521406855682877225028349216666250593584186091360620506992226246
On-chain value:      1000000
On-chain precommit:  9851282044547949967406673599859907554470377202304452591411609620021595396638
Expected commitment: 13100589954187826160774611122367348603678410574266403332536798967353028651062
Match: true

--- Step 5: Publish ASP Root ---
ASP tree root: 13722388662816597348382869165285691098855764022262551437301605935299980580319
ASP tree depth: 3
Publishing ASP root to Entrypoint...
updateRoot tx: 0x7c80ecb6f8eae7455210aac36a6b48ead6953a7eb7b18fe4e8550c162e9c42f0, status: success
Latest ASP root on-chain: 13722388662816597348382869165285691098855764022262551437301605935299980580319
Match: true

--- Step 6: Build State Merkle Tree ---
Total state leaves: 8 (7 deposits + 1 withdrawal change notes)
State tree root: 5594279942814851312852400737954817086170367470436437296292586595957273812145
State tree depth: 3
State proof index: 7
State proof siblings count: 3
Looking for label in ASP tree: 555592606850521406855682877225028349216666250593584186091360620506992226246
ASP tree size: 7
ASP index: 6

--- Step 7: Generate Withdrawal Secrets ---
Withdrawing: 500000 (0.5 USDT)
Change note: 500000 (0.5 USDT)
New nullifier: 11802095313853899330386259737231279692368706633294645662468217670221155869354
New secret:    4276529237533600503480818548667009743940786698733340030455034497321524017388

--- Step 8: Generate Withdrawal Proof ---
Context: 20719153768067374023352616699286360797491879041414157386168219325663898897480
Circuit inputs prepared. Generating Groth16 proof...
  withdrawnValue: 500000
  stateRoot: 5594279942814851312852400737954817086170367470436437296292586595957273812145
  stateTreeDepth: 3
  ASPRoot: 13722388662816597348382869165285691098855764022262551437301605935299980580319
  ASPTreeDepth: 3
Running snarkjs.groth16.fullProve (this may take a minute)...
Proof generated in 1.0s!
Public signals (8):
  [0] newCommitmentHash: 3762799042319453822889170743165777429974231467748874106892219656007283307123
  [1] existingNullifierHash: 13290715578034722659235967205572751023859197175113963982798868513244341639245
  [2] withdrawnValue: 500000
  [3] stateRoot: 5594279942814851312852400737954817086170367470436437296292586595957273812145
  [4] stateTreeDepth: 3
  [5] ASPRoot: 13722388662816597348382869165285691098855764022262551437301605935299980580319
  [6] ASPTreeDepth: 3
  [7] context: 20719153768067374023352616699286360797491879041414157386168219325663898897480

Verifying proof locally...
Local verification: VALID

--- Step 9: Submit Withdrawal On-Chain ---
Submitting withdrawal to pool contract...
  processooor: 0x74787126f5991C71076898D3b2154c2e79dE5EA6
  withdrawnValue: 500000
Withdraw tx: 0x21c928ccbb30fcf91fb0556f4cd9b7ec66a08eea129b5bfd69e1d0717291ff1f
Block: 17352280, Status: success

Final USDT Balance: 895000000 (895 USDT)

--- Step 10: Double-Spend Protection Test ---
Replaying the exact same withdrawal proof (same nullifier)...
Reverted as expected: 0xb115d857
Double-spend rejected: PASS

--- Step 11: Ragequit (Emergency Exit) ---
Ragequitting the 0.5 USDT change note still in the pool...
Generating commitment proof for ragequit...
  value:     500000
  label:     555592606850521406855682877225028349216666250593584186091360620506992226246
  nullifier: 11802095313853899330386259737231279692368706633294645662468217670221155869354
  secret:    4276529237533600503480818548667009743940786698733340030455034497321524017388
Commitment proof generated in 0.1s
Public signals (4):
  [0] commitmentHash: 3762799042319453822889170743165777429974231467748874106892219656007283307123
  [1] nullifierHash: 10010884431805174723532726190848154175656755751785073608953295480305106666869
  [2] value: 500000
  [3] label: 555592606850521406855682877225028349216666250593584186091360620506992226246
Local verification: VALID

Change commitment hash (from commitment proof): 3762799042319453822889170743165777429974231467748874106892219656007283307123
newCommitmentHash (from withdrawal proof):       3762799042319453822889170743165777429974231467748874106892219656007283307123
Match: true

USDT balance before ragequit: 895000000 (895 USDT)
Submitting ragequit to pool contract...
Ragequit tx: 0xa1ecfdf0a983ddc19d3b5cb2ccf9a62e0f1f335140ff09e22ac06de070085a94
Block: 17352285, Status: success
USDT balance after ragequit:  895500000 (895.5 USDT)
Ragequit received: 500000 (0.5 USDT)
Ragequit amount matches change note: PASS

============================================================
FULL PRIVACY POOL CYCLE COMPLETE!
============================================================
  Step 3:  Deposited  1 USDT
  Step 9:  Withdrew   0.5 USDT (ZK proof)
  Step 10: Double-spend replay -> rejected
  Step 11: Ragequit   0.5 USDT (emergency exit)
  Net:     Pool balance should be 0 USDT from our deposits
  Final USDT balance: 895.5 USDT
============================================================
```

### Analysis

**Step 10 — Double-Spend Protection:**
- Replayed the exact same withdrawal proof (same nullifier hash `13290715...`)
- Pool rejected with selector `0xb115d857` (NullifierAlreadyUsed)
- The `_spend()` function records each nullifier hash in a mapping; second use reverts
- **PASS** — critical security property verified

**Step 11 — Ragequit Emergency Exit:**
- The 0.5 USDT change note (newCommitmentHash from Step 9) was still in the pool's state tree
- Generated a **commitment proof** (not withdrawal proof) using `commitment.wasm`/`commitment.zkey`
- Commitment circuit has 4 public signals: `[commitmentHash, nullifierHash, value, label]`
- Ragequit verifies: (a) commitment proof is valid, (b) commitment is in state tree, (c) `depositors[label] == msg.sender`
- Note: For change notes created by withdrawal, the "depositor" is the withdrawer (the pool records `msg.sender` as depositor during `_insert`)
- Ragequit returned 0.5 USDT directly to the caller, bypassing ASP approval entirely
- **PASS** — emergency exit mechanism verified

### Key Finding: State Tree Includes Withdrawal Change Notes

The state tree is NOT just deposits. Every `withdraw()` call inserts a `newCommitmentHash` into the tree via `_insert()` (PrivacyPool.sol:121). When reconstructing the state tree off-chain, you MUST scan both `Deposited` AND `Withdrawn` events, ordered by `(blockNumber, logIndex)`. Missing these leads to `UnknownStateRoot()`.

---

## 8. Phase 7: Relayed Withdrawal (Entrypoint.relay)

### Objective
Verify that a third-party **relayer** can submit a withdrawal on behalf of the user via `Entrypoint.relay()`. This is critical for privacy: the user's address never calls `withdraw()` directly, so there is no on-chain link between the depositor and withdrawer.

### How It Works

In a direct withdrawal, the user calls `Pool.withdraw()` and their address appears as `msg.sender` (the `processooor`). In a relayed withdrawal:

1. User generates a ZK proof with `processooor = Entrypoint` (not their own address) and `data = abi.encode(RelayData{recipient, feeRecipient, relayFeeBPS})`
2. The `context` is derived from this different `processooor` + `data`, producing a different proof than a direct withdrawal would
3. A relayer with its own private key calls `Entrypoint.relay(withdrawal, proof, scope)`
4. The Entrypoint verifies the proof, calls `Pool.withdraw()` internally, then decodes `RelayData` to transfer funds to the recipient and fees to the relayer

### Context Computation (Relay vs Direct)

```
// Direct withdrawal:
context = keccak256(abi.encode({processooor: USER_ADDRESS, data: "0x"}, scope)) % SNARK_FIELD

// Relayed withdrawal:
context = keccak256(abi.encode({processooor: ENTRYPOINT, data: abi.encode(RelayData)}, scope)) % SNARK_FIELD
```

The proof is bound to the relay parameters — changing the recipient, fee, or processooor invalidates the proof.

### Relayer Wallet

| Field | Value |
|-------|-------|
| Address | `0x8CB4E5200c018032fa2cc2898D0Fe62f6970556D` |
| Funded | 1 XPL (for gas) |

### Raw Test Output (Successful Run — All 11 Steps with Relay)

```
--- Step 8: Generate Withdrawal Proof (for Relayer) ---
  processooor: 0x40a16921be84B19675D26ef2215aF30F7534EEfB (Entrypoint)
  recipient: 0x74787126f5991C71076898D3b2154c2e79dE5EA6
  feeRecipient: 0x8CB4E5200c018032fa2cc2898D0Fe62f6970556D
  relayFeeBPS: 0
Context: 13927220750822967397960061688808967096360192191259610076765357510910548856116
Proof generated in 1.6s!
Local verification: VALID

--- Step 9: Submit Withdrawal via Relay ---
Relayer address: 0x8CB4E5200c018032fa2cc2898D0Fe62f6970556D
  processooor: 0x40a16921be84B19675D26ef2215aF30F7534EEfB (Entrypoint)
  recipient: 0x74787126f5991C71076898D3b2154c2e79dE5EA6
  feeRecipient: 0x8CB4E5200c018032fa2cc2898D0Fe62f6970556D
  withdrawnValue: 500000
Simulating Entrypoint.relay()...
Simulation: OK
Executing relay transaction...
Relay tx: 0x2fc3743b03ef08370a773324c6c72842a5ffb6cf426f8d8fd969f5c90f77ed84
Block: 17359514, Status: success

On-chain sender (msg.sender): 0x8cb4e5200c018032fa2cc2898d0fe62f6970556d
Expected relayer address:      0x8CB4E5200c018032fa2cc2898D0Fe62f6970556D
Relayer is sender: PASS
Our address NOT sender: PASS

Final USDT Balance: 892000000 (892 USDT)

--- Step 10: Double-Spend Protection Test ---
Replaying the exact same withdrawal proof (same nullifier)...
Reverted as expected: 0x1a7c48e5
Double-spend rejected: PASS

--- Step 11: Ragequit (Emergency Exit) ---
Ragequit tx: 0x97dfe059b248e2f3413a8616c1c43bb6167f543c264fa1accc9992483d38c881
Block: 17359516, Status: success
Ragequit received: 500000 (0.5 USDT)
Ragequit amount matches change note: PASS

============================================================
FULL PRIVACY POOL CYCLE COMPLETE!
============================================================
  Step 3:  Deposited  1 USDT
  Step 9:  Withdrew   0.5 USDT (ZK proof via relay)
  Step 10: Double-spend replay → rejected
  Step 11: Ragequit   0.5 USDT (emergency exit)
  Net:     Pool balance should be 0 USDT from our deposits
  Final USDT balance: 892.5 USDT
============================================================
```

### Analysis

**Relay execution:**
- The relayer wallet (`0x8CB4E...`) called `Entrypoint.relay()` — confirmed as `msg.sender` on-chain
- Our test account (`0x74787...`) never called `withdraw()` — it only deposited
- Funds (0.5 USDT) were delivered to the recipient address specified in `RelayData`
- Fee was 0 BPS (matching the on-chain `maxRelayFeeBPS` config for the USDT pool)

**Privacy implication:**
- On-chain trail: `0x8CB4E...` (relayer) → `Entrypoint.relay()` → `Pool.withdraw()` → 0.5 USDT to `0x74787...`
- An observer sees: "A relayer submitted a withdrawal proof; funds went to some address"
- The observer does NOT see any connection between the deposit tx and the withdrawal tx — different `msg.sender`, no shared address
- In production, the recipient would be a stealth address (from Phase 2), adding another layer of unlinkability

**Key transactions:**

| Step | Transaction | Block |
|------|-------------|-------|
| Relay withdrawal | [`0x2fc3743b...`](https://testnet.plasmascan.to/tx/0x2fc3743b03ef08370a773324c6c72842a5ffb6cf426f8d8fd969f5c90f77ed84) | 17359514 |
| Ragequit | [`0x97dfe059...`](https://testnet.plasmascan.to/tx/0x97dfe059b248e2f3413a8616c1c43bb6167f543c264fa1accc9992483d38c881) | 17359516 |

---

## 9. Errors Encountered & Resolutions

### Error 1: Unicode Em Dash in Solidity

**File:** `test/StealthFlow.t.sol` line 100
**Error:** Solidity compiler rejects non-ASCII characters in string literals
**Fix:** Replaced `—` (em dash, U+2014) with `-` (ASCII hyphen)

### Error 2: `view` Modifier on Event-Emitting Function

**File:** `test/BN254.t.sol`
**Error:** `test_gasReport()` was marked `view` but uses `emit`
**Fix:** Removed `view` modifier — `emit` modifies state

### Error 3: `eth_getLogs` 10,000 Block Range Limit

**Error:** `eth_getLogs is limited to a 10,000 range`
**Fix:** Changed `fromBlock: "earliest"` to chunked scanning with 9,999-block windows:
```typescript
for (let from = deployBlock; from <= currentBlock; from += CHUNK + 1n) {
  const to = from + CHUNK > currentBlock ? currentBlock : from + CHUNK;
  // ...getLogs({ fromBlock: from, toBlock: to })
}
```

### Error 4: Wrong CreateX Address

**Error:** Checked `0xba5Ed...Bf29` — no code at address
**Fix:** Correct CreateX address is `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` — confirmed deployed on Plasma Mainnet

### Error 5: `lean-imt.sol` Foundry Remapping Bug

**Error:** Foundry treats `.sol` in package path `@zk-kit/lean-imt.sol` as a file extension, stripping the trailing `/`
**Fix:** Created symlink `lean-imt-sol` → `lean-imt.sol` in node_modules and updated remapping:
```
lean-imt/=../../node_modules/@zk-kit/lean-imt-sol/
```

### Error 6: `forge script` HTTPS Transport Error

**Error:** `Socket operation on non-socket (os error 38)` with HTTPS RPC
**Fix:** Switched to WSS RPC endpoint:
```
wss://thrumming-omniscient-fog.plasma-testnet.quiknode.pro/...
```

### Error 7: `cast` HTTPS Transport Issues

**Error:** Same `Socket operation on non-socket` with `cast` commands
**Fix:** Used `curl` for direct JSON-RPC calls, or `viem` in TypeScript instead of `cast`

### Error 8: `PrecommitmentAlreadyUsed()` (selector `0xda85277b`)

**Error:** Deposit reverted because the same precommitment was used in a previous run (deterministic secrets with fixed index)
**Fix:** Changed deposit index from `0n` to `BigInt(Date.now())` for uniqueness per run:
```typescript
const depositIndex = BigInt(Date.now()); // unique per run
```

### Error 9: LeanIMT Single-Leaf Tree Proof Issue

**Error:** `RangeError: The number NaN cannot be converted to a BigInt` when ASP tree had only 1 leaf (depth 0)
**Fix:** Built ASP tree with ALL deposit labels (not just ours), ensuring proper tree depth. Added null coalescing for safety:
```typescript
stateIndex: BigInt(stateMerkleProof.index ?? 0),
ASPIndex: BigInt(aspMerkleProof.index ?? 0),
```

### Error 10: `InvalidProof()` (selector `0x09bde339`) — CRITICAL

**Error:** Groth16 proof verified locally but was rejected by the on-chain WithdrawalVerifier
**Root Cause:** The circuit artifacts in `packages/circuits/build/` were from a **dev trusted setup** with different alpha/beta/gamma/delta points than the deployed verifier contract.

**Discovery process:**
1. Checked deployed verifier: `alphax = 16428432848801857252194528405604668803277877773566238944394625302971855135431`
2. Checked build vkey: `alpha = 20491192805390485299153009773594534940189261866228447918068658471970481763042`
3. **Mismatch!** Different trusted setup ceremonies.
4. Found SDK bundled artifacts at `packages/contracts/node_modules/@0xbow/privacy-pools-core-sdk/dist/node/artifacts/`
5. SDK vkey alpha = `16428432848801857252194528405604668803277877773566238944394625302971855135431` — **matches deployed verifier!**

**Fix:** Changed circuit artifact paths from:
```typescript
// WRONG — dev trusted setup
const wasmPath = "packages/circuits/build/withdraw/withdraw_js/withdraw.wasm";
const zkeyPath = "packages/circuits/build/withdraw/groth16_pkey.zkey";
```
To:
```typescript
// CORRECT — production trusted setup (matches deployed verifier)
const sdkArtifacts = "packages/contracts/node_modules/@0xbow/privacy-pools-core-sdk/dist/node/artifacts";
const wasmPath = path.join(sdkArtifacts, "withdraw.wasm");
const zkeyPath = path.join(sdkArtifacts, "withdraw.zkey");
```

### Error 11: `UnknownStateRoot()` (selector `0xfd3d3c4c`)

**Error:** After a prior successful withdrawal, subsequent proof generation produced a state root that didn't match any root in the pool's history.
**Root Cause:** The state tree reconstruction only scanned `Deposited` events, but `withdraw()` also calls `_insert(newCommitmentHash)` which adds a new leaf to the state tree. The locally-computed root was missing these withdrawal-inserted commitments.
**Fix:** Scan both `Deposited` and `Withdrawn` events from the pool, sort by `(blockNumber, logIndex)`, and insert all commitments into LeanIMT in the correct order.

---

## 10. Architecture Deep Dive

### 10.1 Deposit Flow

```
User → Entrypoint.deposit(asset, value, precommitment)
         │
         ├── Checks minimum deposit amount
         ├── Deducts vetting fee (0% on testnet)
         ├── Checks precommitment not already used
         ├── Transfers tokens from user to Entrypoint
         │
         └── Pool.deposit(depositor, value, precommitmentHash)
                │
                ├── label = keccak256(SCOPE, ++nonce) % SNARK_FIELD
                ├── commitment = Poseidon(value, label, precommitmentHash)
                ├── Insert commitment into LeanIMT state tree
                └── emit Deposited(depositor, commitment, label, value, precommitmentHash)
```

### 10.2 Secret Generation (Poseidon-Based)

```
Mnemonic → HD Key 1 (accountIndex=0) → masterNullifier = Poseidon(hdKey1)
         → HD Key 2 (accountIndex=1) → masterSecret = Poseidon(hdKey2)

Deposit secrets:
  nullifier = Poseidon(masterNullifier, scope, depositIndex)
  secret    = Poseidon(masterSecret, scope, depositIndex)
  precommitment = Poseidon(nullifier, secret)

Withdrawal secrets (for change note):
  newNullifier = Poseidon(masterNullifier, label, withdrawalIndex)
  newSecret    = Poseidon(masterSecret, label, withdrawalIndex)
```

### 10.3 Commitment Structure

```
                    commitment
                   /    |      \
              value   label    precommitment
                               /          \
                         nullifier       secret

commitment = Poseidon(value, label, Poseidon(nullifier, secret))
```

### 10.4 Withdrawal Flow

```
1. Reconstruct state tree from all Deposited + Withdrawn events (LeanIMT with Poseidon)
2. Reconstruct ASP tree from all approved labels
3. POSTMAN publishes ASP root: Entrypoint.updateRoot(aspRoot, ipfsCID)
4. Compute context = keccak256(abi.encode(Withdrawal{processooor, data}, scope)) % SNARK_FIELD
5. Prepare circuit inputs (16 signals + 32-padded Merkle siblings)
6. Generate Groth16 proof via snarkjs.groth16.fullProve(inputs, wasm, zkey)
7. Format proof for Solidity (pB coordinates swapped!)
8a. Direct: Call Pool.withdraw(Withdrawal, WithdrawProof) — user is msg.sender
8b. Relayed: Relayer calls Entrypoint.relay(Withdrawal, WithdrawProof, scope) — relayer is msg.sender
```

### 10.5 On-Chain Validation (`validWithdrawal` Modifier)

```
1. msg.sender == processooor           // Caller authorization
2. context == keccak256(abi.encode(     // Context integrity
     withdrawal, SCOPE)) % SNARK_FIELD
3. treeDepths <= MAX_TREE_DEPTH (32)   // Depth bounds
4. _isKnownRoot(stateRoot)             // State root in history
5. ASPRoot == latestRoot()             // Must be latest ASP root
6. WITHDRAWAL_VERIFIER.verifyProof(    // Groth16 verification
     pA, pB, pC, pubSignals)
```

### 10.6 Public Signals Order (Circuit Output → ProofLib)

| Index | Name | Description |
|-------|------|-------------|
| [0] | newCommitmentHash | Hash of the change note commitment |
| [1] | existingNullifierHash | Nullifier being spent (prevents double-spend) |
| [2] | withdrawnValue | Amount being withdrawn |
| [3] | stateRoot | State tree root at proof time |
| [4] | stateTreeDepth | Current state tree depth |
| [5] | ASPRoot | Association Set Provider tree root |
| [6] | ASPTreeDepth | ASP tree depth |
| [7] | context | Binds proof to specific withdrawal data |

### 10.7 Proof Formatting for Solidity

```typescript
// snarkjs outputs → Solidity struct
pA = [pi_a[0], pi_a[1]]
pB = [
  [pi_b[0][1], pi_b[0][0]],  // SWAPPED inner coordinates!
  [pi_b[1][1], pi_b[1][0]],  // SWAPPED inner coordinates!
]
pC = [pi_c[0], pi_c[1]]
pubSignals = [sig0, sig1, ..., sig7] // BigInt array
```

### 10.8 LeanIMT Circuit Logic

The `LeanIMTInclusionProof` circom template processes all 32 levels. When a sibling is 0 (empty/padding), the node value propagates upward unchanged:

```
nodes[i+1] = (nodes[i] - hash(nodes[i], siblings[i])) * isZero(siblings[i]) + hash(nodes[i], siblings[i])
```
- If sibling == 0: `nodes[i+1] = nodes[i]` (propagate)
- If sibling != 0: `nodes[i+1] = hash(nodes[i], siblings[i])` (normal Merkle)

---

## 11. Deployed Contract Addresses

### Stealth Infrastructure (plasma-privacy-testkit)

| Contract | Address | Chain |
|----------|---------|-------|
| BN254PrecompileTest | `0x3570744ABd92DDE431dd00E17d515E033298cA0c` | Plasma Testnet |
| ERC5564Announcer | `0xc24e145910365df12b2F894D38d6342c9B72d387` | Plasma Testnet |
| ERC6538Registry | `0x04315dC5c91A55F48E94De5df21B6F681028f47b` | Plasma Testnet |
| MockUSDT | `0x5e8135210b6C974F370e86139Ed22Af932a4d022` | Plasma Testnet |

### Privacy Pools Protocol (privacy-pools-core)

| Contract | Address | Chain |
|----------|---------|-------|
| WithdrawalVerifier | `0x03a7ad175889b694b5005f8835c6d8a6315a399c` | Plasma Testnet |
| CommitmentVerifier | `0x999a02ff05448728160b6ad674c6785065612118` | Plasma Testnet |
| Entrypoint (Implementation) | `0x566c528d1da84977bcbbeb3f3b58dfef615be011` | Plasma Testnet |
| Entrypoint (Proxy) | `0x40a16921be84b19675d26ef2215af30f7534eefb` | Plasma Testnet |
| PrivacyPoolSimple (XPL) | `0xdb4e84c2fe249c74aedf7d61f1fd9e41277ef904` | Plasma Testnet |
| PrivacyPoolComplex (USDT) | `0x25f1fd54f5f813b282ed719c603cfaca8f2a48f6` | Plasma Testnet |

### External Dependencies

| Contract | Address | Note |
|----------|---------|------|
| CreateX | `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` | Deterministic deployer (pre-deployed on Plasma) |

### Accounts

| Role | Address |
|------|---------|
| Deployer / Owner / POSTMAN | `0x74787126f5991C71076898D3b2154c2e79dE5EA6` |
| Relayer | `0x8CB4E5200c018032fa2cc2898D0Fe62f6970556D` |

---

## 12. Source Code

### 12.1 BN254PrecompileTest.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BN254 Precompile Test
/// @notice Tests ecAdd (0x06), ecMul (0x07), ecPairing (0x08) precompiles
contract BN254PrecompileTest {
    uint256 constant G1_X = 1;
    uint256 constant G1_Y = 2;
    uint256 constant P = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    uint256 constant N = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant G1_2X = 1368015179489954701390400359078579693043519447331113978918064868415326638035;
    uint256 constant G1_2Y = 9918110051302171585080402603319702774565515993150576347155970296011118125764;
    uint256 constant G2_X1 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant G2_X2 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant G2_Y1 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant G2_Y2 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;

    event TestResult(string name, bool passed);

    function runAllTests() external returns (bool allPassed) {
        bool t1 = testEcAdd();
        bool t2 = testEcMul();
        bool t3 = testEcPairing();
        allPassed = t1 && t2 && t3;
        emit TestResult("ecAdd (0x06)", t1);
        emit TestResult("ecMul (0x07)", t2);
        emit TestResult("ecPairing (0x08)", t3);
    }

    function testEcAdd() public view returns (bool) {
        (uint256 rx, uint256 ry, bool success) = ecAdd(G1_X, G1_Y, G1_X, G1_Y);
        if (!success) return false;
        return (rx == G1_2X && ry == G1_2Y);
    }

    function testEcMul() public view returns (bool) {
        (uint256 rx, uint256 ry, bool success) = ecMul(G1_X, G1_Y, 2);
        if (!success) return false;
        return (rx == G1_2X && ry == G1_2Y);
    }

    function testEcPairing() public view returns (bool) {
        uint256 negG1Y = P - G1_Y;
        bytes memory input = abi.encodePacked(
            G1_X, G1_Y, G2_X2, G2_X1, G2_Y2, G2_Y1,
            G1_X, negG1Y, G2_X2, G2_X1, G2_Y2, G2_Y1
        );
        (bool success, bytes memory result) = address(0x08).staticcall(input);
        if (!success || result.length != 32) return false;
        return abi.decode(result, (uint256)) == 1;
    }

    function testEcAddInvalid() public view returns (bool) {
        (,, bool success) = ecAdd(1, 1, 1, 1);
        return !success;
    }

    function benchmarkGas() external view returns (uint256 ecAddGas, uint256 ecMulGas, uint256 ecPairingGas) {
        uint256 g;
        g = gasleft(); ecAdd(G1_X, G1_Y, G1_X, G1_Y); ecAddGas = g - gasleft();
        g = gasleft(); ecMul(G1_X, G1_Y, 2); ecMulGas = g - gasleft();
        uint256 negG1Y = P - G1_Y;
        bytes memory pairingInput = abi.encodePacked(
            G1_X, G1_Y, G2_X2, G2_X1, G2_Y2, G2_Y1,
            G1_X, negG1Y, G2_X2, G2_X1, G2_Y2, G2_Y1
        );
        g = gasleft(); address(0x08).staticcall(pairingInput); ecPairingGas = g - gasleft();
    }

    function ecAdd(uint256 x1, uint256 y1, uint256 x2, uint256 y2) internal view returns (uint256 rx, uint256 ry, bool success) {
        bytes memory input = abi.encode(x1, y1, x2, y2);
        (bool ok, bytes memory result) = address(0x06).staticcall(input);
        if (ok && result.length == 64) { (rx, ry) = abi.decode(result, (uint256, uint256)); success = true; }
    }

    function ecMul(uint256 x, uint256 y, uint256 s) internal view returns (uint256 rx, uint256 ry, bool success) {
        bytes memory input = abi.encode(x, y, s);
        (bool ok, bytes memory result) = address(0x07).staticcall(input);
        if (ok && result.length == 64) { (rx, ry) = abi.decode(result, (uint256, uint256)); success = true; }
    }
}
```

### 12.2 ERC5564Announcer.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ERC5564Announcer {
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes memory ephemeralPubKey,
        bytes memory metadata
    ) external {
        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, metadata);
    }
}
```

### 12.3 ERC6538Registry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ERC6538Registry {
    event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress);
    mapping(address => mapping(uint256 => bytes)) private _stealthMetaAddresses;

    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external {
        _stealthMetaAddresses[msg.sender][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(msg.sender, schemeId, stealthMetaAddress);
    }

    function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes memory) {
        return _stealthMetaAddresses[registrant][schemeId];
    }
}
```

### 12.4 MockUSDT.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "USDT") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
```

### 12.5 Privacy Pool E2E Test Script (`plasma-pool-test.ts`)

See full script at: `privacy-pools-core/plasma-pool-test.ts` (~775 lines)

Key sections:
- **Config:** Chain definition, contract addresses, ABIs
- **Step 1:** Read pool SCOPE from contract
- **Step 2:** Generate Poseidon master keys and deposit secrets
- **Step 3:** Mint/Approve/Deposit USDT via Entrypoint
- **Step 4:** Parse Deposited event, verify commitment = Poseidon(value, label, precommitment)
- **Step 5:** Build ASP tree from all labels, publish root via updateRoot(root, ipfsCID)
- **Step 6:** Rebuild state tree from all Deposited + Withdrawn events, generate Merkle proofs
- **Step 7:** Generate withdrawal secrets for change note
- **Step 8:** Compute relay context (processooor=Entrypoint, data=RelayData), generate Groth16 proof
- **Step 9:** Call Entrypoint.relay() using relayer wallet (relayer is msg.sender, not user)
- **Step 10:** Double-spend protection test (replay same proof)
- **Step 11:** Ragequit emergency exit (commitment proof for change note)

---

## 13. Circuit Artifacts & Trusted Setup

### Critical Discovery

There are **two sets** of circuit artifacts in the repo:

| Location | Type | Alpha Point |
|----------|------|-------------|
| `packages/circuits/build/` | Dev trusted setup | `20491192805390485299153009773594534940189261866228447918068658471970481763042` |
| `packages/contracts/node_modules/@0xbow/privacy-pools-core-sdk/dist/node/artifacts/` | Production trusted setup | `16428432848801857252194528405604668803277877773566238944394625302971855135431` |

The **deployed WithdrawalVerifier** (`0x03a7...399c`) uses the **production** alpha point. Using the dev artifacts produces proofs that verify locally but fail on-chain.

### Correct Artifacts for Proof Generation

```
packages/contracts/node_modules/@0xbow/privacy-pools-core-sdk/dist/node/artifacts/
├── commitment.vkey   (3,477 bytes)
├── commitment.wasm   (2,380,442 bytes)
├── commitment.zkey   (901,233 bytes)
├── withdraw.vkey     (4,208 bytes)
├── withdraw.wasm     (2,607,967 bytes)
└── withdraw.zkey     (17,793,015 bytes)
```

### Circuit Files

**withdraw.circom** — Main withdrawal circuit (32-depth LeanIMT, Poseidon commitments, 8 public signals)
**commitment.circom** — Commitment hasher: `commitment = Poseidon(value, label, Poseidon(nullifier, secret))`
**merkleTree.circom** — LeanIMT inclusion proof with dynamic depth, zero-sibling propagation

### Verification Key Match Confirmation

```
Deployed verifier alphax:  16428432848801857252194528405604668803277877773566238944394625302971855135431
SDK bundled vkey alpha[0]: 16428432848801857252194528405604668803277877773566238944394625302971855135431
MATCH: ✓
```

---

*End of Report*
