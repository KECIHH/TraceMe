import { expect, test } from "@playwright/test";

test("home page opens", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "个人自用旅行规划网站" }),
  ).toBeVisible();
});
