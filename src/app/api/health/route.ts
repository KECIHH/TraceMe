import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "traceme",
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? process.env.npm_package_version ?? "0.1.0",
  });
}
