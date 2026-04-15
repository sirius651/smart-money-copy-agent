import { scanToken } from "../onchainos";
import { updateAgentStatus, logAgent } from "../db";
import type { AnalysisResult } from "@/types";

const AGENT_ID = "risk-agent";

interface RiskCheckResult {
  passed: boolean;
  riskScore: number;
  flags: string[];
}

interface TokenScanData {
  isHoneypot?: boolean | number | string;
  honeypot?: boolean | number | string;
  riskLevel?: number | string;
  hasTradingCooldown?: boolean;
  cannotBuy?: boolean;
  cannotSell?: boolean | number;
  mintable?: boolean;
  blacklistable?: boolean;
  openSource?: boolean;
  isProxy?: boolean;
  buyTax?: number | string;
  sellTax?: number | string;
  [key: string]: unknown;
}

export async function runRiskCheck(analysis: AnalysisResult): Promise<RiskCheckResult> {
  updateAgentStatus(AGENT_ID, "running");
  logAgent("risk", "info", `Risk check for ${analysis.token}`);

  const flags: string[] = [];
  let riskScore = 0;

  try {
    const scanResult = await scanToken(analysis.tokenAddress, analysis.chain);
    const scanData = (scanResult.ok ? scanResult.data : null) as TokenScanData | null;

    if (!scanResult.ok || !scanData) {
      flags.push("Security scan unavailable — proceeding with caution");
      riskScore += 20;
    } else {
      // Honeypot check
      if (
        scanData.isHoneypot === true ||
        scanData.isHoneypot === 1 ||
        scanData.honeypot === true
      ) {
        flags.push("HONEYPOT DETECTED");
        riskScore += 100;
      }

      // Can't sell
      if (scanData.cannotSell === true || Number(scanData.cannotSell) === 1) {
        flags.push("Cannot sell token");
        riskScore += 80;
      }

      // High sell tax
      const sellTax = Number(scanData.sellTax ?? 0);
      if (sellTax > 10) {
        flags.push(`High sell tax: ${sellTax}%`);
        riskScore += 30;
      } else if (sellTax > 5) {
        flags.push(`Moderate sell tax: ${sellTax}%`);
        riskScore += 10;
      }

      // Mintable tokens can be rug pulled
      if (scanData.mintable) {
        flags.push("Token is mintable (rug risk)");
        riskScore += 20;
      }

      // Blacklistable
      if (scanData.blacklistable) {
        flags.push("Token has blacklist function");
        riskScore += 15;
      }

      // Not open source
      if (scanData.openSource === false) {
        flags.push("Contract not open source");
        riskScore += 25;
      }
    }

    // Factor in analysis risk level
    if (analysis.riskLevel === "high") {
      riskScore += 30;
      flags.push("High risk level from token metadata");
    }

    const passed = riskScore < 50;

    const result: RiskCheckResult = { passed, riskScore, flags };
    const summary = passed
      ? `Risk check PASSED for ${analysis.token} (score: ${riskScore})`
      : `Risk check FAILED for ${analysis.token} (score: ${riskScore})`;

    updateAgentStatus(AGENT_ID, "idle", summary);
    logAgent("risk", passed ? "info" : "warn", summary, result);

    return result;
  } catch (err) {
    const msg = `Risk agent error for ${analysis.token}: ${(err as Error).message}`;
    updateAgentStatus(AGENT_ID, "error", msg);
    logAgent("risk", "error", msg);

    return {
      passed: false,
      riskScore: 50,
      flags: ["Risk check failed due to error"],
    };
  }
}
