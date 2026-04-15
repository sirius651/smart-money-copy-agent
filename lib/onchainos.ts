import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const ONCHAINOS_BIN = process.env.ONCHAINOS_BIN ?? "onchainos";
const DEFAULT_CHAIN = process.env.DEFAULT_CHAIN ?? "xlayer";
const EXEC_TIMEOUT = 30000;

export interface OnchainOsResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  raw?: string;
}

async function run<T = unknown>(args: string): Promise<OnchainOsResult<T>> {
  const cmd = `${ONCHAINOS_BIN} ${args}`;
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: EXEC_TIMEOUT,
      env: { ...process.env },
    });
    const output = stdout.trim();
    if (!output) {
      return { ok: false, error: stderr || "Empty output", raw: stderr };
    }
    try {
      const data = JSON.parse(output) as T;
      return { ok: true, data, raw: output };
    } catch {
      return { ok: true, data: output as unknown as T, raw: output };
    }
  } catch (err: unknown) {
    const error = err as { message?: string; stdout?: string; stderr?: string };
    return {
      ok: false,
      error: error.message ?? "Command failed",
      raw: error.stderr ?? error.stdout,
    };
  }
}

// Signal & Leaderboard
export async function getSignalList(chain = DEFAULT_CHAIN) {
  return run(`signal list --chain ${chain}`);
}

export async function getLeaderboard(
  chain = DEFAULT_CHAIN,
  timeFrame = 3,
  sortBy = 1
) {
  return run(
    `leaderboard list --chain ${chain} --time-frame ${timeFrame} --sort-by ${sortBy}`
  );
}

export async function getTrackerActivities(trackerType = "smart_money", chain?: string) {
  const chainArg = chain ? `--chain ${chain}` : "";
  return run(
    `tracker activities --tracker-type ${trackerType} ${chainArg} --trade-type 1`
  );
}

// Token Data
export async function getTokenPriceInfo(address: string, chain = DEFAULT_CHAIN) {
  return run(`token price-info --address ${address} --chain ${chain}`);
}

export async function searchToken(query: string, chains = "196") {
  return run(`token search --query ${query} --chains ${chains}`);
}

export async function getHotTokens(chain?: string) {
  const chainArg = chain ? `--chain ${chain}` : "";
  return run(`token hot-tokens ${chainArg}`);
}

export async function getTokenAdvancedInfo(address: string, chain = DEFAULT_CHAIN) {
  return run(`token advanced-info --address ${address} --chain ${chain}`);
}

// Market Data
export async function getMarketPrice(address: string, chain = DEFAULT_CHAIN) {
  return run(`market price --address ${address} --chain ${chain}`);
}

export async function getKline(address: string, chain = DEFAULT_CHAIN, bar = "1H") {
  return run(`market kline --address ${address} --chain ${chain} --bar ${bar}`);
}

// Security
export async function scanToken(address: string, chain = DEFAULT_CHAIN) {
  return run(`security token-scan --address ${address} --chain ${chain}`);
}

export async function simulateTx(txData: string, chain = DEFAULT_CHAIN) {
  return run(`gateway simulate --tx-data '${txData}' --chain ${chain}`);
}

// Swap & Portfolio
export async function getSwapQuote(params: {
  from: string;
  to: string;
  amount: string;
  chain?: string;
}) {
  const chain = params.chain ?? DEFAULT_CHAIN;
  return run(
    `swap quote --from ${params.from} --to ${params.to} --readable-amount ${params.amount} --chain ${chain}`
  );
}

export async function executeSwap(params: {
  from: string;
  to: string;
  amount: string;
  wallet: string;
  chain?: string;
  slippage?: number;
}) {
  const chain = params.chain ?? DEFAULT_CHAIN;
  const slippageArg = params.slippage ? `--slippage ${params.slippage}` : "";
  return run(
    `swap execute --from ${params.from} --to ${params.to} --readable-amount ${params.amount} --chain ${chain} --wallet ${params.wallet} ${slippageArg}`
  );
}

export async function getWalletStatus() {
  return run(`wallet status`);
}

export async function getWalletBalance(chain = DEFAULT_CHAIN) {
  return run(`wallet balance --chain ${chain}`);
}

export async function getPortfolioBalance(address: string, chains = "196") {
  return run(`portfolio all-balances --address ${address} --chains ${chains}`);
}

export async function getPortfolioValue(address: string, chains = "196") {
  return run(`portfolio total-value --address ${address} --chains ${chains}`);
}
