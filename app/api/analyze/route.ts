import { NextRequest, NextResponse } from "next/server";
import { analyzeToken } from "@/lib/agents/analysis-agent";
import type { Signal } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<Signal>;

    if (!body.tokenAddress || !body.token) {
      return NextResponse.json(
        { error: "tokenAddress and token are required" },
        { status: 400 }
      );
    }

    const signal: Signal = {
      id: body.id ?? "manual",
      token: body.token,
      tokenAddress: body.tokenAddress,
      chain: body.chain ?? process.env.DEFAULT_CHAIN ?? "xlayer",
      walletType: body.walletType ?? "Smart Money",
      amountUsd: body.amountUsd ?? 0,
      triggerCount: body.triggerCount ?? 1,
      priceAtSignal: body.priceAtSignal ?? 0,
      soldRatioPercent: body.soldRatioPercent ?? 0,
      confidenceScore: body.confidenceScore ?? 50,
      timestamp: Date.now(),
    };

    const analysis = await analyzeToken(signal);
    return NextResponse.json(analysis);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
