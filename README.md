# Smart Money Copy Agent

An autonomous on-chain trading system that detects high-performing "smart money" wallets and automatically replicates their trades using AI-driven filtering, risk management, and execution.

Every trade decision is recorded on-chain via a deployed `TradeLogger` smart contract on **X Layer Testnet (chainId 1952)**, creating a verifiable, tamper-proof audit trail of agent activity.

---

## Quick Start

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ | |
| [Onchain OS CLI](https://github.com/okx/onchainos-skills) | latest | installed at `~/.local/bin/onchainos` |
| OKX Agentic Wallet | — | email login via `onchainos wallet login` |

### Install & Run

```bash
cd smart-money-agent
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Deploy Contracts (already done — address in `.env.local`)

```bash
cd contracts
npm install
npm run deploy:testnet   # deploys TradeLogger to X Layer Testnet (chainId 1952)
```

The deploy script writes the contract address to `lib/deployments.json`, which the app reads automatically.

---

## Environment Variables

All variables live in `.env.local`.

| Variable | Default | Description |
|---|---|---|
| `ONCHAINOS_BIN` | `~/.local/bin/onchainos` | Path to the Onchain OS CLI binary |
| `DEFAULT_CHAIN` | `xlayer` | Chain for market data / signal APIs (OKX APIs support mainnet only) |
| `CONTRACT_CHAIN` | `1952` | Chain ID for smart contract calls — **X Layer Testnet** |
| `TRADE_LOGGER_ADDRESS` | `0xED70F64...` | Deployed `TradeLogger` contract address on X Layer Testnet |
| `DEPLOYER_PRIVATE_KEY` | — | Private key used to deploy contracts (never used at runtime) |
| `POSITION_SIZE_PCT` | `2` | % of portfolio allocated per trade |
| `TAKE_PROFIT_PCT` | `15` | Take-profit target (%) |
| `STOP_LOSS_PCT` | `10` | Stop-loss threshold (%) |
| `DRY_RUN` | `true` | `true` = simulation only; `false` = live swap execution |
| `MIN_CONFIDENCE_SCORE` | `50` | Minimum signal confidence (0–100) required to act |
| `USDC_ADDRESS` | `usdc` | USDC token shorthand or contract address |

> **Live trading is off by default.** Set `DRY_RUN=false` to enable real swap execution.

---

## Chain Configuration

This project uses two X Layer environments:

| Purpose | Network | Chain ID | Transport |
|---|---|---|---|
| Signals, prices, risk scans, swaps | X Layer Mainnet | 196 | OKX API via `onchainos` CLI |
| **TradeLogger contract calls** | **X Layer Testnet** | **1952** | ethers.js → `https://testrpc.xlayer.tech` |

**Why two chains?**
The OKX signal and DEX APIs only index mainnet activity — smart money wallets trade on mainnet, and DEX liquidity exists on mainnet. There is no testnet equivalent for these data sources.

The `TradeLogger` contract is on testnet so all agent activity is logged on-chain for free, with verifiable transactions on the OKLink testnet explorer, without risking real funds.

**Why ethers.js instead of onchainos for the contract?**
The `onchainos` CLI only recognises its 17 supported chains (see `onchainos wallet chains`). Chain 1952 (X Layer Testnet) returns `"unsupported chain: 1952"`. The contract calls therefore go directly through ethers.js `JsonRpcProvider` + `Wallet`, signed with `DEPLOYER_PRIVATE_KEY`.

### Deployed Contracts

| Contract | Address | Network | Explorer |
|---|---|---|---|
| `TradeLogger` | `0xED70F64CBaf79a62297930C2efdEf0A5a4153A7f` | X Layer Testnet (1952) | [View on OKLink](https://www.oklink.com/xlayer-test/address/0xED70F64CBaf79a62297930C2efdEf0A5a4153A7f) |

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Browser / Dashboard                          │
│           http://localhost:3000                                  │
│                                                                  │
│   ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│   │  Dashboard   │  │  /signals page  │  │   /logs page     │   │
│   │  (page.tsx)  │  │ (signals/page)  │  │  (logs/page)     │   │
│   └──────┬───────┘  └────────┬────────┘  └────────┬─────────┘   │
└──────────┼───────────────────┼────────────────────┼─────────────┘
           │                   │                    │
           ▼                   ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Next.js API Layer                            │
│                                                                  │
│  POST /api/agent      → triggers agent cycle                     │
│  GET  /api/agent      → agent statuses                           │
│  GET  /api/signals    → signal list + stats                      │
│  GET  /api/logs       → structured agent logs                    │
│  GET  /api/portfolio  → wallet balance snapshot                  │
│  POST /api/analyze    → one-off token analysis                   │
│  GET  /api/wallet     → wallet login status                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Agent Orchestrator                           │
│               lib/agents/orchestrator.ts                         │
│                                                                  │
│  1. Filters signals by MIN_CONFIDENCE_SCORE                      │
│  2. Picks top 5 by confidence score                              │
│  3. Runs each signal through the full pipeline                   │
│  4. Aggregates results + errors                                  │
└──────┬──────────────┬───────────────────┬────────────────────────┘
       │              │                   │
       ▼              ▼                   ▼
┌──────────┐  ┌────────────────┐  ┌──────────────┐
│  Signal  │  │    Analysis    │  │     Risk     │
│  Agent   │  │    Agent       │  │    Agent     │
│          │  │                │  │              │
│ Queries  │  │ Scores token   │  │ Token scan   │
│ OKX API  │  │ by price/vol/  │  │ honeypot     │
│ signals +│  │ kline/risk     │  │ rug/tax      │
│ tracker  │  │ metadata       │  │ checks       │
└──────────┘  └────────────────┘  └──────────────┘
       │              │                   │
       └──────────────┴───────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Trader Agent                               │
│                  lib/agents/trader-agent.ts                      │
│                                                                  │
│  1. Gets wallet status + portfolio balance                        │
│  2. Sizes position (POSITION_SIZE_PCT % of portfolio)            │
│  3. Gets swap quote                                              │
│  4. Executes swap (or simulates if DRY_RUN=true)                 │
│  5. Records trade in SQLite                                      │
│  6. Calls logTradeOnChain() → TradeLogger contract               │
└───────────────────────┬──────────────────────────────────────────┘
                        │
           ┌────────────┴─────────────┐
           ▼                          ▼
┌─────────────────────┐  ┌────────────────────────────────────────┐
│   Onchain OS CLI    │  │          TradeLogger Contract          │
│  (onchainos binary) │  │   0xED70F64CBaf79a62297930C2efdEf0A5a4153A7f  │
│                     │  │   X Layer Testnet (chainId 1952)       │
│  swap execute       │  │                                        │
│  wallet balance     │  │  logTrade(symbol, chain, action,       │
│  token price-info   │  │    amountUsdCents, confidence, status) │
│  security scan      │  │                                        │
│  market kline       │  │  Emits TradeLogged event on-chain      │
│  signal list        │  │  Queryable via getRecentTrades(n)      │
└─────────────────────┘  └────────────────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│  SQLite Database    │
│  data/trading.db    │
│                     │
│  signals            │
│  trades             │
│  agents             │
│  agent_logs         │
└─────────────────────┘
```

---

## Agent Pipeline (Step by Step)

### Step 1 — Signal Agent (`lib/agents/signal-agent.ts`)

**Input**: None (pulls live data)  
**Output**: `Signal[]`

- Calls `onchainos signal list --chain xlayer` → fetches aggregated buy signals from OKX's smart money index
- Calls `onchainos tracker activities --tracker-type smart_money --chain xlayer --trade-type 1` → raw buy activity from tracked wallets
- Groups tracker activities by token address to detect **consensus** (2+ smart wallets buying the same token)
- Computes a `confidenceScore` (0–100) for each signal using:
  - `triggerCount × 10` — more wallets buying = higher confidence (max 40 pts)
  - `(100 - soldRatioPercent) × 0.3` — smart money still holding = bullish (max 30 pts)
  - Wallet type bonus: Smart Money +20, Whale +15, KOL +10
  - Buy amount bonus: >$100k +10, >$10k +5
- Filters out signals below score 20 or missing token address
- Persists all qualifying signals to `signals` table

### Step 2 — Analysis Agent (`lib/agents/analysis-agent.ts`)

**Input**: `Signal`  
**Output**: `AnalysisResult` with `recommendation: "buy" | "watch" | "skip"`

Starts from a base score of 50 and applies deltas:

| Check | Condition | Delta |
|---|---|---|
| Price change | `priceChange24h > 5%` (late entry) | −20 |
| Price change | `0 < priceChange24h ≤ 5%` | +10 |
| Liquidity | `< $50k` | −15 |
| Liquidity | `≥ $50k` | +10 |
| Volume 24h | `< $10k` | −10 |
| Volume 24h | `$10k–$100k` | +5 |
| Volume 24h | `> $100k` | +15 |
| Kline trend | Last 3 × 15m candles ascending | +10 |
| Kline trend | Mixed | −5 |
| Signal confidence | `signal.confidenceScore × 0.2` | +0–20 |
| Trigger count | `≥ 3 wallets` | notes "strong consensus" |
| Risk level | `high` | −25 |
| Risk level | `low` | +10 |

Final score clamped to [0, 100]:
- `≥ 60` → **buy**
- `40–59` → **watch** (not traded)
- `< 40` → **skip**

Data sources: `token price-info`, `market kline --bar 15m`, `token advanced-info`

### Step 3 — Risk Agent (`lib/agents/risk-agent.ts`)

**Input**: `AnalysisResult`  
**Output**: `{ passed: boolean, riskScore: number, flags: string[] }`

Runs `onchainos security token-scan` and evaluates:

| Flag | Risk Score Added |
|---|---|
| Honeypot detected | +100 (instant fail) |
| Cannot sell | +80 |
| Sell tax > 10% | +30 |
| Sell tax 5–10% | +10 |
| Mintable (rug risk) | +20 |
| Blacklist function | +15 |
| Not open source | +25 |
| High risk from metadata | +30 |

Trade proceeds only if `riskScore < 50`. Any score ≥ 50 blocks execution.

### Step 4 — Trader Agent (`lib/agents/trader-agent.ts`)

**Input**: `AnalysisResult`, `signalId`, `dryRun`, `confidenceScore`  
**Output**: `Trade | null`

1. Checks wallet login via `onchainos wallet status`
2. Fetches portfolio balance via `onchainos wallet balance --chain xlayer`
3. Calculates trade amount: `totalUsd × POSITION_SIZE_PCT / 100` (min $10)
4. Gets a swap quote: `onchainos swap quote --from usdc --to <tokenAddress> --readable-amount <amt> --chain xlayer`
5. **If `DRY_RUN=true` or not logged in** → records a `simulated` trade, skips broadcast
6. **If `DRY_RUN=false` and logged in** → executes `onchainos swap execute` and captures `txHash`
7. Saves trade record to SQLite `trades` table
8. Calls `logTradeOnChain()` → encodes ABI calldata for `TradeLogger.logTrade()` and fires `onchainos wallet contract-call --chain 1952`

### On-Chain Logging (`lib/tradeLogger.ts`)

After every trade (real or simulated), the agent logs it to the `TradeLogger` contract on X Layer Testnet:

```
logTrade(
  tokenSymbol:     string,   // e.g. "OKB"
  chain:           string,   // e.g. "xlayer"
  action:          string,   // "buy" | "sell"
  amountUsdCents:  uint256,  // USD × 100 (avoids floats)
  confidenceScore: uint256,  // 0–100
  status:          string    // "executed" | "simulated" | "failed"
)
```

- ABI encoding done client-side via `ethers` (`AbiCoder` + `id()` for selector)
- Transaction signed and broadcast by the OKX Agentic Wallet (TEE — private key never exposed)
- Emits `TradeLogged(id, tokenSymbol, action, amountUsdCents, confidenceScore, status, timestamp)` event
- Queryable on-chain via `getRecentTrades(n)` or `getTrade(id)`
- Fire-and-forget — never blocks the trade pipeline; errors are logged and swallowed

---

## Smart Contract

### `TradeLogger.sol`

Located at `contracts/contracts/TradeLogger.sol`.

```solidity
struct TradeRecord {
    string  tokenSymbol;
    string  chain;
    string  action;           // "buy" | "sell"
    uint256 amountUsdCents;   // USD * 100
    uint256 confidenceScore;  // 0–100
    string  status;           // "executed" | "simulated" | "failed"
    uint256 timestamp;        // block.timestamp
}

event TradeLogged(
    uint256 indexed id,
    string  tokenSymbol,
    string  action,
    uint256 amountUsdCents,
    uint256 confidenceScore,
    string  status,
    uint256 timestamp
);

function logTrade(...) external returns (uint256 id)
function tradeCount() external view returns (uint256)
function getTrade(uint256 id) external view returns (TradeRecord memory)
function getRecentTrades(uint256 n) external view returns (TradeRecord[] memory)
```

### Hardhat Config (`contracts/hardhat.config.ts`)

| Setting | Value |
|---|---|
| Solidity | 0.8.24 |
| Network | X Layer Testnet |
| Chain ID | 1952 |
| RPC | `https://testrpc.xlayer.tech` |
| Optimizer | enabled, 200 runs |

### Deploying

```bash
# 1. Add your private key (needs testnet OKB)
echo "DEPLOYER_PRIVATE_KEY=0x..." >> .env.local

# 2. Get testnet OKB
#    https://www.okx.com/xlayer/faucet

# 3. Deploy
cd contracts && npm run deploy:testnet
```

The deploy script auto-writes `lib/deployments.json` with the contract address — the app reads this file on startup if `TRADE_LOGGER_ADDRESS` is not set.

---

## Data Layer

SQLite database auto-created at `data/trading.db` on first run (via `better-sqlite3`).

### Tables

#### `signals`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT | UUID |
| `token` | TEXT | Token symbol |
| `tokenAddress` | TEXT | Contract address |
| `chain` | TEXT | Chain identifier |
| `walletType` | TEXT | Smart Money / KOL / Whale |
| `amountUsd` | REAL | Buy amount in USD |
| `triggerCount` | INTEGER | Number of wallets that triggered |
| `priceAtSignal` | REAL | Token price when signal fired |
| `soldRatioPercent` | REAL | % already sold by triggering wallets |
| `confidenceScore` | INTEGER | 0–100 computed score |
| `timestamp` | INTEGER | Unix ms |

#### `trades`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT | UUID |
| `token` | TEXT | Token symbol |
| `tokenAddress` | TEXT | Contract address |
| `chain` | TEXT | Chain |
| `action` | TEXT | `buy` or `sell` |
| `amountUsd` | REAL | Trade size in USD |
| `price` | REAL | Execution price |
| `txHash` | TEXT | On-chain tx hash (if executed) |
| `pnl` | REAL | Realized PnL (updated later) |
| `status` | TEXT | `executed` / `simulated` / `failed` |
| `signalId` | TEXT | FK → signals.id |
| `timestamp` | INTEGER | Unix ms |

#### `agents`
| Column | Type | Description |
|---|---|---|
| `id` | TEXT | Agent identifier |
| `type` | TEXT | signal / analysis / risk / trader |
| `status` | TEXT | idle / running / error |
| `lastRun` | INTEGER | Unix ms |
| `lastResult` | TEXT | Human-readable last outcome |

#### `agent_logs`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER | Auto-increment |
| `agent` | TEXT | Agent name |
| `level` | TEXT | info / warn / error |
| `message` | TEXT | Log message |
| `data` | TEXT | JSON payload (optional) |
| `timestamp` | INTEGER | Unix ms |

---

## Key Source Files

| Path | Purpose |
|---|---|
| `lib/onchainos.ts` | Typed wrappers around every `onchainos` CLI command used |
| `lib/db.ts` | SQLite schema creation + query helpers (better-sqlite3) |
| `lib/tradeLogger.ts` | ABI-encodes `logTrade()` calldata and calls it via onchainos wallet |
| `lib/deployments.json` | Auto-generated after deploy — stores contract address + metadata |
| `lib/agents/orchestrator.ts` | Main pipeline coordinator; enforces confidence threshold; runs top 5 signals |
| `lib/agents/signal-agent.ts` | Fetches + scores smart money signals from OKX API |
| `lib/agents/analysis-agent.ts` | Scores tokens by price/volume/kline/risk metadata |
| `lib/agents/risk-agent.ts` | Token security scan; blocks honeypots and rug risks |
| `lib/agents/trader-agent.ts` | Executes (or simulates) swaps; logs trades on-chain |
| `contracts/contracts/TradeLogger.sol` | Solidity contract storing trade records on X Layer Testnet |
| `contracts/hardhat.config.ts` | Hardhat config targeting X Layer Testnet (chainId 1952) |
| `contracts/scripts/deploy.ts` | Deploy script — writes address to `lib/deployments.json` |
| `app/api/agent/route.ts` | `GET` agent statuses / `POST` trigger a cycle |
| `app/api/signals/route.ts` | Signal list + aggregate stats |
| `app/api/logs/route.ts` | Structured log history |
| `app/api/portfolio/route.ts` | Wallet balance snapshot |
| `app/page.tsx` | Main dashboard (stats, agent cards, pipeline view) |
| `app/signals/page.tsx` | Signal feed with confidence scores |
| `app/logs/page.tsx` | Live agent log viewer |

---

## Onchain OS CLI Commands Used

| Command | Agent | Purpose |
|---|---|---|
| `signal list --chain xlayer` | Signal | Aggregated smart money buy signals |
| `tracker activities --tracker-type smart_money` | Signal | Raw wallet activity feed |
| `token price-info --address <addr> --chain xlayer` | Analysis | Price, market cap, liquidity, volume |
| `token advanced-info --address <addr> --chain xlayer` | Analysis | Risk level metadata |
| `market kline --address <addr> --bar 15m` | Analysis | 15-minute candlestick data |
| `security token-scan --address <addr> --chain xlayer` | Risk | Honeypot, rug pull, tax detection |
| `swap quote --from usdc --to <addr> --readable-amount <n>` | Trader | Pre-trade price quote |
| `swap execute --from usdc --to <addr> ...` | Trader | Live DEX swap execution |
| `wallet status` | Trader | Login state + account info |
| `wallet balance --chain xlayer` | Trader | Portfolio value for position sizing |
| `wallet contract-call --to <contract> --chain 1952 --input-data <calldata>` | TradeLogger | On-chain trade audit log |
| `portfolio all-balances --address <addr>` | Portfolio API | Multi-chain balance snapshot |

---

## Trading Parameters

| Parameter | Value |
|---|---|
| Signal chain | X Layer Mainnet (chainId 196) |
| Contract chain | **X Layer Testnet (chainId 1952)** |
| Position size | 2% of portfolio per trade |
| Take profit | +15% |
| Stop loss | −10% |
| Max signals per cycle | 5 (top by confidence score) |
| Min confidence to trade | 50 / 100 |
| Execution mode | Simulation (`DRY_RUN=true` by default) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Recharts |
| Backend | Next.js API routes, better-sqlite3 |
| Blockchain (market data) | Onchain OS CLI → OKX API → X Layer Mainnet |
| Blockchain (contracts) | Hardhat + Ethers v6 → X Layer Testnet (chainId 1952) |
| Contract signing | OKX Agentic Wallet (TEE — key never exposed) |
| Language | TypeScript (strict) |
