"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { setAiEnabledByUserSetting } from "@/server/services/ai/settings";

export async function setAiEnabledAction(formData: FormData) {
  await requireUser();
  await setAiEnabledByUserSetting(formData.get("enabled") === "true");
  revalidatePath("/settings");
}
