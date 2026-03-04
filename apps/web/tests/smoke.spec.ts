import { expect, test, type Route } from "@playwright/test";

const API_BASE_URL = "http://127.0.0.1:5987";

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Y0XcAAAAASUVORK5CYII=";
const TINY_MP4_BASE64 = [
  "AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVlAAAAKW1kYXQAAAGzABAHAAABthBj8YsbfgAAAbZQ8fN/AAABtlFh838AAANgbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAHgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAot0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAHgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAgAAAAIAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAB4AAAAAAABAAAAAAIDbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAABgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABrm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAW5zdGJsAAAA6nN0c2QAAAAAAAAAAQAAANptcDR2AAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAgACABIAAAASAAAAAAAAAABE0xhdmM2Mi4xMS4xMDAgbXBlZzQAAAAAAAAAAAAAAAAAGP//AAAAYGVzZHMAAAAAA4CAgE8AAQAEgICAQSARAAAAAAMNQAAACJgFgICALwAAAbABAAABtYkTAAABAAAAASAAxI2IAM0ARAEUYwAAAbJMYXZjNjIuMTEuMTAwBoCAgAECAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAADDUAAAAiYAAAAGHN0dHMAAAAAAAAAAQAAAAMAAAIAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAMAAAABAAAAIHN0c3oAAAAAAAAAAAAAAAMAAAARAAAACAAAAAgAAAAUc3RjbwAAAAAAAAABAAAALAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjIuMy4xMDA="
].join("");

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload)
  });
}

test("renders web foundation shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TagStudio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Library" })).toBeVisible();
});

test("renders normalized image/video media tiles and falls back on media errors", async ({ page }) => {
  const entries = [
    { id: 201, path: "images/sample-webp.webp", filename: "sample-webp.webp", suffix: "webp", tag_ids: [] },
    { id: 202, path: "images/dotted-png.png", filename: "dotted-png.png", suffix: ".png", tag_ids: [] },
    { id: 203, path: "videos/clip.mp4", filename: "clip.mp4", suffix: "mp4", tag_ids: [] },
    { id: 204, path: "docs/notes.txt", filename: "notes.txt", suffix: "txt", tag_ids: [] },
    {
      id: 205,
      path: "images/broken-image.webp",
      filename: "broken-image.webp",
      suffix: "webp",
      tag_ids: []
    }
  ];

  const settingsPayload = {
    sorting_mode: "file.date_added",
    ascending: false,
    show_hidden_entries: false,
    page_size: 200,
    layout: {
      main_split_ratio: 0.78,
      main_left_collapsed: false,
      main_right_collapsed: false,
      main_last_open_ratio: 0.78,
      inspector_split_ratio: 0.52,
      preview_collapsed: false,
      metadata_collapsed: false,
      inspector_last_open_ratio: 0.52,
      mobile_active_pane: "grid"
    }
  };

  const tinyPng = Buffer.from(TINY_PNG_BASE64, "base64");
  const tinyMp4 = Buffer.from(TINY_MP4_BASE64, "base64");

  await page.route(`${API_BASE_URL}/api/v1/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === "/api/v1/libraries/state") {
      await fulfillJson(route, {
        is_open: true,
        library_path: "/tmp/library",
        entries_count: entries.length,
        tags_count: 0
      });
      return;
    }

    if (pathname === "/api/v1/settings") {
      await fulfillJson(route, settingsPayload);
      return;
    }

    if (pathname === "/api/v1/field-types") {
      await fulfillJson(route, []);
      return;
    }

    if (pathname === "/api/v1/tags") {
      await fulfillJson(route, []);
      return;
    }

    if (pathname === "/api/v1/search" && request.method() === "POST") {
      await fulfillJson(route, {
        total_count: entries.length,
        ids: entries.map((entry) => entry.id),
        entries
      });
      return;
    }

    await fulfillJson(route, { detail: `Unmocked endpoint: ${pathname}` }, 404);
  });

  await page.route(`${API_BASE_URL}/api/v1/entries/*/media`, async (route) => {
    const match = /\/entries\/(\d+)\/media$/.exec(new URL(route.request().url()).pathname);
    const entryId = Number(match?.[1] ?? -1);

    if (entryId === 201 || entryId === 202) {
      await route.fulfill({ status: 200, contentType: "image/png", body: tinyPng });
      return;
    }

    if (entryId === 203) {
      await route.fulfill({ status: 200, contentType: "video/mp4", body: tinyMp4 });
      return;
    }

    if (entryId === 205) {
      await route.fulfill({ status: 500, contentType: "text/plain", body: "broken media" });
      return;
    }

    await route.fulfill({ status: 404, contentType: "text/plain", body: "missing media" });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

  const webpCard = page.locator(".thumb-card").filter({ hasText: "sample-webp.webp" });
  await expect(webpCard.locator("img.thumb-media-image")).toHaveCount(1);

  const dottedPngCard = page.locator(".thumb-card").filter({ hasText: "dotted-png.png" });
  await expect(dottedPngCard.locator("img.thumb-media-image")).toHaveCount(1);

  const videoCard = page.locator(".thumb-card").filter({ hasText: "clip.mp4" });
  await expect
    .poll(async () => {
      const videoCount = await videoCard.locator("video.thumb-media-video").count();
      const iconCount = await videoCard.locator(".thumb-media-icon").count();
      return videoCount + iconCount;
    })
    .toBe(1);
  if ((await videoCard.locator("video.thumb-media-video").count()) === 1) {
    await expect(videoCard.locator(".thumb-media-icon")).toHaveCount(0);
  } else {
    await expect(videoCard.locator(".thumb-media-icon")).toHaveText("VIDEO");
  }

  const textCard = page.locator(".thumb-card").filter({ hasText: "notes.txt" });
  await expect(textCard.locator(".thumb-media-icon")).toHaveText("TXT");

  const brokenCard = page.locator(".thumb-card").filter({ hasText: "broken-image.webp" });
  await expect(brokenCard.locator(".thumb-media-icon")).toHaveText("WEBP");
});

test("applies top-bar filter menu toggles with live query sync and request flags", async ({ page }) => {
  const entries = [
    { id: 301, path: "images/sample.webp", filename: "sample.webp", suffix: "webp", tag_ids: [] }
  ];
  const searchRequests: Array<{ query: string; show_hidden_entries: boolean }> = [];

  const settingsPayload = {
    sorting_mode: "file.date_added",
    ascending: false,
    show_hidden_entries: false,
    page_size: 200,
    layout: {
      main_split_ratio: 0.78,
      main_left_collapsed: false,
      main_right_collapsed: false,
      main_last_open_ratio: 0.78,
      inspector_split_ratio: 0.52,
      preview_collapsed: false,
      metadata_collapsed: false,
      inspector_last_open_ratio: 0.52,
      mobile_active_pane: "grid"
    }
  };

  await page.route(`${API_BASE_URL}/api/v1/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === "/api/v1/libraries/state") {
      await fulfillJson(route, {
        is_open: true,
        library_path: "/tmp/library",
        entries_count: entries.length,
        tags_count: 0
      });
      return;
    }

    if (pathname === "/api/v1/settings") {
      await fulfillJson(route, settingsPayload);
      return;
    }

    if (pathname === "/api/v1/field-types") {
      await fulfillJson(route, []);
      return;
    }

    if (pathname === "/api/v1/tags") {
      await fulfillJson(route, []);
      return;
    }

    if (pathname === "/api/v1/search" && request.method() === "POST") {
      const payload = request.postDataJSON() as {
        query?: string;
        show_hidden_entries?: boolean;
      };

      searchRequests.push({
        query: payload.query?.trim() ?? "",
        show_hidden_entries: payload.show_hidden_entries ?? false
      });

      await fulfillJson(route, {
        total_count: entries.length,
        ids: entries.map((entry) => entry.id),
        entries
      });
      return;
    }

    await fulfillJson(route, { detail: `Unmocked endpoint: ${pathname}` }, 404);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
  await expect.poll(() => searchRequests.length).toBe(1);

  const searchInput = page.getByPlaceholder("Search entries (e.g. tag:\"favorite\" or path:\"*.png\")");
  const searchButton = page.getByRole("button", { name: "Search" });
  const filterButton = page.getByRole("button", { name: "Open filters menu" });

  await searchInput.fill("special:untagged");
  await filterButton.click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Untagged" })).toHaveAttribute(
    "aria-checked",
    "true"
  );

  await page.getByRole("menuitemcheckbox", { name: "Untagged" }).click();
  await expect.poll(() => searchRequests.at(-1)?.query).toBe("");

  await searchInput.fill("tag:foo");
  await searchButton.click();
  await expect.poll(() => searchRequests.at(-1)?.query).toBe("tag:foo");

  await filterButton.click();
  await page.getByRole("menuitemcheckbox", { name: "Untagged" }).click();
  await expect.poll(() => searchRequests.at(-1)?.query).toBe("tag:foo special:untagged");
  await expect(filterButton).toHaveClass(/filter-trigger-warning/);
  await filterButton.click();
  await expect(page.getByText("usually returns zero results")).toBeVisible();

  await page.getByRole("menuitemcheckbox", { name: "Show hidden entries" }).click();
  await expect.poll(() => searchRequests.at(-1)?.show_hidden_entries).toBe(true);

  await searchInput.fill("(special:untagged OR tag:foo)");
  await searchButton.click();
  await expect.poll(() => searchRequests.at(-1)?.query).toBe("(special:untagged OR tag:foo)");
  await filterButton.click();
  await expect(
    page.getByText("Advanced query detected. Untagged token removal is conservative.")
  ).toBeVisible();
});
