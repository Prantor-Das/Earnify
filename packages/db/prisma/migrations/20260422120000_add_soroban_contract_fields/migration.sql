-- Add Soroban contract tracking to campaigns and on-chain tx hash tracking to scores.
ALTER TABLE "Campaign"
  ADD COLUMN "stellarContractId" TEXT,
  ADD COLUMN "fundingTxHash" TEXT;

ALTER TABLE "Score"
  ADD COLUMN "scoreTxHash" TEXT;
