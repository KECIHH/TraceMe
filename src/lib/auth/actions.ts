"use server";

import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit";
import { deleteCurrentSession, getCurrentUser } from "@/lib/auth/session";

export async function logoutAction() {
  const user = await getCurrentUser();
  await deleteCurrentSession();
  await writeAuditLog({ action: "logout", userId: user?.id });
  redirect("/login");
}
