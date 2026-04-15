import { getWalletStatus, getWalletBalance, getSwapQuote, executeSwap } from "../onchainos";
import { insertTrade, updateAgentStatus, logAgent } from "../db";
import { logTradeOnChain, getTestnetBalance } from "../tradeLogger";
import type { AnalysisResult, Trade } from "@/types";
import { randomUUID } from "crypto";

const AGENT_ID = "trader-agent";

// Position sizing: 1-3% of portfolio per trade
const POSITION_SIZE_PCT = Number(process.env.POSITION_SIZE_PCT ?? "2");
const TAKE_PROFIT_PCT = Number(process.env.TAKE_PROFIT_PCT ?? "15");
const STOP_LOSS_PCT = Number(process.env.STOP_LOSS_PCT ?? "10");
const USDC_ADDRESS = process.env.USDC_ADDRESS ?? "usdc";

interface WalletStatusData {
  address?: string;
  wallet?: string;
  isLoggedIn?: boolean;
  loggedIn?: boolean;
  currentAccountId?: string;
  [key: string]: unknown;
}

interface BalanceData {
  totalUsd?: number;
  total?: number;
  totalValueUsd?: string | number; // onchainos returns this as a string
  balances?: Array<{ symbol: string; balanceUsd: number }>;
  [key: string]: unknown;
}

interface QuoteData {
  toAmount?: string | number;
  price?: string | number;
  priceImpact?: string | number;
  [key: string]: unknown;
}

interface SwapResult {
  txHash?: string;
  hash?: string;
  [key: string]: unknown;
}

export async function executeTrade(
  analysis: AnalysisResult,
  signalId: string,
  dryRun = false,
  confidenceScore = 0
): Promise<Trade | null> {
  updateAgentStatus(AGENT_ID, "running");
  logAgent("trader", "info", `Executing trade for ${analysis.token} (dryRun: ${dryRun})`);

  try {
    // Check wallet status
    const statusResult = await getWalletStatus();
    const statusData = (statusResult.ok ? statusResult.data : null) as WalletStatusData | null;
    console.log('statusData', JSON.stringify(statusData, null, 2));

    if (!statusResult.ok || !statusData) {
      logAgent("trader", "warn", "Wallet not connected — running in simulation mode");
    }

    const walletAddress = statusData?.address ?? statusData?.wallet ?? statusData?.currentAccountId ?? "simulation";
    const isLoggedIn = statusData?.loggedIn ?? statusData?.isLoggedIn ?? false;

    // Get portfolio balance — use testnet OKB balance for simulation sizing
    let totalUsd = 0;
    if (dryRun) {
      const testnetBal = await getTestnetBalance();
      totalUsd = testnetBal?.usd ?? 0;
    } else {
      const balanceResult = await getWalletBalance(analysis.chain);
      const balanceData = (balanceResult.ok ? balanceResult.data : null) as BalanceData | null;
      totalUsd = Number(balanceData?.totalValueUsd ?? balanceData?.totalUsd ?? balanceData?.total ?? 0) || 0;
    }
    const tradeAmountUsd = (totalUsd * POSITION_SIZE_PCT) / 100;
    const minTradeUsd = 0.5; // lowered for demo

    if (totalUsd === 0) {
      logAgent("trader", "warn", "Wallet balance is $0 — fund your OKX Agentic Wallet with USDC on X Layer to trade");
      updateAgentStatus(AGENT_ID, "idle", "Trade skipped — wallet has no funds");
      return null;
    }

    if (tradeAmountUsd < minTradeUsd) {
      logAgent("trader", "warn", `Trade amount too small: $${tradeAmountUsd.toFixed(2)} (portfolio $${totalUsd.toFixed(2)})`);
      updateAgentStatus(AGENT_ID, "idle", "Trade skipped — insufficient balance");
      return null;
    }

    // Get swap quote first
    const quoteResult = await getSwapQuote({
      from: USDC_ADDRESS,
      to: analysis.tokenAddress,
      amount: tradeAmountUsd.toFixed(2),
      chain: analysis.chain,
    });

    const quoteData = (quoteResult.ok ? quoteResult.data : null) as QuoteData | null;
    // console.log('quoteData', JSON.stringify(quoteData, null, 2));

    const tradeId = randomUUID();
    const timestamp = Date.now();

    if (dryRun || !isLoggedIn) {
      // Simulation mode — record the buy and open the position.
      // Position Manager will close it after POSITION_HOLD_MS on the next cycle.
      const trade: Trade = {
        id: tradeId,
        token: analysis.token,
        tokenAddress: analysis.tokenAddress,
        chain: analysis.chain,
        action: "buy",
        amountUsd: tradeAmountUsd,
        price: analysis.price,
        status: "simulated",
        signalId,
        timestamp,
      };

      insertTrade(trade);
      updateAgentStatus(AGENT_ID, "idle", `[SIM] Opened ${analysis.token} · $${tradeAmountUsd.toFixed(2)} @ $${analysis.price.toFixed(6)}`);
      logAgent("trader", "info", `[SIM] Buy opened for ${analysis.token}`, { amount: tradeAmountUsd, price: analysis.price });

      // Log buy on-chain (X Layer Testnet)
      logTradeOnChain({
        tokenSymbol: analysis.token,
        chain: analysis.chain,
        action: "buy",
        amountUsd: tradeAmountUsd,
        confidenceScore,
        status: "simulated",
      });

      return trade;
    }

    // Real execution
    const swapResult = await executeSwap({
      from: USDC_ADDRESS,
      to: analysis.tokenAddress,
      amount: tradeAmountUsd.toFixed(2),
      wallet: walletAddress,
      chain: analysis.chain,
      slippage: 1,
    });

    const swapData = (swapResult.ok ? swapResult.data : null) as SwapResult | null;

    const trade: Trade = {
      id: tradeId,
      token: analysis.token,
      tokenAddress: analysis.tokenAddress,
      chain: analysis.chain,
      action: "buy",
      amountUsd: tradeAmountUsd,
      price: Number(quoteData?.price ?? analysis.price),
      txHash: swapData?.txHash ?? swapData?.hash,
      status: swapResult.ok ? "executed" : "failed",
      signalId,
      timestamp,
    };

    insertTrade(trade);

    // Log real trade on-chain (X Layer Testnet)
    logTradeOnChain({
      tokenSymbol: analysis.token,
      chain: analysis.chain,
      action: "buy",
      amountUsd: tradeAmountUsd,
      confidenceScore,
      status: swapResult.ok ? "executed" : "failed",
    });

    const summary = swapResult.ok
      ? `Bought ${analysis.token} for $${tradeAmountUsd.toFixed(2)} | TX: ${trade.txHash}`
      : `Trade failed for ${analysis.token}: ${swapResult.error}`;

    updateAgentStatus(AGENT_ID, "idle", summary);
    logAgent("trader", swapResult.ok ? "info" : "error", summary, trade);

    return trade;
  } catch (err) {
    const msg = `Trader agent error: ${(err as Error).message}`;
    updateAgentStatus(AGENT_ID, "error", msg);
    logAgent("trader", "error", msg);
    return null;
  }
}

export { TAKE_PROFIT_PCT, STOP_LOSS_PCT };
