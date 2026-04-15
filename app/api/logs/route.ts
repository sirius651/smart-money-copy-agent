import { NextResponse } from "next/server";
import { getTrades, getAgentLogs } from "@/lib/db";

export async function GET() {
  try {
    const trades = getTrades(100);
    const logs = getAgentLogs(200);
    return NextResponse.json({ trades, logs });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
