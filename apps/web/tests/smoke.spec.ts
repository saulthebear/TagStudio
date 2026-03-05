import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const API_BASE_URL = "http://127.0.0.1:5987";

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Y0XcAAAAASUVORK5CYII=";

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload)
  });
}

async function expectDialogWithinViewport(
  page: Page,
  dialogLocator: Locator,
  margin = 8
) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const bounds = await dialogLocator.boundingBox();
  expect(bounds).not.toBeNull();
  const box = bounds!;
  expect(box.x).toBeGreaterThanOrEqual(margin);
  expect(box.y).toBeGreaterThanOrEqual(margin);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport!.width - margin);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport!.height - margin);
}

async function dragDialogBy(
  page: Page,
  dialogLocator: Locator,
  handleLocator: Locator,
  delta: { x: number; y: number },
  tolerance = 36
) {
  const before = await dialogLocator.boundingBox();
  expect(before).not.toBeNull();
  const handleBounds = await handleLocator.boundingBox();
  expect(handleBounds).not.toBeNull();

  const startX = handleBounds!.x + handleBounds!.width / 2;
  const startY = handleBounds!.y + handleBounds!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta.x, startY + delta.y);
  await page.mouse.up();

  await expect
    .poll(async () => dialogLocator.boundingBox(), {
      timeout: 2000
    })
    .not.toBeNull();

  const after = await dialogLocator.boundingBox();
  expect(after).not.toBeNull();
  const movedX = after!.x - before!.x;
  const movedY = after!.y - before!.y;
  if (delta.x !== 0) {
    expect(Math.abs(movedX - delta.x)).toBeLessThanOrEqual(tolerance);
  }
  if (delta.y !== 0) {
    expect(Math.abs(movedY - delta.y)).toBeLessThanOrEqual(tolerance);
  }
}

type Box = { x: number; y: number; width: number; height: number };

function requireBox(box: Box | null, name: string): Box {
  expect(box, `${name} should have a bounding box`).not.toBeNull();
  if (!box) {
    throw new Error(`Missing bounding box for ${name}`);
  }
  return box;
}

async function dragSeparatorTo(page: Page, label: string, targetX: number, targetY: number): Promise<void> {
  const separator = page.getByRole("separator", { name: label });
  await expect(separator).toBeVisible();

  const box = requireBox(await separator.boundingBox(), label);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
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

  const addTagsDragHandle = addTagsDialog.locator(".modal-drag-handle");
  await expect(addTagsDragHandle).toBeVisible();
  await expect(addTagsDialog).toHaveCSS("position", "fixed");
  await expectDialogWithinViewport(page, addTagsDialog, 8);
  await dragDialogBy(page, addTagsDialog, addTagsDragHandle, { x: -120, y: 0 });
  await expectDialogWithinViewport(page, addTagsDialog, 8);
  await expect(page.locator(".modal-layer-backdrop-dim")).toHaveCount(1);

  await searchTags.press("Control+Enter");
  const editTagDialog = page.getByRole("dialog", { name: "Edit tag" });
  await expect(editTagDialog).toBeVisible();
  await expect(page.locator(".modal-layer-backdrop-dim")).toHaveCount(1);
  await page.mouse.click(24, 24);
  await expect(editTagDialog).toHaveCount(0);
  await expect(addTagsDialog).toBeVisible();

  await searchTags.press("Control+Enter");
  await expect(editTagDialog).toBeVisible();
  const editDragHandle = editTagDialog.locator(".modal-drag-handle");
  await dragDialogBy(page, editTagDialog, editDragHandle, { x: 90, y: 0 });
  await expectDialogWithinViewport(page, editTagDialog, 8);

  await editTagDialog.getByRole("button", { name: "Add Parent Tag(s)" }).click();
  const parentPickerDialog = page.getByRole("dialog", { name: "Add parent tags" });
  await expect(parentPickerDialog).toBeVisible();
  await dragDialogBy(page, parentPickerDialog, parentPickerDialog.locator(".modal-drag-handle"), { x: 75, y: 0 });
  await expectDialogWithinViewport(page, parentPickerDialog, 8);
  await page.mouse.click(24, 24);
  await expect(parentPickerDialog).toHaveCount(0);
  await expect(editTagDialog).toBeVisible();

  await editTagDialog.getByRole("button", { name: "No Color" }).click();
  const colorPickerDialog = page.getByRole("dialog", { name: "Choose tag color" });
  await expect(colorPickerDialog).toBeVisible();
  await dragDialogBy(page, colorPickerDialog, colorPickerDialog.locator(".modal-drag-handle"), { x: -80, y: 0 });
  await expectDialogWithinViewport(page, colorPickerDialog, 8);
  await page.mouse.click(24, 24);
  await expect(colorPickerDialog).toHaveCount(0);
  await expect(editTagDialog).toBeVisible();
  await editTagDialog.getByRole("button", { name: "Cancel" }).click();

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

test("keeps split panes within bounds after collapse/expand and divider drags", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const entries = [
    { id: 401, path: "images/sample.png", filename: "sample.png", suffix: "png", tag_ids: [] }
  ];
  const initialSettings = {
    sorting_mode: "file.date_added",
    ascending: false,
    show_hidden_entries: false,
    page_size: 200,
    layout: {
      main_split_ratio: 0.78,
      main_left_collapsed: false,
      main_right_collapsed: true,
      main_last_open_ratio: 0.78,
      inspector_split_ratio: 0.52,
      preview_collapsed: false,
      metadata_collapsed: false,
      inspector_last_open_ratio: 0.52,
      mobile_active_pane: "grid"
    }
  };
  let settingsPayload = initialSettings;

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
      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as {
          sorting_mode?: string;
          ascending?: boolean;
          show_hidden_entries?: boolean;
          page_size?: number;
          layout?: Partial<(typeof initialSettings)["layout"]>;
        };

        settingsPayload = {
          ...settingsPayload,
          ...payload,
          layout: {
            ...settingsPayload.layout,
            ...(payload.layout ?? {})
          }
        };
      }

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

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

  await page.getByRole("button", { name: "Expand Inspector" }).click();
  const mainDividerLabel = "File grid and Inspector divider";
  await expect(page.getByRole("separator", { name: mainDividerLabel })).toBeVisible();

  const mainSplitBox = requireBox(await page.locator(".main-split").boundingBox(), "main split container");
  const firstDragTargetX = mainSplitBox.x + mainSplitBox.width * 0.68;
  const firstDragTargetY = mainSplitBox.y + mainSplitBox.height / 2;
  await dragSeparatorTo(page, mainDividerLabel, firstDragTargetX, firstDragTargetY);

  const hasHorizontalOverflowAfterExpand = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  expect(hasHorizontalOverflowAfterExpand).toBe(true);

  const mainSecondaryWithinBounds = await page.evaluate(() => {
    const split = document.querySelector(".main-split") as HTMLElement | null;
    const secondary = split?.querySelector(":scope > .split-pane-region-secondary") as HTMLElement | null;
    if (!split || !secondary) {
      return false;
    }
    const splitRect = split.getBoundingClientRect();
    const secondaryRect = secondary.getBoundingClientRect();
    return secondaryRect.right <= splitRect.right + 1;
  });
  expect(mainSecondaryWithinBounds).toBe(true);

  await dragSeparatorTo(
    page,
    mainDividerLabel,
    mainSplitBox.x + mainSplitBox.width - 320,
    mainSplitBox.y + mainSplitBox.height / 2
  );
  const secondaryAtMinBounds = requireBox(
    await page.locator(".main-split > .split-pane-region-secondary").boundingBox(),
    "main secondary min-size region"
  );
  expect(secondaryAtMinBounds.width).toBeGreaterThanOrEqual(298);

  await dragSeparatorTo(page, mainDividerLabel, mainSplitBox.x + 340, mainSplitBox.y + mainSplitBox.height / 2);
  const primaryAtMinBounds = requireBox(
    await page.locator(".main-split > .split-pane-region-primary").boundingBox(),
    "main primary min-size region"
  );
  expect(primaryAtMinBounds.width).toBeGreaterThanOrEqual(318);

  const inspectorDividerLabel = "Preview and Metadata divider";
  await expect(page.getByRole("separator", { name: inspectorDividerLabel })).toBeVisible();
  const inspectorSplitBox = requireBox(
    await page.locator(".inspector-split").boundingBox(),
    "inspector split container"
  );
  const inspectorCenterX = inspectorSplitBox.x + inspectorSplitBox.width / 2;

  await dragSeparatorTo(page, inspectorDividerLabel, inspectorCenterX, inspectorSplitBox.y + 240);
  const previewAtMinBounds = requireBox(
    await page.locator(".inspector-split > .split-pane-region-primary").boundingBox(),
    "inspector preview min-size region"
  );
  expect(previewAtMinBounds.height).toBeGreaterThanOrEqual(218);

  await dragSeparatorTo(
    page,
    inspectorDividerLabel,
    inspectorCenterX,
    inspectorSplitBox.y + inspectorSplitBox.height - 240
  );
  const metadataAtMinBounds = requireBox(
    await page.locator(".inspector-split > .split-pane-region-secondary").boundingBox(),
    "inspector metadata min-size region"
  );
  expect(metadataAtMinBounds.height).toBeGreaterThanOrEqual(218);
  const metadataWithinInspectorBounds = await page.evaluate(() => {
    const split = document.querySelector(".inspector-split") as HTMLElement | null;
    const metadata = split?.querySelector(":scope > .split-pane-region-secondary") as HTMLElement | null;
    if (!split || !metadata) {
      return false;
    }
    const splitRect = split.getBoundingClientRect();
    const metadataRect = metadata.getBoundingClientRect();
    return metadataRect.bottom <= splitRect.bottom + 1;
  });
  expect(metadataWithinInspectorBounds).toBe(true);

  const hasHorizontalOverflowAtEnd = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  expect(hasHorizontalOverflowAtEnd).toBe(true);
});
