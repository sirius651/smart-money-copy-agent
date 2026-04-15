import { NextResponse } from "next/server";
import { getWalletBalance } from "@/lib/onchainos";

const DEFAULT_CHAIN = process.env.DEFAULT_CHAIN ?? "xlayer";

export async function GET() {
  const result = await getWalletBalance(DEFAULT_CHAIN);
  
  if (!result.ok) {
    return NextResponse.json({ 
      totalValueUsd: "0.00",
      tokens: [],
      error: result.error 
    });
  }

  const rawData = result.data as Record<string, unknown>;
  // CLI returns { ok, data: {...} } structure
  const data = (rawData?.data ?? rawData) as Record<string, unknown>;
  
  const details = (data?.details ?? []) as Array<{ tokenAssets?: Array<Record<string, unknown>> }>;
  const tokens = details.flatMap(d => d.tokenAssets ?? []).map(t => ({
    symbol: t.symbol ?? t.tokenSymbol ?? "???",
    balance: t.balance ?? t.amount ?? "0",
    balanceUsd: t.balanceUsd ?? t.valueUsd ?? "0",
  }));

  return NextResponse.json({
    totalValueUsd: data?.totalValueUsd ?? "0.00",
    tokens,
    chain: DEFAULT_CHAIN,
  });
}
