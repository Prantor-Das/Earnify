import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as StellarSdk from "@stellar/stellar-sdk";

type TxResult = {
  txHash: string;
  result: unknown;
};

const horizonUrl =
  process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const sorobanRpcUrl =
  process.env.STELLAR_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const networkPassphrase =
  process.env.STELLAR_NETWORK_PASSPHRASE ?? StellarSdk.Networks.TESTNET;
const adminSecret = process.env.STELLAR_ADMIN_SECRET;
const configuredWasmPath =
  process.env.SOROBAN_WASM_PATH ??
  "contracts/earnify-campaign/target/wasm32v1-none/release/earnify_campaign.optimized.wasm";

const serviceDir = dirname(fileURLToPath(import.meta.url));
const repoRootDir = resolve(serviceDir, "../../../../");
const contractDir = join(repoRootDir, "contracts/earnify-campaign");

class SorobanConfigError extends Error {
  readonly status = 503;
  readonly code = "SOROBAN_CONFIG_ERROR";
}

function normalizeCandidatePath(pathValue: string) {
  if (isAbsolute(pathValue)) {
    return pathValue;
  }

  const fromCwd = resolve(process.cwd(), pathValue);
  if (existsSync(fromCwd)) {
    return fromCwd;
  }

  return resolve(repoRootDir, pathValue);
}

function getWasmCandidates() {
  const normalizedConfiguredPath = normalizeCandidatePath(configuredWasmPath);
  const filename =
    configuredWasmPath.split("/").pop() ?? "earnify_campaign.optimized.wasm";

  return [
    normalizedConfiguredPath,
    join(
      contractDir,
      "target/wasm32v1-none/release/earnify_campaign.optimized.wasm",
    ),
    join(contractDir, "target/wasm32v1-none/release/earnify_campaign.wasm"),
    join(
      contractDir,
      "target/wasm32-unknown-unknown/release/earnify_campaign.optimized.wasm",
    ),
    join(
      contractDir,
      "target/wasm32-unknown-unknown/release/earnify_campaign.wasm",
    ),
    // Last resort: keep original filename under canonical v1 target dir
    join(contractDir, "target/wasm32v1-none/release", filename),
  ];
}

async function ensureContractWasmPath() {
  for (const candidate of getWasmCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new SorobanConfigError(
    "Soroban contract WASM was not found on the API server. Build the contract during deployment or set SOROBAN_WASM_PATH to a bundled .wasm file.",
  );
}

const sdk = StellarSdk as unknown as {
  Horizon: { Server: new (url: string) => any };
  SorobanRpc?: {
    Server: new (url: string, options?: { allowHttp?: boolean }) => any;
    Api: {
      isSimulationError: (value: unknown) => boolean;
      isSimulationRestore: (value: unknown) => boolean;
      isSimulationSuccess: (value: unknown) => boolean;
      isGetTransactionPending: (value: unknown) => boolean;
    };
    assembleTransaction: (tx: any, simulation: unknown) => any;
  };
  rpc?: {
    Server: new (url: string, options?: { allowHttp?: boolean }) => any;
    Api: {
      isSimulationError: (value: unknown) => boolean;
      isSimulationRestore: (value: unknown) => boolean;
      isSimulationSuccess: (value: unknown) => boolean;
      isGetTransactionPending: (value: unknown) => boolean;
    };
    assembleTransaction: (tx: any, simulation: unknown) => any;
  };
  Contract: new (contractId: string) => {
    call: (method: string, ...args: unknown[]) => any;
  };
  Asset: { native: () => unknown };
  Keypair: { fromSecret: (secret: string) => any };
  Operation: {
    createCustomContract: (input: {
      wasmHash: Buffer;
      address: { toScAddress: () => unknown };
      salt: Buffer;
      constructorArgs?: unknown[];
      source?: string;
    }) => any;
    payment: (input: {
      destination: string;
      asset: unknown;
      amount: string;
    }) => any;
    uploadContractWasm: (input: { wasm: Buffer; source?: string }) => any;
  };
  Address: {
    fromScVal: (value: any) => { toString: () => string };
    fromString: (address: string) => { toScAddress: () => unknown };
  };
  TransactionBuilder: new (
    source: any,
    opts: { fee: string; networkPassphrase: string },
  ) => {
    addOperation: (op: any) => any;
    setTimeout: (seconds: number) => any;
    build: () => any;
  };
  nativeToScVal: (value: unknown, opts?: { type?: string }) => unknown;
  scValToNative: (value: unknown) => unknown;
  xdr: {
    TransactionMeta: {
      fromXDR: (xdr: string, format: "base64") => any;
    };
  };
};

const horizon = new sdk.Horizon.Server(horizonUrl);
const sorobanNamespace = sdk.SorobanRpc ?? sdk.rpc;
if (!sorobanNamespace) {
  throw new Error("Soroban RPC namespace not found in @stellar/stellar-sdk");
}
// sorobanNamespace is guaranteed non-null from here — the throw above ensures it.
const rpcNs = sorobanNamespace;
const sorobanRpc = new rpcNs.Server(sorobanRpcUrl, {
  allowHttp: sorobanRpcUrl.startsWith("http://"),
});

function requireAdminSecret() {
  if (!adminSecret) {
    throw new SorobanConfigError("STELLAR_ADMIN_SECRET is not configured");
  }

  return adminSecret;
}

function toStroops(amountXLM: number): bigint {
  return BigInt(Math.round(amountXLM * 10_000_000));
}

function fromStroops(value: bigint | number | string): number {
  const stroops = typeof value === "bigint" ? value : BigInt(value);
  return Number(stroops) / 10_000_000;
}

async function withSorobanInvocation(params: {
  campaignContractId: string;
  method: string;
  sourceSecret: string;
  args: unknown[];
}): Promise<TxResult> {
  const sourceKeypair = sdk.Keypair.fromSecret(params.sourceSecret);
  const sourceAccount = await horizon.loadAccount(sourceKeypair.publicKey());
  const contract = new sdk.Contract(params.campaignContractId);

  const tx = new sdk.TransactionBuilder(sourceAccount, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(contract.call(params.method, ...params.args))
    .setTimeout(30)
    .build();

  const simulation = await sorobanRpc.simulateTransaction(tx);
  if (rpcNs.Api.isSimulationError(simulation)) {
    throw new Error(`Simulation failed for ${params.method}`);
  }

  const assembled = rpcNs.assembleTransaction(tx, simulation).build();
  assembled.sign(sourceKeypair);

  const submission = await sorobanRpc.sendTransaction(assembled);
  const txHash = submission.hash as string;

  if (!txHash) {
    throw new Error("Soroban transaction submission did not return a hash");
  }

  const started = Date.now();

  while (Date.now() - started < 30_000) {
    let status: { status: string; [key: string]: unknown };
    try {
      status = await sorobanRpc.getTransaction(txHash);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Bad union switch")
      ) {
        // Some SDK/RPC combos can fail to parse newer union variants from
        // getTransaction. Keep the tx hash as best-effort success so callers
        // can continue without treating this as a hard failure.
        return {
          txHash,
          result: { status: "UNKNOWN_PARSER_FALLBACK" },
        };
      }
      throw error;
    }

    if (status.status === "SUCCESS") {
      return {
        txHash,
        result: status,
      };
    }

    if (status.status === "FAILED") {
      throw new Error(`Soroban transaction ${txHash} failed`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  throw new Error(`Timed out waiting for Soroban transaction ${txHash}`);
}

async function invokeReadonly(params: {
  campaignContractId: string;
  method: string;
  args: unknown[];
}): Promise<unknown> {
  const sourceSecret = requireAdminSecret();
  const sourceKeypair = sdk.Keypair.fromSecret(sourceSecret);
  const sourceAccount = await horizon.loadAccount(sourceKeypair.publicKey());
  const contract = new sdk.Contract(params.campaignContractId);

  const tx = new sdk.TransactionBuilder(sourceAccount, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(contract.call(params.method, ...params.args))
    .setTimeout(30)
    .build();

  const simulation = await sorobanRpc.simulateTransaction(tx);
  if (!rpcNs.Api.isSimulationSuccess(simulation)) {
    throw new Error(`Simulation failed for readonly call ${params.method}`);
  }

  const retval = simulation.result?.retval;
  return retval ? sdk.scValToNative(retval) : null;
}

function parseTransferAmountFromMeta(
  metaBase64: string | undefined,
  creatorPublicKey: string,
): number | null {
  if (!metaBase64) {
    return null;
  }

  try {
    const txMeta = sdk.xdr.TransactionMeta.fromXDR(metaBase64, "base64");
    const sorobanMeta = txMeta.v3().sorobanMeta();
    const events = sorobanMeta?.events() ?? [];

    for (const event of events) {
      const body = event.event().body();
      if (body.switch().name !== "contract") {
        continue;
      }

      const contractData = body.v0();
      const topics = contractData.topics();
      if (topics.length() < 3) {
        continue;
      }

      const eventName = String(sdk.scValToNative(topics.get(0)));
      const toAddress = String(sdk.scValToNative(topics.get(2)));
      if (eventName !== "transfer" || toAddress !== creatorPublicKey) {
        continue;
      }

      const amount = sdk.scValToNative(contractData.data()) as bigint;
      return fromStroops(amount);
    }
  } catch {
    return null;
  }

  return null;
}

async function fundAdminIfNeeded(secret: string) {
  const sourceKeypair = sdk.Keypair.fromSecret(secret);
  const publicKey = sourceKeypair.publicKey();

  const account = await horizon.loadAccount(publicKey);
  const nativeBalance = Number(
    account.balances.find(
      (balance: { asset_type: string; balance: string }) =>
        balance.asset_type === "native",
    )?.balance ?? "0",
  );

  if (nativeBalance >= 100) {
    return;
  }

  const response = await fetch(
    `https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`,
  );
  if (!response.ok) {
    throw new Error("Unable to fund Stellar admin account via Friendbot");
  }
}

async function submitClassicPayment(
  sourceSecret: string,
  destination: string,
  amountXLM: number,
): Promise<string> {
  const sourceKeypair = sdk.Keypair.fromSecret(sourceSecret);
  const sourceAccount = await horizon.loadAccount(sourceKeypair.publicKey());

  const transaction = new sdk.TransactionBuilder(sourceAccount, {
    fee: String(await horizon.fetchBaseFee()),
    networkPassphrase,
  })
    .addOperation(
      sdk.Operation.payment({
        destination,
        asset: sdk.Asset.native(),
        amount: amountXLM.toFixed(7),
      }),
    )
    .setTimeout(30)
    .build();

  transaction.sign(sourceKeypair);
  const result = await horizon.submitTransaction(transaction);
  return result.hash as string;
}

async function submitSorobanOperation(params: {
  sourceSecret: string;
  operation: any;
  timeoutSeconds?: number;
}) {
  const sourceKeypair = sdk.Keypair.fromSecret(params.sourceSecret);
  const sourceAccount = await horizon.loadAccount(sourceKeypair.publicKey());

  const tx = new sdk.TransactionBuilder(sourceAccount, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(params.operation)
    .setTimeout(params.timeoutSeconds ?? 60)
    .build();

  const simulation = await sorobanRpc.simulateTransaction(tx);
  if (rpcNs.Api.isSimulationError(simulation)) {
    throw new Error(JSON.stringify(simulation, null, 2).slice(0, 500));
  }

  const returnValue = (simulation as { result?: { retval?: unknown } }).result
    ?.retval;
  const assembled = rpcNs.assembleTransaction(tx, simulation).build();
  assembled.sign(sourceKeypair);

  const submission = await sorobanRpc.sendTransaction(assembled);
  const txHash = submission.hash as string;

  if (!txHash) {
    throw new Error("Soroban transaction submission did not return a hash");
  }

  const started = Date.now();
  while (Date.now() - started < 30_000) {
    let status: { status: string; [key: string]: unknown };
    try {
      status = await sorobanRpc.getTransaction(txHash);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Bad union switch")
      ) {
        return {
          txHash,
          returnValue,
          result: { status: "UNKNOWN_PARSER_FALLBACK" },
        };
      }

      throw error;
    }

    if (status.status === "SUCCESS") {
      return {
        txHash,
        returnValue,
        result: status,
      };
    }

    if (status.status === "FAILED") {
      throw new Error(
        `Soroban transaction failed with status ${status.status}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  throw new Error("Timed out waiting for Soroban transaction confirmation");
}

async function deployContractWithSdk(admin: string, wasmPath: string) {
  const wasm = readFileSync(wasmPath);
  const wasmHash = createHash("sha256").update(wasm).digest();
  const adminPublicKey = sdk.Keypair.fromSecret(admin).publicKey();
  const adminAddress = sdk.Address.fromString(adminPublicKey);

  const upload = await submitSorobanOperation({
    sourceSecret: admin,
    operation: sdk.Operation.uploadContractWasm({
      wasm,
      source: adminPublicKey,
    }),
  });

  const deployment = await submitSorobanOperation({
    sourceSecret: admin,
    operation: sdk.Operation.createCustomContract({
      wasmHash,
      address: adminAddress,
      salt: randomBytes(32),
      source: adminPublicKey,
    }),
  });

  if (!deployment.returnValue) {
    throw new Error("Contract deployment did not return a contract address");
  }

  return {
    contractId: sdk.Address.fromScVal(deployment.returnValue).toString(),
    deploymentTxHash: deployment.txHash,
    uploadTxHash: upload.txHash,
  };
}

async function deployCampaignContract(
  founderSecret: string,
  totalBudgetXLM: number,
): Promise<{ contractId: string; txHash: string }> {
  if (totalBudgetXLM <= 0) {
    throw new Error("totalBudgetXLM must be a positive number");
  }

  const admin = requireAdminSecret();
  await fundAdminIfNeeded(admin);
  const resolvedWasmPath = await ensureContractWasmPath();
  const { contractId } = await deployContractWithSdk(admin, resolvedWasmPath);
  const founderKeypair = sdk.Keypair.fromSecret(founderSecret);
  const adminPublicKey = sdk.Keypair.fromSecret(admin).publicKey();

  const initialize = await withSorobanInvocation({
    campaignContractId: contractId,
    method: "initialize",
    sourceSecret: founderSecret,
    args: [
      sdk.nativeToScVal(founderKeypair.publicKey(), { type: "address" }),
      sdk.nativeToScVal(adminPublicKey, { type: "address" }),
      sdk.nativeToScVal(toStroops(totalBudgetXLM), { type: "i128" }),
    ],
  });

  return {
    contractId,
    txHash: initialize.txHash,
  };
}

async function updateCreatorScore(
  campaignContractId: string,
  creatorPublicKey: string,
  newScore: number,
): Promise<{ txHash: string }> {
  const admin = requireAdminSecret();
  const adminPublicKey = sdk.Keypair.fromSecret(admin).publicKey();

  const tx = await withSorobanInvocation({
    campaignContractId,
    method: "update_score",
    sourceSecret: admin,
    args: [
      sdk.nativeToScVal(adminPublicKey, { type: "address" }),
      sdk.nativeToScVal(creatorPublicKey, { type: "address" }),
      sdk.nativeToScVal(BigInt(Math.trunc(newScore)), { type: "i128" }),
    ],
  });

  return { txHash: tx.txHash };
}

async function triggerCreatorPayout(
  campaignContractId: string,
  creatorSecret: string,
): Promise<{ txHash: string; amountXLM: number }> {
  const creatorPublicKey = sdk.Keypair.fromSecret(creatorSecret).publicKey();
  const payoutEstimateBefore = await getPayoutEstimate(
    campaignContractId,
    creatorPublicKey,
  );

  const tx = await withSorobanInvocation({
    campaignContractId,
    method: "claim_payout",
    sourceSecret: creatorSecret,
    args: [sdk.nativeToScVal(creatorPublicKey, { type: "address" })],
  });

  const status = tx.result as { resultMetaXdr?: string };
  const parsedAmount = parseTransferAmountFromMeta(
    status.resultMetaXdr,
    creatorPublicKey,
  );

  return {
    txHash: tx.txHash,
    amountXLM: parsedAmount ?? payoutEstimateBefore,
  };
}

async function endCampaign(
  campaignContractId: string,
  founderSecret: string,
): Promise<{ txHash: string }> {
  const founderPublicKey = sdk.Keypair.fromSecret(founderSecret).publicKey();

  const tx = await withSorobanInvocation({
    campaignContractId,
    method: "end_campaign",
    sourceSecret: founderSecret,
    args: [sdk.nativeToScVal(founderPublicKey, { type: "address" })],
  });

  return { txHash: tx.txHash };
}

async function getOnChainScore(
  campaignContractId: string,
  creatorPublicKey: string,
): Promise<number> {
  const result = await invokeReadonly({
    campaignContractId,
    method: "get_score",
    args: [sdk.nativeToScVal(creatorPublicKey, { type: "address" })],
  });

  return Number(result ?? 0);
}

async function getPayoutEstimate(
  campaignContractId: string,
  creatorPublicKey: string,
): Promise<number> {
  const result = await invokeReadonly({
    campaignContractId,
    method: "get_payout_estimate",
    args: [sdk.nativeToScVal(creatorPublicKey, { type: "address" })],
  });

  const normalized =
    typeof result === "bigint" ||
    typeof result === "number" ||
    typeof result === "string"
      ? result
      : 0;

  return fromStroops(BigInt(normalized));
}

async function getCampaignInfo(campaignContractId: string): Promise<{
  totalBudgetXLM: number;
  remainingBudgetXLM: number;
  status: string;
  creatorScores: Record<string, number>;
}> {
  const info = (await invokeReadonly({
    campaignContractId,
    method: "get_campaign_info",
    args: [],
  })) as [bigint, bigint, string] | null;

  const scores = (await invokeReadonly({
    campaignContractId,
    method: "get_all_scores",
    args: [],
  })) as unknown;

  const creatorScores: Record<string, number> = {};

  // Soroban SDK may decode maps as Map, array tuples, or plain objects.
  if (scores instanceof Map) {
    for (const [key, value] of scores.entries()) {
      creatorScores[String(key)] = Number(value);
    }
  } else if (Array.isArray(scores)) {
    for (const entry of scores) {
      if (Array.isArray(entry) && entry.length >= 2) {
        creatorScores[String(entry[0])] = Number(entry[1]);
      }
    }
  } else if (scores && typeof scores === "object") {
    for (const [key, value] of Object.entries(
      scores as Record<string, unknown>,
    )) {
      creatorScores[key] = Number(value);
    }
  }

  return {
    totalBudgetXLM: info ? fromStroops(info[0]) : 0,
    remainingBudgetXLM: info ? fromStroops(info[1]) : 0,
    status: info ? String(info[2]) : "UNKNOWN",
    creatorScores,
  };
}

async function getContractBalance(contractId: string): Promise<number> {
  const campaignInfo = await getCampaignInfo(contractId);
  return campaignInfo.remainingBudgetXLM;
}

// ---------------------------------------------------------------------------
// verifyCampaignFunded — checks on-chain remaining budget >= expectedBudget
// ---------------------------------------------------------------------------

async function verifyCampaignFunded(
  contractId: string,
  expectedBudgetStroops: bigint,
): Promise<boolean> {
  const attempts = 6;
  const waitMs = 1_500;

  for (let index = 0; index < attempts; index += 1) {
    try {
      const info = await getCampaignInfo(contractId);
      const remainingStroops = BigInt(
        Math.round(info.remainingBudgetXLM * 10_000_000),
      );
      if (remainingStroops >= expectedBudgetStroops) {
        return true;
      }
    } catch {
      // Retry below.
    }

    if (index < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// buildInitializeTx — deploys contract (if needed) and returns an unsigned
// initialize() XDR for the founder to sign with Freighter.
// ---------------------------------------------------------------------------

async function buildInitializeTx(params: {
  founderPublicKey: string;
  totalBudgetXLM: number;
  existingContractId?: string;
}): Promise<{
  contractId: string;
  xdr: string;
  networkPassphrase: string;
  deploymentTxHash: string | null;
  wasmUploadTxHash: string | null;
}> {
  const { founderPublicKey, totalBudgetXLM, existingContractId } = params;

  if (totalBudgetXLM <= 0) {
    throw new Error("totalBudgetXLM must be a positive number");
  }

  const admin = requireAdminSecret();
  await fundAdminIfNeeded(admin);
  const resolvedWasmPath = await ensureContractWasmPath();

  // Deploy a fresh contract if we don't have one yet
  let contractId = existingContractId;
  let deploymentTxHash: string | null = null;
  let wasmUploadTxHash: string | null = null;
  if (!contractId) {
    const deployment = await deployContractWithSdk(admin, resolvedWasmPath);
    contractId = deployment.contractId;
    deploymentTxHash = deployment.deploymentTxHash;
    wasmUploadTxHash = deployment.uploadTxHash;
  }

  // Build the initialize() invocation as an unsigned transaction
  // The founder will sign it with Freighter — their key authorises the call.
  const adminPublicKey = sdk.Keypair.fromSecret(admin).publicKey();
  const founderAccount = await horizon.loadAccount(founderPublicKey);
  const contract = new sdk.Contract(contractId);

  const tx = new sdk.TransactionBuilder(founderAccount, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        "initialize",
        sdk.nativeToScVal(founderPublicKey, { type: "address" }),
        sdk.nativeToScVal(adminPublicKey, { type: "address" }),
        sdk.nativeToScVal(toStroops(totalBudgetXLM), { type: "i128" }),
      ),
    )
    .setTimeout(60)
    .build();

  // Simulate to populate the auth + footprint so Freighter can sign it
  const simulation = await sorobanRpc.simulateTransaction(tx);
  if (rpcNs.Api.isSimulationError(simulation)) {
    throw new Error("Simulation of initialize() failed — check contract state");
  }

  const assembled = rpcNs.assembleTransaction(tx, simulation).build();
  const xdr = assembled.toEnvelope().toXDR("base64");

  return {
    contractId,
    xdr,
    networkPassphrase,
    deploymentTxHash,
    wasmUploadTxHash,
  };
}

async function buildEndCampaignTx(params: {
  founderPublicKey: string;
  campaignContractId: string;
}): Promise<{ xdr: string; networkPassphrase: string }> {
  const { founderPublicKey, campaignContractId } = params;

  const founderAccount = await horizon.loadAccount(founderPublicKey);
  const contract = new sdk.Contract(campaignContractId);

  const tx = new sdk.TransactionBuilder(founderAccount, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(
      contract.call(
        "end_campaign",
        sdk.nativeToScVal(founderPublicKey, { type: "address" }),
      ),
    )
    .setTimeout(60)
    .build();

  const simulation = await sorobanRpc.simulateTransaction(tx);
  if (rpcNs.Api.isSimulationError(simulation)) {
    const details = JSON.stringify(simulation, null, 2).slice(0, 500);
    throw new Error(
      `Unable to prepare end_campaign transaction with current on-chain state. ${details}`,
    );
  }

  const assembled = rpcNs.assembleTransaction(tx, simulation).build();
  const xdr = assembled.toEnvelope().toXDR("base64");

  return { xdr, networkPassphrase };
}

export {
  buildInitializeTx,
  buildEndCampaignTx,
  deployCampaignContract,
  endCampaign,
  getCampaignInfo,
  getContractBalance,
  getOnChainScore,
  getPayoutEstimate,
  SorobanConfigError,
  triggerCreatorPayout,
  updateCreatorScore,
  verifyCampaignFunded,
  submitClassicPayment,
};
