"use client";

import { useState, useEffect, useCallback } from "react";

interface Trade {
  id: string;
  token: string;
  token_address: string;
  chain: string;
  action: "buy" | "sell";
  amount_usd: number;
  price: number;
  tx_hash: string | null;
  pnl: number | null;
  status: string;
  signal_id: string | null;
  timestamp: number;
}

interface AgentLog {
  id: number;
  agent_type: string;
  level: string;
  message: string;
  data: string | null;
  timestamp: number;
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  executed: { label: "Executed", class: "bg-emerald-500/20 text-emerald-400" },
  simulated: { label: "Simulated", class: "bg-blue-500/20 text-blue-400" },
  pending: { label: "Pending", class: "bg-yellow-500/20 text-yellow-400" },
  failed: { label: "Failed", class: "bg-red-500/20 text-red-400" },
};

const LOG_LEVEL_CONFIG: Record<string, string> = {
  info: "text-slate-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

const AGENT_COLOR: Record<string, string> = {
  signal: "text-purple-400",
  analysis: "text-blue-400",
  risk: "text-orange-400",
  trader: "text-emerald-400",
  reinvestment: "text-cyan-400",
  orchestrator: "text-slate-300",
};

export default function LogsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [tab, setTab] = useState<"trades" | "logs">("trades");
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/logs");
      const data = (await res.json()) as { trades: Trade[]; logs: AgentLog[] };
      setTrades(data.trades ?? []);
      setLogs(data.logs ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const executedCount = trades.filter((t) => t.status === "executed").length;
  const simulatedCount = trades.filter((t) => t.status === "simulated").length;

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Trade Log</h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time trade execution history and agent activity
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{executedCount} executed</span>
          <span>{simulatedCount} simulated</span>
          <span
            className={totalPnl >= 0 ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}
          >
            PnL: {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#0d1526] border border-slate-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("trades")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "trades"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Trades ({trades.length})
        </button>
        <button
          onClick={() => setTab("logs")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "logs"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Agent Logs ({logs.length})
        </button>
      </div>

      {tab === "trades" ? (
        <div className="bg-[#0d1526] border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Token</th>
                  <th className="text-left px-5 py-3">Action</th>
                  <th className="text-right px-5 py-3">Amount</th>
                  <th className="text-right px-5 py-3">Price</th>
                  <th className="text-right px-5 py-3">PnL</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">TX Hash</th>
                  <th className="text-right px-5 py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500">
                      Loading trades...
                    </td>
                  </tr>
                ) : trades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500">
                      No trades yet. Run an agent cycle to start trading.
                    </td>
                  </tr>
                ) : (
                  trades.map((trade) => {
                    const statusCfg = STATUS_CONFIG[trade.status] ?? {
                      label: trade.status,
                      class: "bg-slate-700 text-slate-400",
                    };
                    return (
                      <tr
                        key={trade.id}
                        className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-white">{trade.token}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {trade.chain}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`text-xs font-medium uppercase ${
                              trade.action === "buy" ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {trade.action}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-200">
                          ${trade.amount_usd.toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-300 font-mono text-xs">
                          ${trade.price > 0 ? trade.price.toFixed(6) : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {trade.pnl !== null ? (
                            <span
                              className={trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}
                            >
                              {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${statusCfg.class}`}
                          >
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {trade.tx_hash ? (
                            <span className="text-xs font-mono text-slate-400">
                              {trade.tx_hash.slice(0, 10)}...
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-500 text-xs">
                          {new Date(trade.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-[#0d1526] border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider font-sans">
                  <th className="text-left px-5 py-3">Time</th>
                  <th className="text-left px-5 py-3">Agent</th>
                  <th className="text-left px-5 py-3">Level</th>
                  <th className="text-left px-5 py-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-slate-500 font-sans">
                      Loading logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-slate-500 font-sans">
                      No agent logs yet. Run an agent cycle to see logs.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-slate-800/30 hover:bg-slate-800/10 transition-colors"
                    >
                      <td className="px-5 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(log.timestamp * 1000).toLocaleTimeString()}
                      </td>
                      <td className="px-5 py-2 text-xs whitespace-nowrap">
                        <span className={AGENT_COLOR[log.agent_type] ?? "text-slate-400"}>
                          {log.agent_type}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-xs whitespace-nowrap">
                        <span className={LOG_LEVEL_CONFIG[log.level] ?? "text-slate-400"}>
                          {log.level.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-xs text-slate-300 max-w-xl truncate">
                        {log.message}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
