---
icon: material/web
---

# :material-web: Web/Electron Migration Track

This document tracks implementation progress for the Electron-first, browser-ready migration.

## Operational Parity Checklist

- [ ] Open existing library
- [ ] Create new library
- [ ] Browse entry results
- [ ] Search query execution
- [ ] Entry detail view
- [ ] Add/remove tags on entries
- [ ] Tag CRUD (name, aliases, parents)
- [ ] Field edits (text and datetime)
- [ ] Preview panel parity for common formats
- [ ] Media playback controls parity
- [ ] Settings parity for daily workflows
- [ ] Refresh workflow with live progress events
- [ ] Qt fallback toggle functional in release build

## Phase Status

### Phase 0

- Added API contract and parity checklist tracking.

### Phase 1

- Decoupled core from direct Qt translation imports via `tagstudio.core.i18n`.
- Removed direct Qt/PySide typing dependency from `tagstudio.core.driver`.

### Phase 2

- Added FastAPI package at `src/tagstudio/api`.
- Implemented versioned API routes under `/api/v1/*`.
- Added refresh background job manager and SSE event stream endpoint.
- Added `tagstudio-api` and `tagstudio-api-openapi` entry scripts.

### Phase 3

- Added Bun workspace with:
  - `apps/web` (React + TypeScript + Vite + Tailwind v4)
  - `apps/desktop` (Electron shell)
  - `packages/api-client` (typed API client + OpenAPI contract file)
  - `packages/ui` (Tailwind/shadcn-style component primitives)

## Bun Risk Checkpoint

If Electron build/runtime blockers persist for more than two working days because of Bun-specific
tooling friction, switch official CI/build package manager to `pnpm` while keeping Bun-compatible
scripts for local development.
