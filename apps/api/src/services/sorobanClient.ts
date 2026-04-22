import { execFile } from "node:child_process";
import { promisify } from "node:util";

import * as StellarSdk from "@stellar/stellar-sdk";

type TxResult = {
  txHash: string;
  result: unknown;
};

const execFileAsync = promisify(execFile);

const networkName = process.env.STELLAR_NETWORK ?? "testnet";
const horizonUrl = process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const sorobanRpcUrl = process.env.STELLAR_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const networkPassphrase =
  process.env.STELLAR_NETWORK_PASSPHRASE ?? StellarSdk.Networks.TESTNET;
const adminSecret = process.env.STELLAR_ADMIN_SECRET;
const contractWasmPath =
  process.env.SOROBAN_WASM_PATH ??
  "contracts/earnify-campaign/target/wasm32-unknown-unknown/release/earnify_campaign.optimized.wasm";

const sdk = StellarSdk as unknown as {
  Horizon: { Server: new (url: string) => any };
  SorobanRpc: {
    Server: new (url: string, options?: { allowHttp?: boolean }) => any;
    Api: {
      isSimulationError: (value: unknown) => boolean;
      isSimulationRestore: (value: unknown) => boolean;
      isSimulationSuccess: (value: unknown) => boolean;
      isGetTransactionPending: (value: unknown) => boolean;
    };
    assembleTransaction: (tx: any, simulation: unknown) => any;
  };
  Contract: new (contractId: string) => { call: (method: string, ...args: unknown[]) => any };
  Asset: { native: () => unknown };
  Keypair: { fromSecret: (secret: string) => any };
  Operation: {
    payment: (input: { destination: string; asset: unknown; amount: string }) => any;
  };
  TransactionBuilder: new (
    source: any,
    opts: { fee: string; networkPassphrase: string }
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
const sorobanRpc = new sdk.SorobanRpc.Server(sorobanRpcUrl, {
  allowHttp: sorobanRpcUrl.startsWith("http://")
});

function requireAdminSecret() {
  if (!adminSecret) {
    throw new Error("STELLAR_ADMIN_SECRET is not configured");
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

function parseContractId(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = lines.reverse();
  const contractId = candidates.find((line) => /^C[A-Z0-9]{55}$/.test(line));

  if (!contractId) {
    throw new Error("Unable to parse deployed contract id from stellar CLI output");
  }

  return contractId;
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
    networkPassphrase
  })
    .addOperation(contract.call(params.method, ...params.args))
    .setTimeout(30)
    .build();

  const simulation = await sorobanRpc.simulateTransaction(tx);
  if (sdk.SorobanRpc.Api.isSimulationError(simulation)) {
    throw new Error(`Simulation failed for ${params.method}`);
  }

  const assembled = sdk.SorobanRpc.assembleTransaction(tx, simulation).build();
  assembled.sign(sourceKeypair);

  const submission = await sorobanRpc.sendTransaction(assembled);
  const txHash = submission.hash as string;

  if (!txHash) {
    throw new Error("Soroban transaction submission did not return a hash");
  }

  const started = Date.now();

  while (Date.now() - started < 30_000) {
    const status = await sorobanRpc.getTransaction(txHash);

    if (status.status === "SUCCESS") {
      return {
        txHash,
        result: status
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
    networkPassphrase
  })
    .addOperation(contract.call(params.method, ...params.args))
    .setTimeout(30)
    .build();

  const simulation = await sorobanRpc.simulateTransaction(tx);
  if (!sdk.SorobanRpc.Api.isSimulationSuccess(simulation)) {
    throw new Error(`Simulation failed for readonly call ${params.method}`);
  }

  const retval = simulation.result?.retval;
  return retval ? sdk.scValToNative(retval) : null;
}

function parseTransferAmountFromMeta(metaBase64: string | undefined, creatorPublicKey: string): number | null {
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
    account.balances.find((balance: { asset_type: string; balance: string }) => balance.asset_type === "native")
      ?.balance ?? "0"
  );

  if (nativeBalance >= 100) {
    return;
  }

  const response = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error("Unable to fund Stellar admin account via Friendbot");
  }
}

async function submitClassicPayment(sourceSecret: string, destination: string, amountXLM: number): Promise<string> {
  const sourceKeypair = sdk.Keypair.fromSecret(sourceSecret);
  const sourceAccount = await horizon.loadAccount(sourceKeypair.publicKey());

  const transaction = new sdk.TransactionBuilder(sourceAccount, {
    fee: String(await horizon.fetchBaseFee()),
    networkPassphrase
  })
    .addOperation(
      sdk.Operation.payment({
        destination,
        asset: sdk.Asset.native(),
        amount: amountXLM.toFixed(7)
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(sourceKeypair);
  const result = await horizon.submitTransaction(transaction);
  return result.hash as string;
}

async function deployCampaignContract(
  founderSecret: string,
  totalBudgetXLM: number
): Promise<{ contractId: string; txHash: string }> {
  if (totalBudgetXLM <= 0) {
    throw new Error("totalBudgetXLM must be a positive number");
  }

  const admin = requireAdminSecret();
  await fundAdminIfNeeded(admin);

  const { stdout } = await execFileAsync("stellar", [
    "contract",
    "deploy",
    "--wasm",
    contractWasmPath,
    "--source",
    admin,
    "--network",
    networkName
  ]);

  const contractId = parseContractId(stdout);
  const founderKeypair = sdk.Keypair.fromSecret(founderSecret);

  const initialize = await withSorobanInvocation({
    campaignContractId: contractId,
    method: "initialize",
    sourceSecret: founderSecret,
    args: [
      sdk.nativeToScVal(founderKeypair.publicKey(), { type: "address" }),
      sdk.nativeToScVal(toStroops(totalBudgetXLM), { type: "i128" })
    ]
  });

  return {
    contractId,
    txHash: initialize.txHash
  };
}

async function updateCreatorScore(
  campaignContractId: string,
  creatorPublicKey: string,
  newScore: number
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
      sdk.nativeToScVal(BigInt(Math.trunc(newScore)), { type: "i128" })
    ]
  });

  return { txHash: tx.txHash };
}

async function triggerCreatorPayout(
  campaignContractId: string,
  creatorSecret: string
): Promise<{ txHash: string; amountXLM: number }> {
  const creatorPublicKey = sdk.Keypair.fromSecret(creatorSecret).publicKey();
  const payoutEstimateBefore = await getPayoutEstimate(campaignContractId, creatorPublicKey);

  const tx = await withSorobanInvocation({
    campaignContractId,
    method: "claim_payout",
    sourceSecret: creatorSecret,
    args: [sdk.nativeToScVal(creatorPublicKey, { type: "address" })]
  });

  const status = tx.result as { resultMetaXdr?: string };
  const parsedAmount = parseTransferAmountFromMeta(status.resultMetaXdr, creatorPublicKey);

  return {
    txHash: tx.txHash,
    amountXLM: parsedAmount ?? payoutEstimateBefore
  };
}

async function endCampaign(
  campaignContractId: string,
  founderSecret: string
): Promise<{ txHash: string }> {
  const founderPublicKey = sdk.Keypair.fromSecret(founderSecret).publicKey();

  const tx = await withSorobanInvocation({
    campaignContractId,
    method: "end_campaign",
    sourceSecret: founderSecret,
    args: [sdk.nativeToScVal(founderPublicKey, { type: "address" })]
  });

  return { txHash: tx.txHash };
}

async function getOnChainScore(campaignContractId: string, creatorPublicKey: string): Promise<number> {
  const result = await invokeReadonly({
    campaignContractId,
    method: "get_score",
    args: [sdk.nativeToScVal(creatorPublicKey, { type: "address" })]
  });

  return Number(result ?? 0);
}

async function getPayoutEstimate(campaignContractId: string, creatorPublicKey: string): Promise<number> {
  const result = await invokeReadonly({
    campaignContractId,
    method: "get_payout_estimate",
    args: [sdk.nativeToScVal(creatorPublicKey, { type: "address" })]
  });

  const normalized =
    typeof result === "bigint" || typeof result === "number" || typeof result === "string" ? result : 0;

  return fromStroops(BigInt(normalized));
}

async function getCampaignInfo(
  campaignContractId: string
): Promise<{ totalBudgetXLM: number; remainingBudgetXLM: number; status: string; creatorScores: Record<string, number> }> {
  const info = (await invokeReadonly({
    campaignContractId,
    method: "get_campaign_info",
    args: []
  })) as [bigint, bigint, string] | null;

  const scores = (await invokeReadonly({
    campaignContractId,
    method: "get_all_scores",
    args: []
  })) as Map<string, bigint> | null;

  const creatorScores: Record<string, number> = {};
  if (scores) {
    for (const [key, value] of scores.entries()) {
      creatorScores[key] = Number(value);
    }
  }

  return {
    totalBudgetXLM: info ? fromStroops(info[0]) : 0,
    remainingBudgetXLM: info ? fromStroops(info[1]) : 0,
    status: info ? String(info[2]) : "UNKNOWN",
    creatorScores
  };
}

async function getContractBalance(contractId: string): Promise<number> {
  const campaignInfo = await getCampaignInfo(contractId);
  return campaignInfo.remainingBudgetXLM;
}

export {
  deployCampaignContract,
  endCampaign,
  getCampaignInfo,
  getContractBalance,
  getOnChainScore,
  getPayoutEstimate,
  triggerCreatorPayout,
  updateCreatorScore,
  submitClassicPayment
};
