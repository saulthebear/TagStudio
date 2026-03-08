import { expect, test, type Route } from "@playwright/test";

const API_BASE_URL = "http://127.0.0.1:5987";
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Y0XcAAAAASUVORK5CYII=";

async function fulfillJson(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload)
  });
}

test("supports context-menu copy/paste, favorite/archive toggles, and trash-confirm bypass", async ({
  page
}) => {
  const tagById = new Map([
    [
      0,
      {
        id: 0,
        name: "archived",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: true
      }
    ],
    [
      1,
      {
        id: 1,
        name: "favorite",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: true
      }
    ],
    [
      7,
      {
        id: 7,
        name: "project",
        shorthand: null,
        aliases: [],
        parent_ids: [],
        color_namespace: null,
        color_slug: null,
        disambiguation_id: null,
        is_category: false,
        is_hidden: false
      }
    ]
  ]);

  const entriesBase = [
    { id: 101, path: "images/alpha.jpg", filename: "alpha.jpg", suffix: "jpg" },
    { id: 102, path: "images/beta.jpg", filename: "beta.jpg", suffix: "jpg" },
    { id: 103, path: "images/gamma.jpg", filename: "gamma.jpg", suffix: "jpg" }
  ];

  const entryTags = new Map<number, number[]>([
    [101, [1, 7]],
    [102, [0]],
    [103, []]
  ]);

  const tagAddCalls: Array<{ entry_ids: number[]; tag_ids: number[] }> = [];
  const tagRemoveCalls: Array<{ entry_ids: number[]; tag_ids: number[] }> = [];
  const trashCalls: Array<{ entry_ids: number[] }> = [];
  const settingsPatchCalls: Array<Record<string, unknown>> = [];
  let searchCalls = 0;

  const settingsPayload: Record<string, unknown> = {
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
    },
    thumbnails: {
      cache_max_mib: 512,
      grid_size: 256,
      preview_size: 768,
      quality: 80
    },
    confirmations: {
      confirm_before_trash: true
    }
  };

  function buildSearchEntries() {
    return entriesBase
      .filter((entry) => entryTags.has(entry.id))
      .map((entry) => ({ ...entry, tag_ids: [...(entryTags.get(entry.id) ?? [])] }));
  }

  function buildEntry(entryId: number) {
    const entry = entriesBase.find((candidate) => candidate.id === entryId);
    if (!entry) {
      return null;
    }
    const tags = (entryTags.get(entryId) ?? []).map((tagId) => tagById.get(tagId)).filter(Boolean);
    return {
      id: entry.id,
      path: entry.path,
      full_path: `/tmp/library/${entry.path}`,
      filename: entry.filename,
      suffix: entry.suffix,
      date_created: null,
      date_modified: null,
      date_added: "2026-01-01T00:00:00Z",
      tags,
      fields: [],
      is_favorite: (entryTags.get(entryId) ?? []).includes(1),
      is_archived: (entryTags.get(entryId) ?? []).includes(0)
    };
  }

  await page.route(`${API_BASE_URL}/api/v1/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname === "/api/v1/libraries/state") {
      await fulfillJson(route, {
        is_open: true,
        library_path: "/tmp/library",
        entries_count: entryTags.size,
        tags_count: tagById.size
      });
      return;
    }

    if (pathname === "/api/v1/settings" && method === "GET") {
      await fulfillJson(route, settingsPayload);
      return;
    }

    if (pathname === "/api/v1/settings" && method === "PATCH") {
      const payload = request.postDataJSON() as Record<string, unknown>;
      settingsPatchCalls.push(payload);
      if (payload.confirmations && typeof payload.confirmations === "object") {
        settingsPayload.confirmations = {
          ...(settingsPayload.confirmations as Record<string, unknown>),
          ...(payload.confirmations as Record<string, unknown>)
        };
      }
      await fulfillJson(route, settingsPayload);
      return;
    }

    if (pathname === "/api/v1/field-types") {
      await fulfillJson(route, []);
      return;
    }

    if (pathname === "/api/v1/tag-colors") {
      await fulfillJson(route, []);
      return;
    }

    if (pathname === "/api/v1/tags") {
      await fulfillJson(route, [...tagById.values()]);
      return;
    }

    if (pathname === "/api/v1/search" && method === "POST") {
      searchCalls += 1;
      const entries = buildSearchEntries();
      await fulfillJson(route, {
        total_count: entries.length,
        ids: entries.map((entry) => entry.id),
        entries
      });
      return;
    }

    if (pathname === "/api/v1/thumbnails/prewarm" && method === "POST") {
      await fulfillJson(route, { accepted: 0, skipped: 0 }, 202);
      return;
    }

    const entryMatch = /^\/api\/v1\/entries\/(\d+)$/.exec(pathname);
    if (entryMatch) {
      const entryId = Number(entryMatch[1]);
      const payload = buildEntry(entryId);
      if (!payload) {
        await fulfillJson(route, { detail: "Entry not found." }, 404);
        return;
      }
      await fulfillJson(route, payload);
      return;
    }

    const previewMatch = /^\/api\/v1\/entries\/(\d+)\/preview$/.exec(pathname);
    if (previewMatch) {
      await fulfillJson(route, {
        entry_id: Number(previewMatch[1]),
        preview_kind: "binary",
        media_type: null,
        media_url: null,
        thumbnail_url: null,
        poster_url: null,
        text_excerpt: null,
        supports_media_controls: false
      });
      return;
    }

    if (pathname === "/api/v1/entries/tags:add" && method === "POST") {
      const payload = request.postDataJSON() as { entry_ids: number[]; tag_ids: number[] };
      tagAddCalls.push(payload);
      for (const entryId of payload.entry_ids) {
        const existing = new Set(entryTags.get(entryId) ?? []);
        for (const tagId of payload.tag_ids) {
          existing.add(tagId);
        }
        entryTags.set(entryId, [...existing]);
      }
      await fulfillJson(route, { success: true, changed: payload.entry_ids.length * payload.tag_ids.length });
      return;
    }

    if (pathname === "/api/v1/entries/tags:remove" && method === "POST") {
      const payload = request.postDataJSON() as { entry_ids: number[]; tag_ids: number[] };
      tagRemoveCalls.push(payload);
      for (const entryId of payload.entry_ids) {
        const existing = new Set(entryTags.get(entryId) ?? []);
        for (const tagId of payload.tag_ids) {
          existing.delete(tagId);
        }
        entryTags.set(entryId, [...existing]);
      }
      await fulfillJson(route, { success: true, changed: payload.entry_ids.length * payload.tag_ids.length });
      return;
    }

    if (pathname === "/api/v1/entries:trash" && method === "POST") {
      const payload = request.postDataJSON() as { entry_ids: number[] };
      trashCalls.push(payload);
      for (const entryId of payload.entry_ids) {
        entryTags.delete(entryId);
      }
      await fulfillJson(route, {
        success: true,
        deleted_entry_ids: payload.entry_ids,
        deleted_count: payload.entry_ids.length,
        failed_count: 0,
        failed_entries: []
      });
      return;
    }

    await fulfillJson(route, { detail: `Unmocked endpoint: ${pathname}` }, 404);
  });

  const tinyPng = Buffer.from(TINY_PNG_BASE64, "base64");
  await page.route(`${API_BASE_URL}/api/v1/entries/*/thumbnail**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: tinyPng });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

  const alphaCard = page.locator(".thumb-card").filter({ hasText: "alpha.jpg" });
  const betaCard = page.locator(".thumb-card").filter({ hasText: "beta.jpg" });
  const gammaCard = page.locator(".thumb-card").filter({ hasText: "gamma.jpg" });

  await expect(alphaCard.locator(".thumb-favorite-badge")).toHaveCount(1);
  await expect(betaCard.locator(".thumb-archive-badge")).toHaveCount(1);
  await expect(betaCard).toHaveClass(/thumb-card-archived/);

  await alphaCard.click();
  await betaCard.click({ modifiers: ["Control"] });
  await gammaCard.click({ button: "right" });
  const searchCallsBeforeFavorite = searchCalls;
  await page.getByRole("menuitem", { name: "Favorite" }).click();
  await expect.poll(() => tagAddCalls.some((call) => call.tag_ids[0] === 1)).toBe(true);
  const lastFavoriteCall = tagAddCalls[tagAddCalls.length - 1];
  expect(lastFavoriteCall.entry_ids).toEqual([103]);
  await expect(gammaCard.locator(".thumb-favorite-badge")).toHaveCount(1);
  expect(searchCalls).toBe(searchCallsBeforeFavorite);

  await alphaCard.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy Tags" }).click();
  await betaCard.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Paste Tags" }).click();
  await expect.poll(() =>
    tagAddCalls.some((call) => call.tag_ids.includes(7) && call.entry_ids.includes(102))
  ).toBe(true);

  await alphaCard.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unfavorite" }).click();
  await expect.poll(() =>
    tagRemoveCalls.some((call) => call.tag_ids.includes(1) && call.entry_ids.includes(101))
  ).toBe(true);

  await betaCard.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unarchive" }).click();
  await expect.poll(() =>
    tagRemoveCalls.some((call) => call.tag_ids.includes(0) && call.entry_ids.includes(102))
  ).toBe(true);

  await alphaCard.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete to Trash" }).click();
  await expect(page.getByRole("heading", { name: "Move to Trash" })).toBeVisible();

  await page.getByLabel("Don't ask again this session").check();
  await page.getByLabel("Also remember for this library").check();
  const searchCallsBeforeDelete = searchCalls;
  await page.getByRole("button", { name: "Move to Trash" }).click();

  await expect.poll(() => trashCalls.length).toBe(1);
  expect(trashCalls[0].entry_ids).toEqual([101]);
  await expect(alphaCard).toHaveClass(/thumb-card-inactive/);
  expect(searchCalls).toBe(searchCallsBeforeDelete);
  await expect.poll(() =>
    settingsPatchCalls.some((call) =>
      Boolean(
        call.confirmations
        && typeof call.confirmations === "object"
        && (call.confirmations as Record<string, unknown>).confirm_before_trash === false
      )
    )
  ).toBe(true);
});
