import { expect, test } from "@playwright/test";

test("renders web foundation shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TagStudio Web Foundation" })).toBeVisible();
});
