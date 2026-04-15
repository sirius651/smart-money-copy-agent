"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Stats {
  totalTrades: number;
  executedTrades: number;
  totalPnl: number;
  signalCount: number;
}

interface Agent {
  id: string;
  type: string;
  status: string;
  last_run: number | null;
  last_result: string | null;
}

interface AgentCycleResult {
  signalsFound: number;
  tokensAnalyzed: number;
  tradesExecuted: number;
  tradesSkipped: number;
  positionsClosed: number;
  closedPnl: number;
  errors: string[];
  duration: number;
}

interface Toast {
  id: number;
  positionsClosed: number;
  closedPnl: number;
}

interface BalanceData {
  totalValueUsd?: string | number;
  totalUsd?: number;
  details?: unknown[];
}

interface PortfolioResponse {
  balance?: BalanceData & { okb?: string; address?: string; network?: string };
  walletConnected?: boolean;
}

interface ContractResponse {
  contract: string | null;
  network: string;
  chainId: number;
  tradeCount: number | null;
  explorerUrl: string | null;
}

interface SignalsResponse {
  stats: Stats;
}

interface AgentResponse {
  agents: Agent[];
}

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-slate-600",
  running: "bg-blue-500 animate-pulse",
  error: "bg-red-500",
};

const STATUS_TEXT: Record<string, string> = {
  idle: "Idle",
  running: "Running",
  error: "Error",
};

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-[#0d1526] border border-slate-800 rounded-xl p-5">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const lastRun = agent.last_run
    ? new Date(agent.last_run * 1000).toLocaleTimeString()
    : "Never";

  return (
    <div className="bg-[#0d1526] border border-slate-800 rounded-xl p-4 flex items-start gap-3">
      <div
        className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          STATUS_COLORS[agent.status] ?? "bg-slate-600"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-200 capitalize">
            {agent.type} Agent
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              agent.status === "running"
                ? "bg-blue-500/20 text-blue-400"
                : agent.status === "error"
                ? "bg-red-500/20 text-red-400"
                : "bg-slate-700/50 text-slate-400"
            }`}
          >
            {STATUS_TEXT[agent.status] ?? agent.status}
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-1">Last run: {lastRun}</div>
        {agent.last_result && (
          <div className="text-xs text-slate-400 mt-1 truncate">{agent.last_result}</div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [walletBalanceUsd, setWalletBalanceUsd] = useState<number | null>(null);
  const [walletOkb, setWalletOkb] = useState<string | null>(null);
  const [contractInfo, setContractInfo] = useState<ContractResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [lastCycle, setLastCycle] = useState<AgentCycleResult | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoMode, setAutoMode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const toastCounter = useRef(0);
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Auto-cycle every 25s: positions held 20s, so cycle 2 always closes cycle 1 buys
  const AUTO_CYCLE_MS = 25000;

  const fetchData = useCallback(async () => {
    try {
      const [sigRes, agentRes, portfolioRes, contractRes] = await Promise.all([
        fetch("/api/signals"),
        fetch("/api/agent"),
        fetch("/api/portfolio"),
        fetch("/api/contract"),
      ]);
      const sigData = (await sigRes.json()) as SignalsResponse;
      const agentData = (await agentRes.json()) as AgentResponse;
      const portfolioData = (await portfolioRes.json()) as PortfolioResponse;
      const contractData = (await contractRes.json()) as ContractResponse;
      setStats(sigData.stats);
      setAgents(agentData.agents ?? []);
      setContractInfo(contractData);
      const bal = portfolioData.balance;
      if (bal) {
        setWalletBalanceUsd(Number(bal.totalValueUsd ?? bal.totalUsd ?? 0));
        if (bal.okb) setWalletOkb(bal.okb);
      }
    } catch {
      // ignore polling errors silently
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  function showToast(positionsClosed: number, closedPnl: number) {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, positionsClosed, closedPnl }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }

  async function runCycle() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const data = (await res.json()) as { result?: AgentCycleResult; error?: string };
      if (data.error) {
        setError(data.error);
      } else if (data.result) {
        setLastCycle(data.result);
        if (data.result.positionsClosed > 0) {
          showToast(data.result.positionsClosed, data.result.closedPnl);
        }
      }
      fetchData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function startCountdown(totalMs: number) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(Math.ceil(totalMs / 1000));
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function toggleAuto() {
    if (autoMode) {
      // Stop
      if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      autoIntervalRef.current = null;
      setAutoMode(false);
      setCountdown(0);
    } else {
      // Start — run immediately then on interval
      setAutoMode(true);
      runCycle();
      startCountdown(AUTO_CYCLE_MS);
      autoIntervalRef.current = setInterval(() => {
        runCycle();
        startCountdown(AUTO_CYCLE_MS);
      }, AUTO_CYCLE_MS);
    }
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const pnl = stats?.totalPnl ?? 0;
  const pnlPositive = pnl >= 0;

  return (
    <div className="p-8 max-w-6xl">
      {/* Toast notifications — position close alerts */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-start gap-3 bg-[#0d1a2d] border border-emerald-500/40 rounded-xl px-5 py-4 shadow-2xl shadow-emerald-900/30 animate-in slide-in-from-right-8 fade-in duration-300"
            style={{ minWidth: 280 }}
          >
            <div className="mt-0.5 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-emerald-400 text-base">✓</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                {t.positionsClosed} Position{t.positionsClosed > 1 ? "s" : ""} Closed
              </div>
              <div className={`text-xs mt-0.5 font-medium ${t.closedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                Realized PnL: {t.closedPnl >= 0 ? "+" : ""}${t.closedPnl.toFixed(4)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">X Layer Testnet · logged on-chain</div>
            </div>
          </div>
        ))}
      </div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Autonomous Smart Money Copy Trading · X Layer Testnet (Chain 1952)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto mode toggle */}
          <button
            onClick={toggleAuto}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              autoMode
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-slate-700 hover:bg-slate-600 text-slate-200"
            }`}
          >
            {autoMode ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
                Auto {countdown > 0 ? `· ${countdown}s` : "· Running"}
              </>
            ) : (
              "⟳ Auto"
            )}
          </button>

          {/* Manual run */}
          <button
            onClick={runCycle}
            disabled={running || autoMode}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {running ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Running...
              </>
            ) : (
              "▶ Run Once"
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Last cycle result */}
      {lastCycle && (
        <div className="mb-6 p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
          <div className="text-xs text-slate-400 font-medium mb-3">Last Cycle Result</div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-[#0d1526] rounded-lg px-3 py-2">
              <div className="text-xs text-slate-500 mb-0.5">Signals</div>
              <span className="text-blue-400 font-semibold">{lastCycle.signalsFound}</span>
            </div>
            <div className="bg-[#0d1526] rounded-lg px-3 py-2">
              <div className="text-xs text-slate-500 mb-0.5">Buys Opened</div>
              <span className="text-white font-semibold">{lastCycle.tradesExecuted}</span>
            </div>
            <div className="bg-[#0d1526] rounded-lg px-3 py-2">
              <div className="text-xs text-slate-500 mb-0.5">Positions Closed</div>
              <span className={`font-semibold ${lastCycle.positionsClosed > 0 ? "text-emerald-400" : "text-slate-400"}`}>
                {lastCycle.positionsClosed}
              </span>
            </div>
            <div className="bg-[#0d1526] rounded-lg px-3 py-2">
              <div className="text-xs text-slate-500 mb-0.5">Cycle PnL</div>
              <span className={`font-semibold ${lastCycle.closedPnl > 0 ? "text-emerald-400" : lastCycle.closedPnl < 0 ? "text-red-400" : "text-slate-400"}`}>
                {lastCycle.closedPnl !== 0 ? `${lastCycle.closedPnl >= 0 ? "+" : ""}$${lastCycle.closedPnl.toFixed(4)}` : "—"}
              </span>
            </div>
            <div className="bg-[#0d1526] rounded-lg px-3 py-2">
              <div className="text-xs text-slate-500 mb-0.5">Analyzed</div>
              <span className="text-white font-semibold">{lastCycle.tokensAnalyzed}</span>
            </div>
            <div className="bg-[#0d1526] rounded-lg px-3 py-2">
              <div className="text-xs text-slate-500 mb-0.5">Duration</div>
              <span className="text-white font-semibold">{(lastCycle.duration / 1000).toFixed(1)}s</span>
            </div>
          </div>
          {lastCycle.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-400">
              Errors: {lastCycle.errors.join("; ")}
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Wallet Balance"
          value={walletOkb !== null ? `${walletOkb} OKB` : "—"}
          sub={walletBalanceUsd !== null ? `≈ $${walletBalanceUsd.toFixed(2)} · X Layer Testnet` : "X Layer Testnet"}
          accent="text-cyan-400"
        />
        <StatCard
          label="Realized PnL"
          value={`${pnlPositive ? "+" : ""}$${Math.abs(pnl).toFixed(2)}`}
          sub="Closed positions"
          accent={pnl !== 0 ? (pnlPositive ? "text-emerald-400" : "text-red-400") : "text-slate-400"}
        />
        <StatCard
          label="Signals Detected"
          value={String(stats?.signalCount ?? 0)}
          sub="Smart money alerts"
          accent="text-blue-400"
        />
        <StatCard
          label="Trades Executed"
          value={String(stats?.executedTrades ?? 0)}
          sub={`of ${stats?.totalTrades ?? 0} total`}
        />
      </div>

      {/* Pipeline Overview */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-white mb-4">Agent Pipeline</h2>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {["Signal", "Analysis", "Risk", "Trader", "Reinvestment"].map((name, i, arr) => (
            <div key={name} className="flex items-center gap-2">
              <div className="px-3 py-1.5 bg-[#0d1526] border border-slate-700 rounded-lg text-xs text-slate-300">
                {name}
              </div>
              {i < arr.length - 1 && (
                <span className="text-slate-600">→</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Detect → Analyze → Risk Check → Execute → Reinvest · 1–3% position sizing · TP: +15% · SL: -10%
        </p>
      </div>

      {/* Agents */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4">Agent Status</h2>
        <div className="grid grid-cols-2 gap-3">
          {agents.length > 0 ? (
            agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
          ) : (
            <div className="col-span-2 text-sm text-slate-500 py-8 text-center">
              No agent data yet. Run your first cycle to start.
            </div>
          )}
        </div>
      </div>

      {/* On-chain Contract Panel */}
      {contractInfo && (
        <div className="mt-8 p-4 bg-[#0d1526] border border-slate-700 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium text-slate-300">TradeLogger Contract · X Layer Testnet</div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400">Live on-chain</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-slate-500">Contract</div>
              <div className="text-slate-300 font-mono mt-0.5 truncate">
                {contractInfo.contract
                  ? `${contractInfo.contract.slice(0, 10)}…${contractInfo.contract.slice(-8)}`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Network</div>
              <div className="text-slate-300 mt-0.5">{contractInfo.network} (ID: {contractInfo.chainId})</div>
            </div>
            <div>
              <div className="text-slate-500">Trades Logged On-chain</div>
              <div className="text-emerald-400 font-bold text-base mt-0.5">
                {contractInfo.tradeCount ?? "—"}
              </div>
            </div>
          </div>
          {contractInfo.explorerUrl && (
            <a
              href={contractInfo.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-xs text-blue-400 hover:text-blue-300 underline"
            >
              View on OKLink Explorer ↗
            </a>
          )}
        </div>
      )}

      {/* Config */}
      <div className="mt-8 p-4 bg-[#0d1526] border border-slate-800 rounded-xl">
        <div className="text-xs font-medium text-slate-400 mb-3">Trading Configuration</div>
        <div className="grid grid-cols-5 gap-4 text-xs">
          {[
            ["Position Size", "2% portfolio"],
            ["Take Profit", "+15%"],
            ["Stop Loss", "-10%"],
            ["Chain", "X Layer Testnet"],
            ["Mode", "Simulation"],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-slate-500">{label}</div>
              <div className={`font-medium mt-0.5 ${val === "Simulation" ? "text-yellow-400" : "text-slate-200"}`}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
