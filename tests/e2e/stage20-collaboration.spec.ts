import { createHash } from "node:crypto";

import { PrismaClient, type TripMemberRole } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

const prisma = new PrismaClient();

const adminUsername = process.env.INITIAL_ADMIN_USERNAME ?? "admin";
const adminPassword =
  process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-before-use";
const memberPassword = "stage20-collab-password";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("administrator can invite members and enforce trip/share isolation", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = Date.now();
  const viewerUsername = `viewer-${suffix}`;
  const editorUsername = `editor-${suffix}`;
  const originalTitle = `Stage20 collaboration ${suffix}`;
  const editedTitle = `Stage20 collaboration edited ${suffix}`;
  const publicDocumentTitle = `Stage20 public document ${suffix}`;
  const sensitiveDocumentTitle = `Stage20 sensitive passport ${suffix}`;
  const bookingReference = `ORDER-STAGE20-SECRET-${suffix}`;

  await loginAs(page, adminUsername, adminPassword);
  await createUserThroughUi(page, viewerUsername, "Stage20 Viewer");
  await createUserThroughUi(page, editorUsername, "Stage20 Editor");

  const admin = await findUserOrThrow(adminUsername);
  const viewer = await findUserOrThrow(viewerUsername);
  const editor = await findUserOrThrow(editorUsername);

  expect(viewer.role).toBe("USER");
  expect(editor.role).toBe("USER");

  const trip = await prisma.trip.create({
    data: {
      description: "A collaborative trip shared with limited public details.",
      mainDestination: "Kyoto",
      members: {
        create: {
          canDownloadSensitiveDocuments: true,
          role: "OWNER",
          userId: admin.id,
        },
      },
      places: {
        create: {
          address: "1 Test Hotel Road",
          name: `Stage20 hotel ${suffix}`,
          stayDetail: {
            create: {
              bookingReference,
              bookingStatus: "RESERVED",
            },
          },
          type: "HOTEL",
        },
      },
      documents: {
        create: [
          {
            filePath: `stage20/public-${suffix}.txt`,
            isSensitive: false,
            mimeType: "text/plain",
            originalFileName: `public-${suffix}.txt`,
            title: publicDocumentTitle,
            type: "OTHER",
          },
          {
            filePath: `stage20/passport-${suffix}.pdf`,
            isSensitive: true,
            mimeType: "application/pdf",
            originalFileName: `passport-${suffix}.pdf`,
            title: sensitiveDocumentTitle,
            type: "PASSPORT",
          },
        ],
      },
      status: "PLANNING",
      title: originalTitle,
    },
  });

  await page.goto(`/trips/${trip.id}/members`);
  await addMemberThroughUi(page, trip.id, viewerUsername, "VIEWER");
  await addMemberThroughUi(page, trip.id, editorUsername, "EDITOR");

  await expect
    .poll(() =>
      prisma.tripMember.count({
        where: { role: "VIEWER", tripId: trip.id, userId: viewer.id },
      }),
    )
    .toBe(1);
  await expect
    .poll(() =>
      prisma.tripMember.count({
        where: { role: "EDITOR", tripId: trip.id, userId: editor.id },
      }),
    )
    .toBe(1);

  await loginAs(page, viewerUsername, memberPassword);
  await page.goto(`/trips/${trip.id}`);
  await expect(page.getByRole("heading", { name: originalTitle })).toBeVisible();
  await expect(page.getByTestId("edit-trip-link")).toHaveCount(0);
  await expect(page.getByTestId("trip-members-link")).toHaveCount(0);

  await page.goto(`/trips/${trip.id}/edit`);
  await expect(page).toHaveURL(
    new RegExp(`/trips/${escapeRegExp(trip.id)}(\\?.*)?$`),
  );
  await expect(page.getByTestId("trip-edit-form")).toHaveCount(0);
  await expect
    .poll(() =>
      prisma.auditLog.count({
        where: {
          action: "trip.permission_denied",
          entityId: trip.id,
          userId: viewer.id,
        },
      }),
    )
    .toBeGreaterThan(0);

  await loginAs(page, editorUsername, memberPassword);
  await page.goto(`/trips/${trip.id}/edit`);
  await expect(page.getByTestId("trip-edit-form")).toBeVisible();
  await page.getByTestId("trip-form").locator('input[name="title"]').fill(editedTitle);
  await page.getByTestId("trip-form").locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/trips/${escapeRegExp(trip.id)}$`));
  await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();
  await expect
    .poll(async () => {
      const updatedTrip = await prisma.trip.findUnique({
        select: { title: true },
        where: { id: trip.id },
      });

      return updatedTrip?.title;
    })
    .toBe(editedTitle);

  await loginAs(page, adminUsername, adminPassword);
  await page.goto(`/trips/${trip.id}/members`);
  const shareUrl = await createShareLinkThroughUi(page, trip.id, suffix);

  await page.goto(shareUrl.pathname);
  await expect(page.getByTestId("public-share-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();
  await expect(page.locator("body")).toContainText(publicDocumentTitle);
  await expect(page.locator("body")).not.toContainText(sensitiveDocumentTitle);
  await expect(page.locator("body")).not.toContainText(bookingReference);
  await expect(page.getByTestId("edit-trip-link")).toHaveCount(0);

  await prisma.tripShareLink.update({
    data: { expiresAt: new Date(Date.now() - 60_000) },
    where: { tokenHash: hashShareToken(extractShareToken(shareUrl)) },
  });

  await page.goto(shareUrl.pathname);
  await expect(page.getByTestId("share-denied-page")).toBeVisible();
  await expect(page.getByTestId("public-share-page")).toHaveCount(0);
});

async function loginAs(page: Page, username: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/login") &&
      response.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').click();

  const response = await responsePromise;

  if (!response.ok()) {
    throw new Error(
      `Login failed for ${username}: ${response.status()} ${await response.text()}`,
    );
  }

  await page.waitForURL(/\/dashboard$/, { timeout: 10_000 });
}

async function createUserThroughUi(
  page: Page,
  username: string,
  displayName: string,
) {
  await page.goto("/settings/users");
  const form = page.getByTestId("create-user-form");

  await expect(form).toBeVisible();
  await form.locator('input[name="username"]').fill(username);
  await form.locator('input[name="displayName"]').fill(displayName);
  await form.locator('input[name="password"]').fill(memberPassword);
  await form.locator('button[type="submit"]').click();

  await expect(page.getByText(username, { exact: true })).toBeVisible();
}

async function addMemberThroughUi(
  page: Page,
  tripId: string,
  username: string,
  role: TripMemberRole,
) {
  await page.goto(`/trips/${tripId}/members`);
  const form = page.getByTestId("add-trip-member-form");

  await expect(form).toBeVisible();
  await form.locator('input[name="username"]').fill(username);
  await form.locator('select[name="role"]').selectOption(role);
  await form.locator('button[type="submit"]').click();

  await expect(page.getByText(`@${username}`)).toBeVisible();
}

async function createShareLinkThroughUi(
  page: Page,
  tripId: string,
  suffix: number,
) {
  await page.goto(`/trips/${tripId}/members`);
  const form = page.getByTestId("create-share-link-form");

  await expect(form).toBeVisible();
  await form.locator('input[name="label"]').fill(`Stage20 share ${suffix}`);
  await form.locator('input[name="isEnabled"]').check();
  await form.locator('button[type="submit"]').click();

  const shareCode = page.locator("code").filter({ hasText: /\/share\// }).first();
  await expect(shareCode).toBeVisible();

  const rawUrl = (await shareCode.textContent())?.trim();

  if (!rawUrl) {
    throw new Error("Share link was not rendered after creation.");
  }

  return new URL(rawUrl, page.url());
}

async function findUserOrThrow(username: string) {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    throw new Error(`Expected user ${username} to exist.`);
  }

  return user;
}

function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function extractShareToken(url: URL): string {
  const token = url.pathname.split("/").filter(Boolean).at(-1);

  if (!token) {
    throw new Error(`Could not parse share token from ${url.pathname}.`);
  }

  return token;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
