import { NextResponse } from "next/server";
import { getSignals, getStats } from "@/lib/db";

export async function GET() {
  try {
    const signals = getSignals(50);
    const stats = getStats();
    return NextResponse.json({ signals, stats });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
