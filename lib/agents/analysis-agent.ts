import { getTokenPriceInfo, getKline, getTokenAdvancedInfo } from "../onchainos";
import { updateAgentStatus, logAgent } from "../db";
import type { Signal, AnalysisResult } from "@/types";

const AGENT_ID = "analysis-agent";

// Entry conditions from proposal
const MAX_PRICE_INCREASE_PCT = 5; // avoid late entry
const MIN_LIQUIDITY_USD = 50000;
const MIN_VOLUME_USD = 10000;

interface PriceInfoData {
  price?: number;
  marketCap?: number;
  liquidity?: number;
  volume24h?: number;
  priceChange24h?: number;
  [key: string]: unknown;
}

interface KlineData {
  c?: number | string;
  o?: number | string;
  [key: string]: unknown;
}

interface AdvancedInfoData {
  riskControlLevel?: number | string;
  [key: string]: unknown;
}

function mapRiskLevel(level: number | string | undefined): "low" | "medium" | "high" {
  const l = Number(level ?? 0);
  if (l <= 1) return "low";
  if (l <= 2) return "medium";
  return "high";
}

export async function analyzeToken(signal: Signal): Promise<AnalysisResult> {
  updateAgentStatus(AGENT_ID, "running");
  logAgent("analysis", "info", `Analyzing token ${signal.token} (${signal.tokenAddress})`);

  const reasons: string[] = [];
  let score = 50; // base score

  try {
    // Fetch price info
    const priceResult = await getTokenPriceInfo(signal.tokenAddress, signal.chain);
    const priceData = (priceResult.ok ? priceResult.data : null) as PriceInfoData | null;

    const price = priceData?.price ?? signal.priceAtSignal;
    const marketCap = priceData?.marketCap ?? 0;
    const liquidity = priceData?.liquidity ?? 0;
    const volume24h = priceData?.volume24h ?? 0;
    const priceChange24h = priceData?.priceChange24h ?? 0;

    // Check price increase (avoid late entry)
    if (priceChange24h > MAX_PRICE_INCREASE_PCT) {
      score -= 20;
      reasons.push(`Price already up ${priceChange24h.toFixed(1)}% (late entry risk)`);
    } else if (priceChange24h > 0) {
      score += 10;
      reasons.push(`Moderate price increase ${priceChange24h.toFixed(1)}%`);
    }

    // Check liquidity
    if (liquidity < MIN_LIQUIDITY_USD) {
      score -= 15;
      reasons.push(`Low liquidity $${liquidity.toLocaleString()}`);
    } else {
      score += 10;
      reasons.push(`Sufficient liquidity $${liquidity.toLocaleString()}`);
    }

    // Check volume
    if (volume24h < MIN_VOLUME_USD) {
      score -= 10;
      reasons.push(`Low volume $${volume24h.toLocaleString()}`);
    } else if (volume24h > 100000) {
      score += 15;
      reasons.push(`High volume $${volume24h.toLocaleString()}`);
    } else {
      score += 5;
      reasons.push(`Volume $${volume24h.toLocaleString()}`);
    }

    // Kline trend check (last 6 candles)
    const klineResult = await getKline(signal.tokenAddress, signal.chain, "15m");
    if (klineResult.ok && Array.isArray(klineResult.data)) {
      const candles = klineResult.data as KlineData[];
      if (candles.length >= 3) {
        const recent = candles.slice(0, 3);
        const increasing = recent.every((c, i) =>
          i === 0 ? true : Number(c.c) >= Number(recent[i - 1].c)
        );
        if (increasing) {
          score += 10;
          reasons.push("Upward price trend");
        } else {
          score -= 5;
          reasons.push("Mixed price trend");
        }
      }
    }

    // Signal confidence boost
    score += Math.round(signal.confidenceScore * 0.2);
    if (signal.triggerCount >= 3) {
      reasons.push(`Strong consensus: ${signal.triggerCount} smart wallets buying`);
    }

    // Advanced info
    const advancedResult = await getTokenAdvancedInfo(signal.tokenAddress, signal.chain);
    const advancedData = (advancedResult.ok ? advancedResult.data : null) as AdvancedInfoData | null;
    const riskLevel = mapRiskLevel(advancedData?.riskControlLevel);

    if (riskLevel === "high") {
      score -= 25;
      reasons.push("High risk level detected");
    } else if (riskLevel === "low") {
      score += 10;
      reasons.push("Low risk level");
    }

    const finalScore = Math.max(0, Math.min(100, score));
    const recommendation: AnalysisResult["recommendation"] =
      finalScore >= 60 ? "buy" : finalScore >= 40 ? "watch" : "skip";

    const result: AnalysisResult = {
      tokenAddress: signal.tokenAddress,
      token: signal.token,
      chain: signal.chain,
      price,
      marketCap,
      liquidity,
      volume24h,
      priceChange24h,
      riskLevel,
      score: finalScore,
      recommendation,
      reasons,
    };

    updateAgentStatus(AGENT_ID, "idle", `Analyzed ${signal.token}: ${recommendation} (score: ${finalScore})`);
    logAgent("analysis", "info", `Analysis complete: ${signal.token} → ${recommendation}`, result);

    return result;
  } catch (err) {
    const msg = `Analysis error for ${signal.token}: ${(err as Error).message}`;
    updateAgentStatus(AGENT_ID, "error", msg);
    logAgent("analysis", "error", msg);

    return {
      tokenAddress: signal.tokenAddress,
      token: signal.token,
      chain: signal.chain,
      price: signal.priceAtSignal,
      marketCap: 0,
      liquidity: 0,
      volume24h: 0,
      priceChange24h: 0,
      riskLevel: "medium",
      score: 30,
      recommendation: "skip",
      reasons: ["Analysis failed - insufficient data"],
    };
  }
}
