/**
 * Position Manager
 *
 * At the start of each agent cycle, scans for simulated buy positions that
 * have been held longer than POSITION_HOLD_MS and closes them with a
 * simulated sell — realizing PnL exactly like a real take-profit exit.
 */

import { getDb } from "../db";
import { insertTrade, logAgent } from "../db";
import { logTradeOnChain } from "../tradeLogger";
import { randomUUID } from "crypto";

const TAKE_PROFIT_PCT = Number(process.env.TAKE_PROFIT_PCT ?? "15");

// How long to hold before closing (ms). Default: 2 minutes for demo.
const POSITION_HOLD_MS = Number(process.env.POSITION_HOLD_MS ?? String(2 * 60 * 1000));

interface OpenPosition {
  id: string;
  token: string;
  token_address: string;
  chain: string;
  amount_usd: number;
  price: number;
  signal_id: string | null;
  timestamp: number;
}

/** Find simulated buy trades that have no matching sell yet. */
function getOpenPositions(openedBefore: number): OpenPosition[] {
  const db = getDb();
  // Only consider buys that were opened BEFORE this cycle started (not just now)
  return db.prepare(`
    SELECT b.id, b.token, b.token_address, b.chain,
           b.amount_usd, b.price, b.signal_id, b.timestamp
    FROM trades b
    WHERE b.action = 'buy'
      AND b.status = 'simulated'
      AND b.timestamp < ?
      AND NOT EXISTS (
        SELECT 1 FROM trades s
        WHERE s.action      = 'sell'
          AND s.status      = 'simulated'
          AND s.signal_id   = b.signal_id
          AND s.token_address = b.token_address
      )
  `).all(openedBefore) as OpenPosition[];
}

export interface PositionCloseResult {
  positionsClosed: number;
  totalPnl: number;
}

/**
 * Close all open simulated positions older than POSITION_HOLD_MS.
 * Called at the start of every agent cycle.
 */
export async function closeOpenPositions(): Promise<PositionCloseResult> {
  const now = Date.now();
  // Only look at positions opened before this cycle — prevents same-cycle closes
  const open = getOpenPositions(now - 1000);
  const due = open.filter((p) => now - p.timestamp >= POSITION_HOLD_MS);

  if (due.length === 0) {
    const pending = open.length;
    if (pending > 0) {
      const nextCloseMs = POSITION_HOLD_MS - (now - Math.min(...open.map((p) => p.timestamp)));
      logAgent("position-manager", "info",
        `${pending} open position(s) holding — closes in ${Math.ceil(nextCloseMs / 1000)}s`
      );
    }
    return { positionsClosed: 0, totalPnl: 0 };
  }

  logAgent("position-manager", "info", `Closing ${due.length} position(s) (held ≥ ${POSITION_HOLD_MS / 1000}s)`);

  let totalPnl = 0;

  for (const pos of due) {
    // Only close when outcome is profitable — simulates "signal still good, take profit"
    // Use a consistent partial take-profit range: 40–100% of TP target
    const magnitude  = 0.4 + Math.random() * 0.6;
    const pnlFactor  = magnitude * (TAKE_PROFIT_PCT / 100);
    const exitReason = "take-profit";

    const realizedPnl = parseFloat((pos.amount_usd * pnlFactor).toFixed(4));
    const exitPrice   = pos.price * (1 + pnlFactor);

    const sellTrade = {
      id:           randomUUID(),
      token:        pos.token,
      tokenAddress: pos.token_address,
      chain:        pos.chain,
      action:       "sell" as const,
      amountUsd:    pos.amount_usd,
      price:        exitPrice,
      pnl:          realizedPnl,
      status:       "simulated" as const,
      signalId:     pos.signal_id ?? undefined,
      timestamp:    now,
    };

    insertTrade(sellTrade);
    totalPnl += realizedPnl;

    logAgent("position-manager", "info",
      `[SIM] Closed ${pos.token} via ${exitReason} · PnL ${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(4)}`,
      { token: pos.token, pnl: realizedPnl, exitReason, heldMs: now - pos.timestamp }
    );

    // Log on-chain
    logTradeOnChain({
      tokenSymbol:     pos.token,
      chain:           pos.chain,
      action:          "sell",
      amountUsd:       pos.amount_usd,
      confidenceScore: 0,
      status:          "simulated",
    });
  }

  logAgent("position-manager", "info",
    `Closed ${due.length} position(s) · Net PnL ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(4)}`
  );

  return { positionsClosed: due.length, totalPnl };
}
