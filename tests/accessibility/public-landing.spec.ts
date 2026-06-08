import AxeCoreBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public landing has no obvious axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ReplyPulse AI: Review Replies" })).toBeVisible();

  const results = await new AxeCoreBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
