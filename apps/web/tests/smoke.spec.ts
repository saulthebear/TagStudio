import { expect, test } from "@playwright/test";

test("renders web foundation shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TagStudio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Library" })).toBeVisible();
});
