"use client";

import { useState, useEffect, useCallback } from "react";

interface Signal {
  id: string;
  token: string;
  token_address: string;
  chain: string;
  wallet_type: string;
  amount_usd: number;
  trigger_count: number;
  price_at_signal: number;
  sold_ratio_percent: number;
  confidence_score: number;
  timestamp: number;
}

interface Stats {
  totalTrades: number;
  executedTrades: number;
  totalPnl: number;
  signalCount: number;
}

function ConfidenceBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : score >= 50
      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
      : "bg-slate-700/50 text-slate-400 border-slate-700";

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${color} font-medium`}>
      {score}%
    </span>
  );
}

function WalletTypeBadge({ type }: { type: string }) {
  const config: Record<string, string> = {
    "Smart Money": "bg-purple-500/20 text-purple-400",
    "KOL/Influencer": "bg-yellow-500/20 text-yellow-400",
    Whale: "bg-blue-500/20 text-blue-400",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${config[type] ?? "bg-slate-700 text-slate-400"}`}>
      {type}
    </span>
  );
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      const data = (await res.json()) as { signals: Signal[]; stats: Stats };
      setSignals(data.signals ?? []);
      setStats(data.stats ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 10000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Signal Feed</h1>
          <p className="text-slate-400 text-sm mt-1">
            Smart money, KOL, and whale activity on X Layer
          </p>
        </div>
        <div className="text-sm text-slate-400">
          {stats?.signalCount ?? 0} signals detected
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-6 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400" /> Smart Money
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400" /> KOL/Influencer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400" /> Whale
        </span>
        <span className="ml-4">Confidence: low &lt;50% · medium 50-70% · high ≥70%</span>
      </div>

      {/* Table */}
      <div className="bg-[#0d1526] border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                <th className="text-left px-5 py-3">Token</th>
                <th className="text-left px-5 py-3">Wallet Type</th>
                <th className="text-right px-5 py-3">Amount USD</th>
                <th className="text-right px-5 py-3">Wallets</th>
                <th className="text-right px-5 py-3">Price</th>
                <th className="text-right px-5 py-3">Still Holding</th>
                <th className="text-right px-5 py-3">Confidence</th>
                <th className="text-right px-5 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    Loading signals...
                  </td>
                </tr>
              ) : signals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    No signals yet. Run an agent cycle from the Dashboard to fetch signals.
                  </td>
                </tr>
              ) : (
                signals.map((signal) => (
                  <tr
                    key={signal.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-white">{signal.token}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {signal.token_address.slice(0, 8)}...{signal.token_address.slice(-6)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <WalletTypeBadge type={signal.wallet_type} />
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-200">
                      ${signal.amount_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-white font-medium">{signal.trigger_count}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-300 font-mono text-xs">
                      {signal.price_at_signal > 0
                        ? `$${signal.price_at_signal.toFixed(6)}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span
                        className={
                          signal.sold_ratio_percent < 20
                            ? "text-emerald-400"
                            : signal.sold_ratio_percent < 50
                            ? "text-yellow-400"
                            : "text-red-400"
                        }
                      >
                        {(100 - signal.sold_ratio_percent).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <ConfidenceBadge score={signal.confidence_score} />
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-500 text-xs">
                      {new Date(signal.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signal Logic */}
      <div className="mt-6 p-4 bg-[#0d1526] border border-slate-800 rounded-xl">
        <div className="text-xs font-medium text-slate-400 mb-3">Signal Trigger Logic</div>
        <div className="grid grid-cols-3 gap-4 text-xs text-slate-500">
          <div>
            <div className="text-slate-300 font-medium mb-1">Win Rate Threshold</div>
            Win rate &gt; 70% — only top performers
          </div>
          <div>
            <div className="text-slate-300 font-medium mb-1">Consensus Detection</div>
            2+ smart wallets buying same token
          </div>
          <div>
            <div className="text-slate-300 font-medium mb-1">Holding Signal</div>
            Low sold ratio = wallets still holding (bullish)
          </div>
        </div>
      </div>
    </div>
  );
}
