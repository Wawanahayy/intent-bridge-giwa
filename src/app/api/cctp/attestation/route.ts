import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash");
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  const base =
    process.env.NEXT_PUBLIC_CCTP_ATTESTATION_BASE_URL ||
    "https://iris-api-sandbox.circle.com/v1/attestations/";

  try {
    const res = await fetch(`${base}${hash}`, { cache: "no-store" });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
