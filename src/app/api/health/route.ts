import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  const databaseConnected = await isDatabaseConnected();

  return NextResponse.json(buildHealthPayload(databaseConnected), {
    status: getHealthStatusCode(databaseConnected),
  });
}

async function isDatabaseConnected() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export function buildHealthPayload(databaseConnected: boolean, now = new Date()) {
  return {
    status: databaseConnected ? "ok" : "degraded",
    timestamp: now.toISOString(),
    version: process.env.APP_VERSION ?? process.env.npm_package_version ?? "0.1.0",
    database: {
      connected: databaseConnected,
    },
  };
}

export function getHealthStatusCode(databaseConnected: boolean) {
  return databaseConnected ? 200 : 503;
}
