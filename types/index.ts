export interface Signal {
  id: string;
  token: string;
  tokenAddress: string;
  chain: string;
  walletType: "Smart Money" | "KOL/Influencer" | "Whale";
  amountUsd: number;
  triggerCount: number;
  priceAtSignal: number;
  soldRatioPercent: number;
  confidenceScore: number;
  timestamp: number;
}

export interface Trade {
  id: string;
  token: string;
  tokenAddress: string;
  chain: string;
  action: "buy" | "sell";
  amountUsd: number;
  price: number;
  txHash?: string;
  pnl?: number;
  status: "pending" | "executed" | "failed" | "simulated";
  signalId?: string;
  timestamp: number;
}

export interface Agent {
  id: string;
  type: "signal" | "analysis" | "risk" | "trader" | "reinvestment";
  status: "idle" | "running" | "error";
  lastRun?: number;
  lastResult?: string;
}

export interface Portfolio {
  totalValueUsd: number;
  totalPnl: number;
  totalPnlPercent: number;
  positions: Position[];
}

export interface Position {
  token: string;
  tokenAddress: string;
  chain: string;
  amount: number;
  valueUsd: number;
  pnl: number;
  pnlPercent: number;
}

export interface AnalysisResult {
  tokenAddress: string;
  token: string;
  chain: string;
  price: number;
  marketCap: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  riskLevel: "low" | "medium" | "high";
  score: number;
  recommendation: "buy" | "skip" | "watch";
  reasons: string[];
}

export interface AgentCycleResult {
  signalsFound: number;
  tokensAnalyzed: number;
  tradesExecuted: number;
  tradesSkipped: number;
  positionsClosed: number;
  closedPnl: number;
  errors: string[];
  duration: number;
}
