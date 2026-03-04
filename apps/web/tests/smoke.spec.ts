import { expect, test, type Route } from "@playwright/test";

const API_BASE_URL = "http://127.0.0.1:5987";

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Y0XcAAAAASUVORK5CYII=";

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
    { id: 206, path: "videos/clip-two.m4v", filename: "clip-two.m4v", suffix: "m4v", tag_ids: [] },
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

    if (pathname === "/api/v1/thumbnails/prewarm" && request.method() === "POST") {
      await fulfillJson(route, { accepted: 0, skipped: 0 }, 202);
      return;
    }

    await fulfillJson(route, { detail: `Unmocked endpoint: ${pathname}` }, 404);
  });

  await page.route(`${API_BASE_URL}/api/v1/entries/*/thumbnail**`, async (route) => {
    const match = /\/entries\/(\d+)\/thumbnail$/.exec(new URL(route.request().url()).pathname);
    const entryId = Number(match?.[1] ?? -1);

    if (entryId === 201 || entryId === 202 || entryId === 203 || entryId === 206) {
      await route.fulfill({ status: 200, contentType: "image/png", body: tinyPng });
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
  await expect(videoCard.locator("img.thumb-media-image")).toHaveCount(1);
  await expect(videoCard.locator(".thumb-video-badge")).toHaveCount(1);

  const m4vCard = page.locator(".thumb-card").filter({ hasText: "clip-two.m4v" });
  await expect(m4vCard.locator("img.thumb-media-image")).toHaveCount(1);
  await expect(m4vCard.locator(".thumb-video-badge")).toHaveCount(1);

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

    if (pathname === "/api/v1/thumbnails/prewarm" && request.method() === "POST") {
      await fulfillJson(route, { accepted: 0, skipped: 0 }, 202);
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

test("supports add-tags modal create-and-add workflow", async ({ page }) => {
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

  const entryTagIds = new Map<number, Set<number>>([
    [401, new Set<number>()],
    [402, new Set<number>()]
  ]);

  const tags: Array<{
    id: number;
    name: string;
    shorthand: string | null;
    aliases: string[];
    parent_ids: number[];
    color_namespace: string | null;
    color_slug: string | null;
    disambiguation_id: number | null;
    is_category: boolean;
    is_hidden: boolean;
  }> = [
    {
      id: 11,
      name: "Favorite",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: "tagstudio-standard",
      color_slug: "yellow",
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    }
  ];
  let nextTagId = 1000;
  const createdTagNames: string[] = [];
  const addTagRequests: Array<{ entry_ids: number[]; tag_ids: number[] }> = [];

  const entryResponse = (entryId: number) => {
    const tagIds = [...(entryTagIds.get(entryId) ?? new Set<number>())];
    return {
      id: entryId,
      path: `images/${entryId}.png`,
      full_path: `/tmp/library/images/${entryId}.png`,
      filename: `${entryId}.png`,
      suffix: "png",
      date_created: null,
      date_modified: null,
      date_added: null,
      tags: tagIds
        .map((tagId) => tags.find((tag) => tag.id === tagId))
        .filter((tag): tag is (typeof tags)[number] => tag !== undefined),
      fields: [],
      is_favorite: false,
      is_archived: false
    };
  };

  await page.route(`${API_BASE_URL}/api/v1/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;

    if (pathname === "/api/v1/libraries/state") {
      await fulfillJson(route, {
        is_open: true,
        library_path: "/tmp/library",
        entries_count: 2,
        tags_count: tags.length
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

    if (pathname === "/api/v1/tag-colors") {
      await fulfillJson(route, [
        {
          namespace: "tagstudio-standard",
          namespace_name: "TagStudio Standard",
          colors: [
            {
              namespace: "tagstudio-standard",
              namespace_name: "TagStudio Standard",
              slug: "yellow",
              name: "Yellow",
              primary: "#facc15",
              secondary: null,
              color_border: false
            }
          ]
        }
      ]);
      return;
    }

    if (pathname === "/api/v1/tags" && request.method() === "GET") {
      const query = searchParams.get("query")?.trim().toLowerCase() ?? "";
      const filtered = query
        ? tags.filter(
            (tag) =>
              tag.name.toLowerCase().includes(query) ||
              (tag.shorthand?.toLowerCase().includes(query) ?? false) ||
              tag.aliases.some((alias) => alias.toLowerCase().includes(query))
          )
        : tags;
      await fulfillJson(route, filtered);
      return;
    }

    if (pathname === "/api/v1/tags" && request.method() === "POST") {
      const payload = request.postDataJSON() as {
        name: string;
        shorthand?: string | null;
        aliases?: string[];
        parent_ids?: number[];
        color_namespace?: string | null;
        color_slug?: string | null;
        disambiguation_id?: number | null;
        is_category?: boolean;
        is_hidden?: boolean;
      };
      const newTag = {
        id: nextTagId++,
        name: payload.name,
        shorthand: payload.shorthand ?? null,
        aliases: payload.aliases ?? [],
        parent_ids: payload.parent_ids ?? [],
        color_namespace: payload.color_namespace ?? null,
        color_slug: payload.color_slug ?? null,
        disambiguation_id: payload.disambiguation_id ?? null,
        is_category: payload.is_category ?? false,
        is_hidden: payload.is_hidden ?? false
      };
      tags.push(newTag);
      createdTagNames.push(newTag.name);
      await fulfillJson(route, newTag);
      return;
    }

    if (pathname === "/api/v1/entries/tags:add" && request.method() === "POST") {
      const payload = request.postDataJSON() as { entry_ids: number[]; tag_ids: number[] };
      addTagRequests.push(payload);
      for (const entryId of payload.entry_ids) {
        const existing = entryTagIds.get(entryId) ?? new Set<number>();
        for (const tagId of payload.tag_ids) {
          existing.add(tagId);
        }
        entryTagIds.set(entryId, existing);
      }
      await fulfillJson(route, { success: true, changed: payload.entry_ids.length * payload.tag_ids.length });
      return;
    }

    if (pathname === "/api/v1/search" && request.method() === "POST") {
      await fulfillJson(route, {
        total_count: 2,
        ids: [401, 402],
        entries: [
          {
            id: 401,
            path: "images/401.png",
            filename: "401.png",
            suffix: "png",
            tag_ids: [...(entryTagIds.get(401) ?? new Set<number>())]
          },
          {
            id: 402,
            path: "images/402.png",
            filename: "402.png",
            suffix: "png",
            tag_ids: [...(entryTagIds.get(402) ?? new Set<number>())]
          }
        ]
      });
      return;
    }

    const entryMatch = /^\/api\/v1\/entries\/(\d+)$/.exec(pathname);
    if (entryMatch && request.method() === "GET") {
      const entryId = Number(entryMatch[1]);
      await fulfillJson(route, entryResponse(entryId));
      return;
    }

    const previewMatch = /^\/api\/v1\/entries\/(\d+)\/preview$/.exec(pathname);
    if (previewMatch) {
      await fulfillJson(route, {
        entry_id: Number(previewMatch[1]),
        preview_kind: "binary",
        media_type: "application/octet-stream",
        media_url: null,
        text_excerpt: null,
        supports_media_controls: false
      });
      return;
    }

    if (pathname === "/api/v1/libraries/open" || pathname === "/api/v1/libraries/create") {
      await fulfillJson(route, {
        is_open: true,
        library_path: "/tmp/library",
        entries_count: 2,
        tags_count: tags.length
      });
      return;
    }

    await fulfillJson(route, { detail: `Unmocked endpoint: ${pathname}` }, 404);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

  await page.locator(".thumb-card").first().click();
  await expect(page.getByRole("button", { name: "Add Tag" })).toBeVisible();

  await page.getByRole("button", { name: "Add Tag" }).click();
  const addTagsDialog = page.getByRole("dialog", { name: "Add tags" });
  await expect(addTagsDialog).toBeVisible();
  await expect(addTagsDialog.getByRole("button", { name: "Edit" })).toHaveCount(0);

  const searchTags = page.getByPlaceholder("Search tags");
  await searchTags.fill("game");
  await expect(page.getByRole("button", { name: 'Create & Add "game"' })).toBeVisible();
  await searchTags.press("Enter");

  await expect(page.getByRole("dialog", { name: "Create tag" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("game");
  await page.getByRole("button", { name: "Save" }).click();

  await expect.poll(() => createdTagNames.includes("game")).toBe(true);
  await expect.poll(() => addTagRequests.some((payload) => payload.tag_ids.length === 1)).toBe(true);

  await searchTags.press("Control+Enter");
  await expect(page.getByRole("dialog", { name: "Edit tag" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  const addTagsDragHandle = addTagsDialog.locator(".modal-drag-handle");
  await expect(addTagsDragHandle).toBeVisible();
  await expect(addTagsDialog).toHaveCSS("position", "fixed");

  await page.getByRole("button", { name: "Done" }).click();
  const metadataChip = page.locator(".metadata-tag-chip").first();
  await expect(metadataChip).toContainText("game");
  await expect(page.locator(".metadata-tag-actions").getByRole("button", { name: "Edit" })).toHaveCount(0);

  const chipRemoveButton = metadataChip.locator(".metadata-tag-chip-remove");
  await expect(chipRemoveButton).toHaveCSS("opacity", "0");
  await metadataChip.hover();
  await expect(chipRemoveButton).toHaveCSS("opacity", "1");

  await metadataChip.locator(".metadata-tag-chip-main").click();
  await expect(page.getByRole("dialog", { name: "Edit tag" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});
