"use client";

import { useState, useEffect } from "react";
import { Wallet, LogOut, Loader2 } from "lucide-react";

interface WalletStatus {
  loggedIn: boolean;
  email?: string;
  currentAccountName?: string;
  address?: string;
  error?: string;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function Header() {
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/wallet");
      const data = await res.json();
      setWallet(data);
    } catch {
      setWallet({ loggedIn: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleLogin = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/wallet/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.ok) {
        setStep("otp");
      } else {
        setError(data.error || "Failed to send OTP");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otp }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowModal(false);
        setStep("email");
        setEmail("");
        setOtp("");
        fetchStatus();
      } else {
        setError(data.error || "Invalid OTP");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/wallet/logout", { method: "POST" });
      fetchStatus();
    } catch {
      // ignore
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setStep("email");
    setEmail("");
    setOtp("");
    setError("");
  };

  return (
    <>
      <header className="sticky top-0 z-40 h-16 bg-[#0d1526]/80 backdrop-blur-sm border-b border-slate-800 flex items-center justify-between px-6">
        <div className="text-lg font-semibold text-white">Dashboard</div>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : wallet?.loggedIn ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                <Wallet className="w-4 h-4" />
                <span>{wallet.address ? shortenAddress(wallet.address) : wallet.currentAccountName || "Connected"}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
                title="Disconnect"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0d1526] border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-4">
              {step === "email" ? "Connect Wallet" : "Enter Verification Code"}
            </h2>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            {step === "email" ? (
              <>
                <p className="text-sm text-slate-400 mb-4">
                  Enter your email to receive a one-time verification code.
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={closeModal}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogin}
                    disabled={!email || submitting}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Send Code
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-400 mb-4">
                  We sent a code to <span className="text-white">{email}</span>
                </p>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit code"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm text-center tracking-widest"
                  maxLength={6}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                />
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setStep("email")}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={otp.length < 6 || submitting}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Verify
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
