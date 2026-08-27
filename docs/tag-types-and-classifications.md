---
icon: material/tag-multiple
---

# Tag Classifications: Content, Meta, and System Tags

In TagStudio, tags are categorized by their semantic role and lifecycle within the library. Understanding this distinction is essential for proper search, organization, automated processing, and recommendation behaviors.

## Distinction Overview

| Dimension | **Content Tags** | **Meta / Workflow Tags** | **System / Automated Tags** |
| :--- | :--- | :--- | :--- |
| **Examples** | `Cat`, `Landscape`, `Character: Alice`, `Artist: Bob`, `2024`, `Cyberpunk` | `Favorite` (ID 1), `Archived` (ID 0), `To Review`, `Trash`, `Needs Metadata`, `5 Stars` | `system:remuxed`, `system:corrupted`, `system:unsupported`, `system:ai_tagged` |
| **Semantic Meaning** | Descriptive metadata regarding the **subject matter** or visual content of the file. | **Curation & workflow metadata** describing the file's organizational state in the library. | **Engine & machine diagnostics** produced automatically by background workers/inspectors. |
| **Origin & Lifecycle** | Created, applied, edited, and deleted manually by the user or imported from external metadata. | Defined by default or created by the user for custom workflows; toggled via user shortcuts/actions (e.g. `F` for Favorite, `Delete` for Archive). | Automatically created/applied/cleared by internal engines (`ffprobe`, remuxer, file scanner); protected against arbitrary user rename/deletion. |
| **Tag Recommendations** | **Included** (Core of co-occurrence graph: *"files with Dog also often have Leash"*). | **Excluded** (*"Favorite"* should not be suggested as a descriptive tag just because many photos are favorited). | **Excluded** (*"system:remuxed"* should never be recommended as a descriptive tag). |
| **Search: `untagged`** | Required. If an entry has no content tags, it is treated as **untagged**. | Does not prevent `untagged` state (a favorited file with no content tags is still content-untagged). | Must never count towards tagged status (`system:remuxed` does not make an image "tagged"). |
| **Tag Graph & Clustering** | Primary nodes in semantic similarity clusters. | Optional overlay or filtered out from content clusters. | Muted or filtered out from semantic discovery graphs. |
| **UI Presentation** | Standard tag chips/pills in tag box / inspector / search autocomplete. | Status badges, heart/star toggles, workflow banners. | Diagnostic badges, warning indicators, technical info panes. |

---

## Why They Are Distinct

### 1. Content Tags vs. Meta Tags
Content tags describe the file itself (its subject matter, art style, artist, character, location). Meta tags describe **how the user interacts with the file** (favorite status, archive status, workflow stage, star rating).

If meta tags were treated as content tags in recommendation engines or co-occurrence graphs, a user who favorites 100 cat photos would see "Favorite" recommended every time they tag a new cat photo, which provides no semantic value.

### 2. Meta Tags vs. System Tags
While both Meta and System tags are "non-content" tags, they have fundamentally different lifecycles:
- **Meta Tags** are user-controlled. Users can create, delete, and apply them dynamically through UI buttons or custom shortcuts.
- **System Tags** are application-controlled contracts. Background workers (such as video integrity inspectors, codec verifiers, or remuxers) attach these tags deterministically. They should be protected from accidental rename or deletion.

---

## Data Model & Query Semantics

Tags in TagStudio store their type in a first-class, indexed `tag_type` column (`'content'`, `'meta'`, `'system'`).

### Common Query Rules

1. **Tag Suggestions / Co-occurrence**:
   Only `tag_type = 'content'` tags are considered for suggestions. Categories and hidden tags are also excluded.

2. **Untagged Filter (`untagged`)**:
   A file is `untagged` if it has no entries in `tag_entries` where the associated tag has `tag_type = 'content'`.

3. **Tag Graph Visualization**:
   Default graph visualizes `content` tags to reveal subject-matter clusters. `system` and `meta` tags can be toggled on/off independently.
