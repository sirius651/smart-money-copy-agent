import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "trading.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const fs = require("fs");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      token_address TEXT NOT NULL,
      chain TEXT NOT NULL,
      wallet_type TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      trigger_count INTEGER NOT NULL,
      price_at_signal REAL NOT NULL,
      sold_ratio_percent REAL NOT NULL,
      confidence_score REAL NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      token_address TEXT NOT NULL,
      chain TEXT NOT NULL,
      action TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      price REAL NOT NULL,
      tx_hash TEXT,
      pnl REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      signal_id TEXT,
      timestamp INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      last_run INTEGER,
      last_result TEXT,
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      data TEXT,
      timestamp INTEGER DEFAULT (unixepoch())
    );

    INSERT OR IGNORE INTO agents (id, type, status) VALUES
      ('signal-agent', 'signal', 'idle'),
      ('analysis-agent', 'analysis', 'idle'),
      ('risk-agent', 'risk', 'idle'),
      ('trader-agent', 'trader', 'idle'),
      ('reinvestment-agent', 'reinvestment', 'idle');
  `);
}

export function insertSignal(signal: {
  id: string;
  token: string;
  tokenAddress: string;
  chain: string;
  walletType: string;
  amountUsd: number;
  triggerCount: number;
  priceAtSignal: number;
  soldRatioPercent: number;
  confidenceScore: number;
  timestamp: number;
}) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO signals
    (id, token, token_address, chain, wallet_type, amount_usd, trigger_count, price_at_signal, sold_ratio_percent, confidence_score, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    signal.id,
    signal.token,
    signal.tokenAddress,
    signal.chain,
    signal.walletType,
    signal.amountUsd,
    signal.triggerCount,
    signal.priceAtSignal,
    signal.soldRatioPercent,
    signal.confidenceScore,
    signal.timestamp
  );
}

export function insertTrade(trade: {
  id: string;
  token: string;
  tokenAddress: string;
  chain: string;
  action: string;
  amountUsd: number;
  price: number;
  txHash?: string;
  pnl?: number;
  status: string;
  signalId?: string;
  timestamp: number;
}) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO trades
    (id, token, token_address, chain, action, amount_usd, price, tx_hash, pnl, status, signal_id, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    trade.id,
    trade.token,
    trade.tokenAddress,
    trade.chain,
    trade.action,
    trade.amountUsd,
    trade.price,
    trade.txHash ?? null,
    trade.pnl ?? null,
    trade.status,
    trade.signalId ?? null,
    trade.timestamp
  );
}

export function updateAgentStatus(
  agentId: string,
  status: string,
  lastResult?: string
) {
  const db = getDb();
  db.prepare(`
    UPDATE agents SET status = ?, last_run = unixepoch(), last_result = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(status, lastResult ?? null, agentId);
}

export function logAgent(
  agentType: string,
  level: string,
  message: string,
  data?: unknown
) {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_logs (agent_type, level, message, data)
    VALUES (?, ?, ?, ?)
  `).run(agentType, level, message, data ? JSON.stringify(data) : null);
}

export function getSignals(limit = 50) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM signals ORDER BY timestamp DESC LIMIT ?`
    )
    .all(limit);
}

export function getTrades(limit = 100) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?`)
    .all(limit);
}

export function getAgents() {
  const db = getDb();
  return db.prepare(`SELECT * FROM agents`).all();
}

export function getAgentLogs(limit = 200) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM agent_logs ORDER BY timestamp DESC LIMIT ?`
    )
    .all(limit);
}

export function getStats() {
  const db = getDb();
  // Count only buy trades as "trades" (each buy+sell pair = 1 trade)
  const totalTrades = (db.prepare(`SELECT COUNT(*) as count FROM trades WHERE action = 'buy'`).get() as { count: number }).count;
  const executedTrades = (db.prepare(`SELECT COUNT(*) as count FROM trades WHERE action = 'buy' AND status = 'executed'`).get() as { count: number }).count;
  // Realized PnL: sum from sell trades only (position closed)
  const totalPnl = (db.prepare(`SELECT COALESCE(SUM(pnl), 0) as total FROM trades WHERE action = 'sell' AND pnl IS NOT NULL`).get() as { total: number }).total;
  const signalCount = (db.prepare(`SELECT COUNT(*) as count FROM signals`).get() as { count: number }).count;
  return { totalTrades, executedTrades, totalPnl, signalCount };
}
