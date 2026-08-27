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

test("collapsible inspector sections and default visibility states", async ({ page }) => {
  const allTags = [
    {
      id: 1,
      name: "Animal",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    },
    {
      id: 2,
      name: "Dog",
      shorthand: null,
      aliases: [],
      parent_ids: [1],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    },
    {
      id: 3,
      name: "Corgi",
      shorthand: null,
      aliases: [],
      parent_ids: [2],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    },
    {
      id: 4,
      name: "Cute",
      shorthand: null,
      aliases: [],
      parent_ids: [],
      color_namespace: null,
      color_slug: null,
      disambiguation_id: null,
      is_category: false,
      is_hidden: false
    }
  ];

  const fieldTypes = [
    { key: "author", name: "Author", kind: "text", is_default: false, position: 0 },
    { key: "notes", name: "Notes", kind: "text", is_default: false, position: 1 }
  ];

  const entry = {
    id: 101,
    path: "images/corgi.png",
    full_path: "/tmp/library/images/corgi.png",
    filename: "corgi.png",
    suffix: "png",
    date_created: null,
    date_modified: null,
    date_added: "2026-01-01T00:00:00Z",
    tags: [allTags[2]], // Corgi (id: 3)
    fields: [
      { id: 201, type_key: "author", type_name: "Author", kind: "text", value: "Jane Doe", position: 0 }
    ],
    is_favorite: false,
    is_archived: false
  };

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

  await page.route(`${API_BASE_URL}/api/v1/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname === "/api/v1/libraries/state") {
      await fulfillJson(route, {
        is_open: true,
        library_path: "/tmp/library",
        entries_count: 1,
        tags_count: allTags.length
      });
      return;
    }

    if (pathname === "/api/v1/settings" && method === "GET") {
      await fulfillJson(route, settingsPayload);
      return;
    }

    if (pathname === "/api/v1/tags") {
      await fulfillJson(route, allTags);
      return;
    }

    if (pathname === "/api/v1/tag-colors") {
      await fulfillJson(route, []);
      return;
    }

    if (pathname === "/api/v1/tags/suggested" && method === "POST") {
      await fulfillJson(route, {
        suggestions: [
          { tag: allTags[3], confidence: 0.85, reason: "Frequently co-occurs with Corgi" }
        ]
      });
      return;
    }

    if (pathname === "/api/v1/field-types") {
      await fulfillJson(route, fieldTypes);
      return;
    }

    if (pathname === "/api/v1/search" && method === "POST") {
      await fulfillJson(route, {
        total_count: 1,
        ids: [entry.id],
        entries: [{ id: entry.id, path: entry.path, filename: entry.filename, suffix: entry.suffix, tag_ids: [3] }]
      });
      return;
    }

    if (pathname === `/api/v1/entries/${entry.id}` && method === "GET") {
      await fulfillJson(route, entry);
      return;
    }

    if (pathname === `/api/v1/entries/${entry.id}/preview`) {
      await fulfillJson(route, {
        entry_id: entry.id,
        preview_kind: "image",
        media_type: "image/png",
        media_url: `/api/v1/entries/${entry.id}/media`,
        thumbnail_url: `/api/v1/entries/${entry.id}/thumbnail?size=768&fit=contain&kind=preview`,
        poster_url: null,
        text_excerpt: null,
        supports_media_controls: false
      });
      return;
    }

    if (pathname === "/api/v1/thumbnails/prewarm") {
      await fulfillJson(route, { status: "ok" });
      return;
    }

    if (pathname.includes("/thumbnail")) {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(TINY_PNG_BASE64, "base64")
      });
      return;
    }

    await fulfillJson(route, { detail: `Unmocked: ${pathname}` }, 404);
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Click the entry to select it
  await page.locator(".thumb-card").first().click();

  // 1. Tags section is visible and expanded by default
  const tagsToggle = page.getByRole("button", { name: /^Tags/ });
  await expect(tagsToggle).toBeVisible();
  await expect(tagsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Add Tag", exact: true })).toBeVisible();
  await expect(page.locator(".metadata-tag-chip", { hasText: "Corgi" })).toBeVisible();

  // 2. Inherited tags section is visible and expanded by default, showing Dog and Animal
  const inheritedTagsToggle = page.getByRole("button", { name: /^Inherited tags/ });
  await expect(inheritedTagsToggle).toBeVisible();
  await expect(inheritedTagsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".metadata-tag-chip", { hasText: "Dog" })).toBeVisible();
  await expect(page.locator(".metadata-tag-chip", { hasText: "Animal" })).toBeVisible();

  // 3. Suggested tags section is visible and expanded by default
  const suggestedTagsToggle = page.getByRole("button", { name: /^Suggested tags/ });
  await expect(suggestedTagsToggle).toBeVisible();
  await expect(suggestedTagsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".metadata-tag-chip", { hasText: "Cute" })).toBeVisible();

  // 4. Fields section is visible but collapsed by default
  const fieldsToggle = page.getByRole("button", { name: /^Fields/ });
  await expect(fieldsToggle).toBeVisible();
  await expect(fieldsToggle).toHaveAttribute("aria-expanded", "false");
  // Field values and Add Field form are NOT visible while collapsed
  await expect(page.locator("input[value='Jane Doe']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0);

  // 5. Expand Fields section
  await fieldsToggle.click();
  await expect(fieldsToggle).toHaveAttribute("aria-expanded", "true");
  // Existing field is now visible
  await expect(page.locator("input[value='Jane Doe']")).toBeVisible();
  // Add/Update Field form is still hidden by default
  await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0);

  // 6. Click "Add Field" to show the Add/Update Field form
  const addFieldBtn = page.getByRole("button", { name: "Add Field" });
  await expect(addFieldBtn).toBeVisible();
  await addFieldBtn.click();

  // Add/Update Field form is now visible
  await expect(page.getByText("Add/Update Field")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
  const cancelBtn = page.getByRole("button", { name: "Cancel" });
  await expect(cancelBtn).toBeVisible();

  // 7. Click "Cancel" to hide the Add/Update Field form again
  await cancelBtn.click();
  await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0);

  // 8. Collapse Tags section
  await tagsToggle.click();
  await expect(tagsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".metadata-tag-chip", { hasText: "Corgi" })).toHaveCount(0);

  // 9. Collapse Inherited tags section
  await inheritedTagsToggle.click();
  await expect(inheritedTagsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".metadata-tag-chip", { hasText: "Dog" })).toHaveCount(0);

  // 10. Collapse Suggested tags section
  await suggestedTagsToggle.click();
  await expect(suggestedTagsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".metadata-tag-chip", { hasText: "Cute" })).toHaveCount(0);
});
