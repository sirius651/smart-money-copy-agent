"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: "⬛" },
  { href: "/signals", label: "Signal Feed", icon: "📡" },
  { href: "/logs", label: "Trade Log", icon: "📋" },
];

interface BalanceData {
  totalValueUsd: string;
  tokens: Array<{ symbol: string; balance: string; balanceUsd: string }>;
  chain: string;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/balance");
      const data = await res.json();
      setBalance(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[#0d1526] border-r border-slate-800 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-sm font-bold">
            SM
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Smart Money</div>
            <div className="text-xs text-slate-500">Copy Agent · X Layer</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active
                ? "bg-blue-600/20 text-blue-400 font-medium"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Balance */}
      {/* <div className="px-4 py-3 border-t border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Balance</span>
          <button
            onClick={fetchBalance}
            disabled={loading}
            className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="text-lg font-semibold text-white">
          ${balance?.totalValueUsd ?? "0.00"}
        </div>
        {balance?.tokens && balance.tokens.length > 0 && (
          <div className="mt-2 space-y-1">
            {balance.tokens.slice(0, 3).map((t, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-slate-400">{t.symbol}</span>
                <span className="text-slate-300">{Number(t.balance).toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </div> */}

      {/* Status */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
          Live on X Layer
        </div>
        <div className="mt-1 text-xs text-slate-600">Chain ID: 196</div>
      </div>
    </aside>
  );
}
