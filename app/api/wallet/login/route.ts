import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const ONCHAINOS_BIN = process.env.ONCHAINOS_BIN ?? "onchainos";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email required" }, { status: 400 });
    }

    const cmd = `${ONCHAINOS_BIN} wallet login "${email}"`;
    await execAsync(cmd, { timeout: 30000 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err as { message?: string; stderr?: string };
    return NextResponse.json({
      ok: false,
      error: error.stderr || error.message || "Login failed"
    });
  }
}
