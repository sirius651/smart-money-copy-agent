import { runSignalAgent } from "./signal-agent";
import { analyzeToken } from "./analysis-agent";
import { runRiskCheck } from "./risk-agent";
import { executeTrade } from "./trader-agent";
import { closeOpenPositions } from "./position-manager";
import { logAgent } from "../db";
import type { AgentCycleResult, Signal } from "@/types";

// Trading filters
const MIN_CONFIDENCE_SCORE = Number(process.env.MIN_CONFIDENCE_SCORE ?? "50");
const DRY_RUN = process.env.DRY_RUN !== "false"; // default to simulation for safety

export async function runAgentCycle(): Promise<AgentCycleResult> {
  const startTime = Date.now();
  const result: AgentCycleResult = {
    signalsFound: 0,
    tokensAnalyzed: 0,
    tradesExecuted: 0,
    tradesSkipped: 0,
    positionsClosed: 0,
    closedPnl: 0,
    errors: [],
    duration: 0,
  };

  logAgent("orchestrator", "info", "Agent cycle started", { dryRun: DRY_RUN });

  try {
    // Step 0: Position Manager — close any positions that have passed their hold time
    const closes = await closeOpenPositions();
    result.positionsClosed = closes.positionsClosed;
    result.closedPnl = closes.totalPnl;
    if (closes.positionsClosed > 0) {
      logAgent("orchestrator", "info",
        `Closed ${closes.positionsClosed} position(s) · Net PnL ${closes.totalPnl >= 0 ? "+" : ""}$${closes.totalPnl.toFixed(4)}`
      );
    }

    // Step 1: Signal Agent — fetch smart money signals
    const signals = await runSignalAgent();
    console.log('signals', signals)
    result.signalsFound = signals.length;

    if (signals.length === 0) {
      logAgent("orchestrator", "info", "No signals found, cycle complete");
      result.duration = Date.now() - startTime;
      return result;
    }

    // Filter by confidence
    const qualifiedSignals = signals.filter(
      (s) => s.confidenceScore >= MIN_CONFIDENCE_SCORE
    );

    logAgent(
      "orchestrator",
      "info",
      `${qualifiedSignals.length}/${signals.length} signals meet confidence threshold`
    );

    // Process top signals (limit to avoid spam)
    const topSignals = qualifiedSignals
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, 5);

    for (const signal of topSignals) {
      try {
        await processSingleSignal(signal, result);
      } catch (err) {
        const msg = `Error processing signal for ${signal.token}: ${(err as Error).message}`;
        result.errors.push(msg);
        logAgent("orchestrator", "error", msg);
      }
    }
  } catch (err) {
    const msg = `Agent cycle error: ${(err as Error).message}`;
    result.errors.push(msg);
    logAgent("orchestrator", "error", msg);
  }

  result.duration = Date.now() - startTime;
  logAgent("orchestrator", "info", "Agent cycle complete", result);

  return result;
}

async function processSingleSignal(
  signal: Signal,
  result: AgentCycleResult
): Promise<void> {
  logAgent("orchestrator", "info", `Processing signal: ${signal.token} (confidence: ${signal.confidenceScore})`);

  // Step 2: Analysis Agent — evaluate the token
  const analysis = await analyzeToken(signal);
  result.tokensAnalyzed++;

  if (analysis.recommendation === "skip") {
    logAgent("orchestrator", "info", `Skipping ${signal.token}: analysis score too low (${analysis.score})`);
    result.tradesSkipped++;
    return;
  }

  // Step 3: Risk Agent — security check
  const riskCheck = await runRiskCheck(analysis);

  if (!riskCheck.passed) {
    logAgent(
      "orchestrator",
      "warn",
      `Risk check failed for ${signal.token}: ${riskCheck.flags.join(", ")}`
    );
    result.tradesSkipped++;
    return;
  }

  // Step 4: Trader Agent — execute the trade
  const trade = await executeTrade(analysis, signal.id, DRY_RUN, signal.confidenceScore);

  if (trade) {
    result.tradesExecuted++;
    logAgent(
      "orchestrator",
      "info",
      `Trade executed: ${trade.token} | $${trade.amountUsd.toFixed(2)} | ${trade.status}`
    );
  } else {
    result.tradesSkipped++;
  }
}
