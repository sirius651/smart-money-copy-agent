# Smart Money Copy Agent

> An autonomous on-chain AI trading system that detects elite "smart money" wallets, replicates their trades with AI-driven risk filtering, and logs every decision immutably on **X Layer Testnet** .

---

## Table of Contents

1. [Project Introduction](#1-project-introduction)
2. [Architecture Overview](#2-architecture-overview)
3. [Deployment Address](#3-deployment-address)
4. [Onchain OS Skill Usage](#4-onchain-os-skill-usage)
5. [Working Mechanics](#5-working-mechanics)
6. [Running the Project](#6-running-the-project)
7. [X Layer Ecosystem Positioning](#8-x-layer-ecosystem-positioning)

---

## 1. Project Introduction

**Smart Money Copy Agent** is a fully autonomous trading system that watches what the best on-chain traders are doing — and copies them in real time.

Smart money wallets (top-performing traders, whales, KOLs) consistently outperform retail. But tracking them manually is impossible at speed. This agent does it continuously, 24/7:

- Detects when multiple elite wallets converge on the same token
- Scores the opportunity against price trend, liquidity, volume, and risk metadata
- Runs a security check to block honeypots and rug pulls
- Opens a simulated position and closes it automatically at take-profit
- **Records every trade on-chain via a deployed smart contract on X Layer Testnet**

Every decision is transparent, verifiable, and logged on-chain — making the agent's entire trading history publicly auditable on the OKLink explorer.

### Why X Layer?

X Layer is EVM-compatible with **zero gas fees**, making it ideal for high-frequency agent activity. Every trade log, every open, every close — written on-chain at no cost. This wouldn't be practical on Ethereum mainnet.

---

## 2. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Dashboard (Next.js)                         │
│   Wallet Balance · Realized PnL · Signal Feed · Agent Logs      │
│                                                                 │
│   [ ⟳ Auto ]  — fires agent cycle every 25s automatically      │
│   [ ▶ Run Once ] — manual single cycle                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST API (/api/agent, /api/signals ...)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Orchestrator                           │
│                                                                 │
│  Step 0 ──▶ Position Manager                                    │
│             Close positions held ≥ 20s at take-profit           │
│             Emit realized PnL · log close on-chain              │
│                                                                 │
│  Step 1 ──▶ Signal Agent                                        │
│             OKX smart money signals + tracker consensus         │
│                                                                 │
│  Step 2 ──▶ Analysis Agent                                      │
│             Price · kline · liquidity · volume scoring          │
│                                                                 │
│  Step 3 ──▶ Risk Agent                                          │
│             Honeypot · rug pull · sell tax security scan        │
│                                                                 │
│  Step 4 ──▶ Trader Agent                                        │
│             Open position · log buy on-chain                    │
└──────────┬──────────────────────────────────────┬───────────────┘
           │                                      │
           ▼                                      ▼
┌──────────────────────┐          ┌───────────────────────────────┐
│   Onchain OS CLI     │          │   TradeLogger Contract        │
│  (onchainos binary)  │          │   X Layer Testnet (1952)      │
│                      │          │                               │
│  signal list         │          │  logTrade(symbol, chain,      │
│  tracker activities  │          │    action, amountUsdCents,    │
│  token price-info    │          │    confidenceScore, status)   │
│  token advanced-info │          │                               │
│  market kline        │          │  Emits TradeLogged event      │
│  security token-scan │          │  Stores full trade history    │
│  swap quote/execute  │          │  getRecentTrades(n) readable  │
│  wallet balance      │          └───────────────────────────────┘
└──────────────────────┘
           │
           ▼
┌──────────────────────┐
│  SQLite (local DB)   │
│  signals · trades    │
│  agents · logs       │
└──────────────────────┘
```

### Two-Chain Design

| Layer | Network | Chain ID | Used For |
|---|---|---|---|
| Market data & signals | X Layer Mainnet | 196 | OKX API (signals, prices, DEX) |
| Smart contract | **X Layer Testnet** | **1952** | TradeLogger — on-chain audit trail |

OKX's signal and DEX APIs only index mainnet activity (that's where smart money actually trades). The `TradeLogger` contract runs on testnet — all agent activity is recorded on-chain for free and verifiable on OKLink, without risking real funds.

### Auto-Cycle Timeline

```
t=0s  ──▶ Cycle fires
           Position Manager: no open positions yet
           Signal Agent → Analysis → Risk → Trader: buys open

t=25s ──▶ Cycle fires
           Position Manager: positions from t=0 are 25s old (> 20s hold)
             → close at take-profit → realized PnL increases
             → sell tx broadcast to TradeLogger on X Layer Testnet
             → toast notification shown on dashboard
           Signal Agent → ... → Trader: new buys open

t=50s ──▶ Cycle fires (repeats indefinitely)
```

Full open → close loop: **~25 seconds**.

---

## 3. Deployment Address

### TradeLogger Contract

| Field | Value |
|---|---|
| **Contract** | `0xED70F64CBaf79a62297930C2efdEf0A5a4153A7f` |
| **Network** | X Layer Testnet |
| **Chain ID** | 1952 |
| **RPC** | `https://testrpc.xlayer.tech` |
| **Explorer** | [View on OKLink ↗](https://www.oklink.com/xlayer-test/address/0xED70F64CBaf79a62297930C2efdEf0A5a4153A7f) |
| **Deployed** | 2026-04-15 |
| **Deployer** | `0x2af64f3eb79c0fd278f118e5946B92b6a869E4BE` |

### Contract Interface

```solidity
// Every trade (buy or sell, real or simulated) is permanently recorded
function logTrade(
    string tokenSymbol,      // e.g. "OKB"
    string chain,            // e.g. "xlayer"
    string action,           // "buy" | "sell"
    uint256 amountUsdCents,  // USD × 100  (e.g. $9.50 → 950)
    uint256 confidenceScore, // 0–100 signal quality score
    string status            // "simulated" | "executed" | "failed"
) external returns (uint256 id)

function tradeCount() external view returns (uint256)
function getTrade(uint256 id) external view returns (TradeRecord memory)
function getRecentTrades(uint256 n) external view returns (TradeRecord[] memory)
```

Each `logTrade` call emits a `TradeLogged` event on-chain, creating a permanent, tamper-proof record of every agent decision.

---

## 4. Onchain OS Skill Usage

The agent pipeline is built entirely on **Onchain OS CLI** (`onchainos`) skills:

| Skill | CLI Command | Agent | Purpose |
|---|---|---|---|
| `okx-dex-signal` | `signal list --chain xlayer` | Signal | Aggregated smart money buy signals |
| `okx-dex-signal` | `tracker activities --tracker-type smart_money` | Signal | Raw wallet activity — detect consensus |
| `okx-dex-token` | `token price-info --address <addr>` | Analysis | Price, market cap, 24h volume, liquidity |
| `okx-dex-token` | `token advanced-info --address <addr>` | Analysis | Risk level metadata |
| `okx-dex-market` | `market kline --bar 15m` | Analysis | 15-min candlestick trend analysis |
| `okx-security` | `security token-scan --address <addr>` | Risk | Honeypot, rug pull, sell tax detection |
| `okx-dex-swap` | `swap quote --from usdc --to <addr>` | Trader | Pre-trade price quote |
| `okx-dex-swap` | `swap execute --from usdc --to <addr>` | Trader | Live DEX swap execution |
| `okx-agentic-wallet` | `wallet status` | Trader | Login state and account info |
| `okx-agentic-wallet` | `wallet balance --chain xlayer` | Trader | Portfolio value for position sizing |
| `okx-wallet-portfolio` | `portfolio all-balances --address <addr>` | Portfolio | Multi-chain balance snapshot |

### Skill Integration Flow

```
okx-dex-signal
  └─▶ detect smart money consensus
        │
okx-dex-token + okx-dex-market
  └─▶ score the opportunity (0–100)
        │
okx-security
  └─▶ block if honeypot / rug / high tax
        │
okx-agentic-wallet + okx-dex-swap
  └─▶ execute trade (TEE-signed, no key exposure)
        │
TradeLogger (ethers.js → X Layer Testnet)
  └─▶ permanent on-chain record
```

---

## 5. Working Mechanics

### Agent Cycle Steps

**Step 0 — Position Manager**
Scans for open simulated positions held longer than `POSITION_HOLD_MS` (20s). Closes each at a partial take-profit (40–100% of the 15% TP target). Inserts a sell trade with realized PnL. Logs the close on-chain via TradeLogger.

**Step 1 — Signal Agent**
Calls `onchainos signal list` and `tracker activities`. Groups tracker buys by token address — two or more smart wallets buying the same token in the same window = consensus signal. Computes a confidence score (0–100) per signal.

**Step 2 — Analysis Agent**
Scores each signal token on a 0–100 scale starting from 50:

| Check | Condition | Delta |
|---|---|---|
| Late entry risk | price up > 5% in 24h | −20 |
| Good entry | price up 0–5% | +10 |
| Liquidity | ≥ $50k | +10 · < $50k | −15 |
| Volume | > $100k | +15 · $10–100k | +5 · < $10k | −10 |
| Trend | 3 ascending 15m candles | +10 · mixed | −5 |
| Signal quality | confidenceScore × 0.2 | 0–20 |
| Risk metadata | high | −25 · low | +10 |

Result: **≥ 60 → buy** · 40–59 → watch · < 40 → skip

**Step 3 — Risk Agent**
Runs `security token-scan`. Blocks the trade if risk score ≥ 50. Instant block on honeypot (+100) or cannot-sell (+80).

**Step 4 — Trader Agent**
Sizes the position at 10% of testnet OKB balance. Inserts a buy trade with `pnl = null`. Logs the buy to TradeLogger on X Layer Testnet via ethers.js (direct RPC — onchainos CLI does not support chain 1952).

### Position Lifecycle

```
BUY (t=0)                        CLOSE (t ≥ 20s)
──────────────────────────        ────────────────────────────────
action:     "buy"                 action:     "sell"
pnl:        null                  pnl:        +$0.04  (realized)
status:     simulated             status:     simulated
timestamp:  Date.now()            exitReason: "take-profit"
→ TradeLogger tx (buy)            → TradeLogger tx (sell)
```

### Dashboard Signals

- **Wallet Balance** — live OKB balance from X Layer Testnet deployer wallet
- **Realized PnL** — sum of all closed sell trade PnL values
- **Positions Closed** — count shown in Last Cycle Result panel
- **Toast notification** — pops bottom-right when positions close with PnL amount
- **TradeLogger panel** — live on-chain trade count, linked to OKLink explorer

### Key Configuration

| Variable | Default | Effect |
|---|---|---|
| `DRY_RUN` | `true` | Simulation — no real swaps |
| `POSITION_HOLD_MS` | `20000` | Hold 20s before closing |
| `POSITION_SIZE_PCT` | `10` | 10% of balance per trade |
| `TAKE_PROFIT_PCT` | `15` | Take-profit target % |
| `MIN_CONFIDENCE_SCORE` | `50` | Signal quality gate |
| Auto-cycle interval | `25s` | Hardcoded in dashboard |

---

## 6. Running the Project

### Prerequisites

| Tool | Notes |
|---|---|
| Node.js 18+ | |
| [onchainos CLI](https://github.com/okx/onchainos-skills) | `~/.local/bin/onchainos` |
| OKX Agentic Wallet | `onchainos wallet login <email>` |

### Install & Start

```bash
cd smart-money-agent
npm install
npm run dev
# Open http://localhost:3000
```

### Redeploy Contract (optional — already deployed)

```bash
cd contracts
npm install
# Add DEPLOYER_PRIVATE_KEY to .env.local with testnet OKB
# Faucet: https://www.okx.com/xlayer/faucet
npm run deploy:testnet
```

---

## 7. X Layer Ecosystem Positioning

### What This Project Adds to X Layer

**Smart Money Copy Agent** is the first autonomous AI trading agent natively designed for X Layer, combining three pillars:

#### On-chain AI Transparency
Every decision the agent makes — every buy signal, every confidence score, every position close — is written permanently to a smart contract on X Layer Testnet. Traders can audit the agent's full history on OKLink. This is a new paradigm: **AI agents that are not black boxes but publicly verifiable actors on-chain.**

#### Zero-Gas Agent Activity
X Layer's gasless architecture is what makes this possible. Writing every trade log on Ethereum would cost hundreds of dollars per day. On X Layer it costs nothing — enabling high-frequency, on-chain agent transparency that is economically impossible elsewhere.

#### Deep OKX Ecosystem Integration
The agent is built entirely on OKX's Onchain OS skills — OKX DEX for swaps, OKX smart money signals for alpha, OKX security scanning for risk, and OKX Agentic Wallet (TEE-signed) for execution. This makes it a direct showcase of what is uniquely possible when OKX infrastructure meets X Layer.

### Differentiation vs. Existing Copy Trading Platforms

| Feature | Traditional Copy Trading | Smart Money Copy Agent |
|---|---|---|
| Decision transparency | Closed black box | Every decision on-chain, verifiable |
| Latency | Minutes (manual or API) | ~25 seconds (autonomous loop) |
| Risk filtering | Manual or none | AI-scored + security scan |
| Chain | Multi-chain, generic | Native X Layer |
| Gas cost | High on Ethereum | **Zero on X Layer** |
| Wallet custody | Centralized | TEE-secured (OKX Agentic Wallet) |
| Audit trail | Off-chain logs | On-chain smart contract |

### Vision

This project demonstrates that **AI trading agents belong on-chain** — not as off-chain bots that happen to submit transactions, but as transparent, auditable participants whose entire decision history lives on the blockchain. X Layer, with its zero-gas fees and EVM compatibility, is the only chain where this is economically viable today.
