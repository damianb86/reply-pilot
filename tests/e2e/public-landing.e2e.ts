import { expect, test } from "@playwright/test";

test("public landing explains how to open Reply Pulse AI: Review Replies securely", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Reply Pulse AI: Review Replies" })).toBeVisible();
  await expect(page.getByText("AI drafts for Judge.me reviews")).toBeVisible();
  await expect(page.getByText("Open Reply Pulse AI: Review Replies from Shopify Admin")).toBeVisible();
});

test("public landing is readable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Reply Pulse AI: Review Replies" })).toBeVisible();
  await expect(page.getByText("Review queue")).toBeVisible();
});
