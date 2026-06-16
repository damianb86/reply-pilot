import { expect, test } from "@playwright/test";

test("public landing explains how to open ReplyPulse securely", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Reply Pulse AI: Review Replies" })).toBeVisible();
  await expect(page.getByText("AI drafts for connected review platforms")).toBeVisible();
  await expect(page.getByText("Open ReplyPulse from Shopify Admin")).toBeVisible();
});

test("public landing is readable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Reply Pulse AI: Review Replies" })).toBeVisible();
  await expect(page.getByText("Review queue")).toBeVisible();
});
