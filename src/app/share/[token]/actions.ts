"use server";

import { redirect } from "next/navigation";

export async function unlockShareAction(token: string, formData: FormData) {
  const password = String(formData.get("password") ?? "");

  redirect(
    `/share/${encodeURIComponent(token)}?password=${encodeURIComponent(password)}`,
  );
}
