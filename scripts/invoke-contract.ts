import "dotenv/config";

import * as StellarSdk from "@stellar/stellar-sdk";

const rpcUrl =
  process.env.STELLAR_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org";
const horizonUrl =
  process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const networkPassphrase =
  process.env.STELLAR_NETWORK_PASSPHRASE ?? StellarSdk.Networks.TESTNET;

const contractId = process.argv[2] ?? process.env.SOROBAN_CONTRACT_ID;
const method = process.argv[3];
const secret = process.argv[4] ?? process.env.STELLAR_ADMIN_SECRET;
const rawArgs = process.argv[5] ?? "[]";

if (!contractId || !method || !secret) {
  console.error(
    "Usage: ts-node scripts/invoke-contract.ts <contractId> <method> <secret> '[\"arg1\",123]' ",
  );
  process.exit(1);
}

const sdk = StellarSdk as unknown as {
  Horizon: { Server: new (url: string) => any };
  SorobanRpc: {
    Server: new (url: string, options?: { allowHttp?: boolean }) => any;
    Api: {
      isSimulationError: (value: unknown) => boolean;
    };
    assembleTransaction: (tx: any, simulation: unknown) => any;
  };
  Contract: new (contractId: string) => {
    call: (method: string, ...args: unknown[]) => any;
  };
  Keypair: { fromSecret: (secret: string) => any };
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
};

const args = JSON.parse(rawArgs) as unknown[];

function toScVal(value: unknown) {
  if (typeof value === "string") {
    if (/^G[A-Z0-9]{55}$/.test(value) || /^C[A-Z0-9]{55}$/.test(value)) {
      return sdk.nativeToScVal(value, { type: "address" });
    }

    return sdk.nativeToScVal(value);
  }

  if (typeof value === "number") {
    return sdk.nativeToScVal(BigInt(Math.trunc(value)), { type: "i128" });
  }

  if (typeof value === "boolean") {
    return sdk.nativeToScVal(value, { type: "bool" });
  }

  if (typeof value === "bigint") {
    return sdk.nativeToScVal(value, { type: "i128" });
  }

  return sdk.nativeToScVal(String(value));
}

async function main() {
  const keypair = sdk.Keypair.fromSecret(secret);
  const horizon = new sdk.Horizon.Server(horizonUrl);
  const rpc = new sdk.SorobanRpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith("http://"),
  });
  const account = await horizon.loadAccount(keypair.publicKey());
  const contract = new sdk.Contract(contractId);

  const tx = new sdk.TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args.map(toScVal)))
    .setTimeout(30)
    .build();

  const simulation = await rpc.simulateTransaction(tx);
  if (sdk.SorobanRpc.Api.isSimulationError(simulation)) {
    throw new Error(`Simulation failed for method ${method}`);
  }

  const prepared = sdk.SorobanRpc.assembleTransaction(tx, simulation).build();
  prepared.sign(keypair);

  const submission = await rpc.sendTransaction(prepared);
  const txHash = submission.hash as string;

  if (!txHash) {
    throw new Error("submitTransaction did not return tx hash");
  }

  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const txResult = await rpc.getTransaction(txHash);
    if (txResult.status === "SUCCESS") {
      const returnValue = txResult.returnValue
        ? sdk.scValToNative(txResult.returnValue)
        : null;
      console.log(JSON.stringify({ txHash, returnValue }, null, 2));
      return;
    }

    if (txResult.status === "FAILED") {
      throw new Error(`Transaction failed: ${txHash}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  throw new Error(`Timed out waiting for transaction confirmation: ${txHash}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
