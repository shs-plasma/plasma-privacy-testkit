import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  parseEther,
  parseUnits,
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import {
  createPrivateNote,
  decodeMetaAddress,
  deriveStealthKeys,
  encodeMetaAddress,
  generateStealthAddress,
  scanAnnouncementsForReceiver,
  stealthPrivateKeyToAddress,
  summarizeNotes,
  transitionNote,
} from "../src/index.ts";

const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const ANVIL_PORT = 8547;
const ANVIL_RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const CHAIN = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC_URL] } },
});

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../..");

type Artifact = {
  abi: unknown[];
  bytecode: { object: `0x${string}` };
};

let anvilProcess: ChildProcessWithoutNullStreams | undefined;

before(async () => {
  const build = spawnSync("forge", ["build", "--quiet"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (build.status !== 0) {
    throw new Error(build.stderr || build.stdout || "forge build failed");
  }

  anvilProcess = spawn(
    "anvil",
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(ANVIL_PORT),
      "--chain-id",
      "31337",
      "--mnemonic",
      TEST_MNEMONIC,
    ],
    {
      cwd: repoRoot,
      stdio: "ignore",
    },
  );

  const client = createPublicClient({
    chain: CHAIN,
    transport: http(ANVIL_RPC_URL),
  });

  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        await client.getBlockNumber();
        return;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
      }
    }
  } catch (error) {
    anvilProcess.kill("SIGTERM");
    throw error;
  }

  anvilProcess.kill("SIGTERM");
  throw new Error("anvil did not start");
});

after(async () => {
  if (!anvilProcess) {
    return;
  }

  anvilProcess.kill("SIGTERM");
  await new Promise((resolvePromise) => {
    anvilProcess?.once("exit", () => resolvePromise(undefined));
    setTimeout(() => resolvePromise(undefined), 1000);
  });
});

async function loadArtifact(relativePath: string): Promise<Artifact> {
  const artifact = await readFile(resolve(repoRoot, relativePath), "utf8");
  return JSON.parse(artifact) as Artifact;
}

async function deployContract(
  walletClient: ReturnType<typeof createWalletClient>,
  publicClient: ReturnType<typeof createPublicClient>,
  artifactPath: string,
) {
  const artifact = await loadArtifact(artifactPath);
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error(`Contract deployment failed for ${artifactPath}`);
  }

  return {
    address: receipt.contractAddress,
    abi: artifact.abi,
  };
}

test("deploys local contracts and proves the real stealth key controls the funded address", async () => {
  const alice = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 0 });
  const sender = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 1 });
  const pool = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: 2 });

  const publicClient = createPublicClient({
    chain: CHAIN,
    transport: http(ANVIL_RPC_URL),
  });

  const aliceWallet = createWalletClient({
    account: alice,
    chain: CHAIN,
    transport: http(ANVIL_RPC_URL),
  });
  const senderWallet = createWalletClient({
    account: sender,
    chain: CHAIN,
    transport: http(ANVIL_RPC_URL),
  });

  const registry = await deployContract(
    aliceWallet,
    publicClient,
    "out/ERC6538Registry.sol/ERC6538Registry.json",
  );
  const announcer = await deployContract(
    aliceWallet,
    publicClient,
    "out/ERC5564Announcer.sol/ERC5564Announcer.json",
  );
  const usdt = await deployContract(
    aliceWallet,
    publicClient,
    "out/MockUSDT.sol/MockUSDT.json",
  );

  const announcerEvent = parseAbi([
    "event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)",
  ]);

  const stealthKeys = await deriveStealthKeys((message) =>
    aliceWallet.signMessage({ account: alice, message }),
  );
  const metaAddressHex = `0x${Buffer.from(encodeMetaAddress(stealthKeys)).toString("hex")}` as `0x${string}`;

  const registerTx = await aliceWallet.writeContract({
    address: registry.address,
    abi: registry.abi,
    functionName: "registerKeys",
    args: [1n, metaAddressHex],
  });
  await publicClient.waitForTransactionReceipt({ hash: registerTx });

  const storedMetaAddress = (await publicClient.readContract({
    address: registry.address,
    abi: registry.abi,
    functionName: "stealthMetaAddressOf",
    args: [alice.address, 1n],
  })) as `0x${string}`;
  const payment = generateStealthAddress(
    decodeMetaAddress(Buffer.from(storedMetaAddress.slice(2), "hex")),
  );

  const mintTx = await senderWallet.writeContract({
    address: usdt.address,
    abi: usdt.abi,
    functionName: "mint",
    args: [sender.address, parseUnits("1000", 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintTx });

  const transferTx = await senderWallet.writeContract({
    address: usdt.address,
    abi: usdt.abi,
    functionName: "transfer",
    args: [payment.stealthAddress, parseUnits("500", 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash: transferTx });

  const metadata = `0x${payment.viewTag.toString(16).padStart(2, "0")}` as `0x${string}`;
  const ephemeralPubKey = `0x${Buffer.from(payment.ephemeralPubKey).toString("hex")}` as `0x${string}`;

  const announceTx = await senderWallet.writeContract({
    address: announcer.address,
    abi: announcer.abi,
    functionName: "announce",
    args: [1n, payment.stealthAddress, ephemeralPubKey, metadata],
  });
  await publicClient.waitForTransactionReceipt({ hash: announceTx });

  const logs = await publicClient.getLogs({
    address: announcer.address,
    event: announcerEvent[0],
    fromBlock: 0n,
  });

  const scanResult = scanAnnouncementsForReceiver(
    logs.map((log) => ({
      schemeId: log.args.schemeId as bigint,
      stealthAddress: log.args.stealthAddress as string,
      ephemeralPubKey: log.args.ephemeralPubKey as string,
      metadata: log.args.metadata as string,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      caller: log.args.caller as string,
    })),
    stealthKeys,
  );

  assert.equal(scanResult.matches.length, 1);
  const match = scanResult.matches[0];
  assert.ok(match);
  assert.equal(match?.stealthAddress, payment.stealthAddress);
  assert.equal(
    stealthPrivateKeyToAddress(match!.stealthPrivateKey),
    payment.stealthAddress,
  );

  const stealthAccount = privateKeyToAccount(
    `0x${Buffer.from(match!.stealthPrivateKey).toString("hex")}` as `0x${string}`,
  );
  const stealthWallet = createWalletClient({
    account: stealthAccount,
    chain: CHAIN,
    transport: http(ANVIL_RPC_URL),
  });

  const fundGasTx = await aliceWallet.sendTransaction({
    account: alice,
    to: stealthAccount.address,
    value: parseEther("1"),
  });
  await publicClient.waitForTransactionReceipt({ hash: fundGasTx });

  let note = createPrivateNote({
    id: `${announceTx}:0`,
    token: usdt.address,
    amount: parseUnits("500", 6),
    stealthAddress: payment.stealthAddress,
    viewTag: payment.viewTag,
    ephemeralPubKey: payment.ephemeralPubKey,
    stealthPrivateKey: match!.stealthPrivateKey,
    announcementTxHash: announceTx,
    sourceTxHash: transferTx,
  });
  note = transitionNote(note, "queued");
  note = transitionNote(note, "shielding");
  note = transitionNote(note, "shielded");

  const sweepTx = await stealthWallet.writeContract({
    address: usdt.address,
    abi: usdt.abi,
    functionName: "transfer",
    args: [pool.address, parseUnits("500", 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash: sweepTx });

  note = transitionNote(note, "spent", { spendTxHash: sweepTx });

  const poolBalance = (await publicClient.readContract({
    address: usdt.address,
    abi: usdt.abi,
    functionName: "balanceOf",
    args: [pool.address],
  })) as bigint;
  const summary = summarizeNotes([note]);

  assert.equal(poolBalance, parseUnits("500", 6));
  assert.equal(summary.spentBalance, parseUnits("500", 6));
  assert.equal(summary.consolidatedShieldedBalance, 0n);
  assert.equal(scanResult.skipped.length, 0);
});
