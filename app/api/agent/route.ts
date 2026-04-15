import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle } from "@/lib/agents/orchestrator";
import { getAgents } from "@/lib/db";

export async function GET() {
  try {
    const agents = getAgents();
    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { action?: string };
    const action = body.action ?? "run";

    if (action === "run") {
      const result = await runAgentCycle();
      console.log(['result', result])
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
