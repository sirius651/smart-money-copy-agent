import { getSignalList, getTrackerActivities } from "../onchainos";
import { insertSignal, updateAgentStatus, logAgent } from "../db";
import type { Signal } from "@/types";
import { randomUUID } from "crypto";

const AGENT_ID = "signal-agent";
const DEFAULT_CHAIN = process.env.DEFAULT_CHAIN ?? "xlayer";

function computeConfidenceScore(signal: {
  triggerCount: number;
  soldRatioPercent: number;
  amountUsd: number;
  walletType: string;
}): number {
  let score = 0;

  // More wallets buying = higher confidence
  score += Math.min(signal.triggerCount * 10, 40);

  // Low sold ratio = smart money still holding (bullish)
  score += Math.max(0, (100 - signal.soldRatioPercent) * 0.3);

  // Whale or smart money > KOL
  if (signal.walletType === "Smart Money") score += 20;
  else if (signal.walletType === "Whale") score += 15;
  else score += 10;

  // Significant buy amount
  if (signal.amountUsd > 100000) score += 10;
  else if (signal.amountUsd > 10000) score += 5;

  return Math.min(Math.round(score), 100);
}

function mapWalletType(raw: string | number): Signal["walletType"] {
  const val = String(raw);
  if (val === "1") return "Smart Money";
  if (val === "2") return "KOL/Influencer";
  if (val === "3") return "Whale";
  return "Smart Money";
}

export async function runSignalAgent(): Promise<Signal[]> {
  updateAgentStatus(AGENT_ID, "running");
  logAgent("signal", "info", "Signal agent started");

  const signals: Signal[] = [];

  try {
    // Fetch aggregated signal list
    const signalResult = await getSignalList(DEFAULT_CHAIN);
    console.log('signalResult', JSON.stringify(signalResult, null, 2));

    if (signalResult.ok && signalResult.data) {
      const rawData = signalResult.data as Record<string, unknown>;
      let rawSignals: unknown[] = [];
      if (Array.isArray(rawData)) {
        rawSignals = rawData;
      } else if (Array.isArray(rawData?.data)) {
        rawSignals = rawData.data;
      } else if (Array.isArray(rawData?.signals)) {
        rawSignals = rawData.signals as unknown[];
      } else if (Array.isArray(rawData?.list)) {
        rawSignals = rawData.list as unknown[];
      }
      console.log('rawSignals count:', rawSignals.length);
      if (rawSignals.length > 0) {
        console.log('sample raw signal:', JSON.stringify(rawSignals[0], null, 2));
      }

      for (const raw of rawSignals as Record<string, unknown>[]) {
        const tokenData = (raw.token ?? {}) as Record<string, unknown>;
        const walletType = mapWalletType(String(raw.walletType ?? raw.wallet_type ?? "1"));
        const signal: Signal = {
          id: randomUUID(),
          token: String(tokenData.symbol ?? tokenData.name ?? raw.tokenSymbol ?? raw.symbol ?? "UNKNOWN"),
          tokenAddress: String(tokenData.tokenAddress ?? raw.tokenAddress ?? raw.address ?? ""),
          chain: DEFAULT_CHAIN,
          walletType,
          amountUsd: Number(raw.amountUsd ?? raw.totalAmount ?? raw.amount ?? 0),
          triggerCount: Number(raw.triggerWalletCount ?? raw.addressCount ?? raw.triggerCount ?? 1),
          priceAtSignal: Number(raw.price ?? 0),
          soldRatioPercent: Number(raw.soldRatioPercent ?? 0),
          confidenceScore: 0,
          timestamp: Date.now(),
        };

        signal.confidenceScore = computeConfidenceScore(signal);
        console.log('signal:', signal.token, 'addr:', signal.tokenAddress, 'confidence:', signal.confidenceScore);

        // Only save signals with meaningful confidence
        if (signal.confidenceScore >= 20 && signal.tokenAddress) {
          signals.push(signal);
          insertSignal(signal);
        }
      }
    }

    // Also fetch tracker activities for cross-validation
    const trackerResult = await getTrackerActivities("smart_money", DEFAULT_CHAIN);
    // console.log('trackerResult', JSON.stringify(trackerResult, null, 2));

    if (trackerResult.ok && trackerResult.data) {
      const rawData = trackerResult.data as Record<string, unknown>;
      let activities: unknown[] = [];
      if (Array.isArray(rawData)) {
        activities = rawData;
      } else if (Array.isArray(rawData?.data)) {
        activities = rawData.data;
      } else if (Array.isArray(rawData?.activities)) {
        activities = rawData.activities as unknown[];
      } else if (Array.isArray(rawData?.list)) {
        activities = rawData.list as unknown[];
      }
      console.log('activities count:', activities.length);

      // Group by token to detect consensus (multiple wallets buying same token)
      const tokenBuys = new Map<string, { count: number; totalUsd: number; price: number; symbol: string }>();

      for (const act of activities as Record<string, unknown>[]) {
        if (Number(act.tradeType) !== 1) continue; // buy only
        const addr = String(act.tokenAddress ?? "");
        if (!addr) continue;

        const existing = tokenBuys.get(addr) ?? { count: 0, totalUsd: 0, price: 0, symbol: "" };
        existing.count += 1;
        existing.totalUsd += Number(act.amountUsd ?? 0);
        existing.price = Number(act.price ?? existing.price);
        existing.symbol = String(act.tokenSymbol ?? existing.symbol ?? "UNKNOWN");
        tokenBuys.set(addr, existing);
      }

      // Consensus trades (2+ smart wallets buying same token)
      for (const [addr, data] of tokenBuys.entries()) {
        if (data.count < 2) continue;

        // Check if already in signals
        const exists = signals.some((s) => s.tokenAddress === addr);
        if (exists) continue;

        const signal: Signal = {
          id: randomUUID(),
          token: data.symbol,
          tokenAddress: addr,
          chain: DEFAULT_CHAIN,
          walletType: "Smart Money",
          amountUsd: data.totalUsd,
          triggerCount: data.count,
          priceAtSignal: data.price,
          soldRatioPercent: 0,
          confidenceScore: 0,
          timestamp: Date.now(),
        };

        signal.confidenceScore = computeConfidenceScore(signal);

        if (signal.confidenceScore >= 20) {
          signals.push(signal);
          insertSignal(signal);
        }
      }
    }

    const summary = `Found ${signals.length} signals on ${DEFAULT_CHAIN}`;
    updateAgentStatus(AGENT_ID, "idle", summary);
    logAgent("signal", "info", summary, { count: signals.length });

    return signals;
  } catch (err) {
    const msg = `Signal agent error: ${(err as Error).message}`;
    updateAgentStatus(AGENT_ID, "error", msg);
    logAgent("signal", "error", msg);
    return signals;
  }
}
