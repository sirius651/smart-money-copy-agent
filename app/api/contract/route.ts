import { NextResponse } from "next/server";
import { getOnChainTradeCount } from "@/lib/tradeLogger";

const CONTRACT_ADDRESS = process.env.TRADE_LOGGER_ADDRESS ?? null;
const EXPLORER_BASE = "https://www.oklink.com/xlayer-test";

export async function GET() {
  const tradeCount = await getOnChainTradeCount();
  return NextResponse.json({
    contract: CONTRACT_ADDRESS,
    network: "X Layer Testnet",
    chainId: 1952,
    tradeCount,
    explorerUrl: CONTRACT_ADDRESS
      ? `${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`
      : null,
  });
}
