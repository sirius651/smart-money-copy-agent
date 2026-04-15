import { NextResponse } from "next/server";
import { getWalletStatus } from "@/lib/onchainos";
import { getStats } from "@/lib/db";
import { getTestnetBalance } from "@/lib/tradeLogger";

export async function GET() {
  try {
    const [statusResult, testnetBalance, stats] = await Promise.all([
      getWalletStatus(),
      getTestnetBalance(),
      Promise.resolve(getStats()),
    ]);

    return NextResponse.json({
      status: statusResult.data,
      // Testnet balance (OKB on X Layer Testnet chain 1952)
      balance: testnetBalance
        ? { totalValueUsd: testnetBalance.usd, okb: testnetBalance.okb, address: testnetBalance.address, network: "X Layer Testnet" }
        : null,
      stats,
      walletConnected: statusResult.ok,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
