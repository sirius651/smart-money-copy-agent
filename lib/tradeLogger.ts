/**
 * On-chain trade logger for X Layer Testnet (chainId 1952).
 *
 * Uses ethers.js directly with the deployer wallet to sign and broadcast
 * TradeLogger.logTrade() transactions. onchainos CLI does not support
 * chain 1952, so we bypass it and talk to the testnet RPC directly.
 */

import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { logAgent } from "./db";

const XLAYER_TESTNET_RPC = process.env.XLAYER_TESTNET_RPC ?? "https://testrpc.xlayer.tech";

// Minimal ABI — only the functions we call
const TRADE_LOGGER_ABI = [
  "function logTrade(string tokenSymbol, string chain, string action, uint256 amountUsdCents, uint256 confidenceScore, string status) external returns (uint256)",
  "function tradeCount() external view returns (uint256)",
  "event TradeLogged(uint256 indexed id, string tokenSymbol, string action, uint256 amountUsdCents, uint256 confidenceScore, string status, uint256 timestamp)",
];

function getContractAddress(): string | null {
  if (process.env.TRADE_LOGGER_ADDRESS) return process.env.TRADE_LOGGER_ADDRESS;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dep = require("./deployments.json");
    return dep.address ?? null;
  } catch {
    return null;
  }
}

let _provider: JsonRpcProvider | null = null;
function getProvider(): JsonRpcProvider {
  if (!_provider) _provider = new JsonRpcProvider(XLAYER_TESTNET_RPC);
  return _provider;
}

function getSigner(): Wallet | null {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) return null;
  return new Wallet(key, getProvider());
}

export interface TradeLogParams {
  tokenSymbol: string;
  chain: string;
  action: "buy" | "sell";
  amountUsd: number;
  confidenceScore: number;
  status: "executed" | "simulated" | "failed";
}

/**
 * Log a trade on-chain via the TradeLogger contract on X Layer Testnet.
 * Fires and forgets — never throws; errors are just logged.
 */
export async function logTradeOnChain(params: TradeLogParams): Promise<string | null> {
  const contractAddress = getContractAddress();
  if (!contractAddress) {
    logAgent("tradeLogger", "warn", "TRADE_LOGGER_ADDRESS not set — skipping on-chain log");
    return null;
  }

  const signer = getSigner();
  if (!signer) {
    logAgent("tradeLogger", "warn", "DEPLOYER_PRIVATE_KEY not set — skipping on-chain log");
    return null;
  }

  try {
    logAgent("tradeLogger", "info", `Logging trade on-chain: ${params.tokenSymbol} ${params.action} (${params.status})`);

    const contract = new Contract(contractAddress, TRADE_LOGGER_ABI, signer);
    const amountUsdCents = BigInt(Math.round(params.amountUsd * 100));
    const confidenceScore = BigInt(Math.min(100, Math.max(0, Math.round(params.confidenceScore))));

    const tx = await (contract.logTrade as (
      a: string, b: string, c: string, d: bigint, e: bigint, f: string
    ) => Promise<{ hash: string; wait: (n: number) => Promise<unknown> }>)(
      params.tokenSymbol,
      params.chain,
      params.action,
      amountUsdCents,
      confidenceScore,
      params.status
    );

    logAgent("tradeLogger", "info", `On-chain log TX sent: ${tx.hash}`, {
      txHash: tx.hash,
      contract: contractAddress,
      network: "X Layer Testnet (1952)",
      explorer: `https://www.oklink.com/xlayer-test/tx/${tx.hash}`,
    });

    // Wait for 1 confirmation in the background — don't block the trade pipeline
    tx.wait(1)
      .then(() => logAgent("tradeLogger", "info", `On-chain log confirmed: ${tx.hash}`))
      .catch(() => { /* ignore confirmation errors */ });

    return tx.hash;
  } catch (err) {
    logAgent("tradeLogger", "warn", `On-chain log error: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Read current trade count from the contract (view call — no gas).
 */
export async function getOnChainTradeCount(): Promise<number | null> {
  const contractAddress = getContractAddress();
  if (!contractAddress) return null;
  try {
    const contract = new Contract(contractAddress, TRADE_LOGGER_ABI, getProvider());
    const count = await contract.tradeCount();
    return Number(count);
  } catch {
    return null;
  }
}

/**
 * Get the deployer wallet's native OKB balance on X Layer Testnet.
 * Used to display a live testnet balance in the dashboard during demo.
 */
export async function getTestnetBalance(): Promise<{ address: string; okb: string; usd: number } | null> {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) return null;
  try {
    const provider = getProvider();
    const wallet = new Wallet(key);
    const address = wallet.address;
    const raw = await provider.getBalance(address);
    const { formatEther } = await import("ethers");
    const okb = parseFloat(formatEther(raw));
    // Rough OKB price estimate for display — not financial data
    const OKB_USD_APPROX = Number(process.env.OKB_USD_PRICE ?? "45");
    return { address, okb: okb.toFixed(4), usd: okb * OKB_USD_APPROX };
  } catch {
    return null;
  }
}
