"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  createShareUnlockCookieValue,
  getShareUnlockCookieName,
  getShareUnlockCookieOptions,
  hashShareToken,
  shouldShareLinkBeAccessible,
  verifySharePassword,
} from "@/lib/collaboration";
import { prisma } from "@/lib/prisma";

export async function unlockShareAction(token: string, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const tokenHash = hashShareToken(token);
  const link = await prisma.tripShareLink.findUnique({
    select: {
      expiresAt: true,
      id: true,
      isEnabled: true,
      passwordHash: true,
      revokedAt: true,
      tripId: true,
    },
    where: { tokenHash },
  });
  const access = shouldShareLinkBeAccessible(link);

  if (!link || !access.ok || !link.passwordHash) {
    redirect(`/share/${encodeURIComponent(token)}`);
  }

  const passwordCheck = verifySharePassword(password, link.passwordHash);

  if (!passwordCheck.ok) {
    redirect(`/share/${encodeURIComponent(token)}?unlock=failed`);
  }

  const unlockCookie = createShareUnlockCookieValue({
    passwordHash: link.passwordHash,
    tokenHash,
  });
  const cookieStore = await cookies();

  cookieStore.set(
    getShareUnlockCookieName(tokenHash),
    unlockCookie.value,
    getShareUnlockCookieOptions(unlockCookie.expiresAt),
  );

  redirect(`/share/${encodeURIComponent(token)}`);
}
