import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getWalletStatus } from "@/lib/onchainos";

const execAsync = promisify(exec);
const ONCHAINOS_BIN = process.env.ONCHAINOS_BIN ?? "onchainos";

async function getWalletAddress(): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`${ONCHAINOS_BIN} wallet addresses --chain xlayer`, { timeout: 10000 });
    const result = JSON.parse(stdout.trim());
    const xlayerAddrs = result?.data?.xlayer ?? [];
    if (xlayerAddrs.length > 0) {
      return xlayerAddrs[0].address;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function GET() {
  const result = await getWalletStatus();

  if (!result.ok) {
    return NextResponse.json({
      loggedIn: false,
      error: result.error
    });
  }

  const rawData = result.data as Record<string, unknown>;
  // CLI returns { ok, data: {...} } structure
  const data = (rawData?.data ?? rawData) as Record<string, unknown>;
  const loggedIn = data?.loggedIn ?? false;

  // Fetch address if logged in
  let address: string | null = null;
  if (loggedIn) {
    address = await getWalletAddress();
  }

  return NextResponse.json({
    loggedIn,
    email: data?.email ?? "",
    accountCount: data?.accountCount ?? 0,
    currentAccountId: data?.currentAccountId ?? "",
    currentAccountName: data?.currentAccountName ?? "",
    address,
  });
}
