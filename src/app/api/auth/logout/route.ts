import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { deleteCurrentSession, getCurrentUser } from "@/lib/auth/session";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  await deleteCurrentSession();
  await writeAuditLog({
    action: "logout",
    request,
    userId: user?.id,
  });

  return NextResponse.json({ ok: true });
}
