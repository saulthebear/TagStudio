# Architecture

TagStudio Web is a local application with a browser frontend and a Python service boundary.

## Components

- `apps/web` contains the React, TypeScript, and Vite frontend.
- `packages/api-client` contains the shared API contract and client helpers.
- `packages/ui` contains reusable web UI primitives.
- `src/tagstudio/api` exposes the local FastAPI interface and owns process-level runtime state.
- `src/tagstudio/core` owns library persistence, search, refresh, media, and domain behavior.
- `src/tagstudio/observability` stores local logs and operational metrics.

The browser communicates with the API over loopback HTTP. The API is responsible for all direct
filesystem and SQLite access; the browser never opens library files itself.

## Library compatibility

Each library stores its SQLite database and generated state in `<library>/.TagStudio`. Supported
older SQLite schemas are upgraded by the migrations in `src/tagstudio/core/library/alchemy`.
Pre-SQLite JSON libraries are detected but not converted by this fork.

## API contract

FastAPI generates the source OpenAPI schema. A deterministic copy is committed at
`packages/api-client/openapi/tagstudio-api.json`, and backend CI compares the complete generated
schema with that file. Any endpoint, validation, or response-schema change therefore requires an
intentional contract update.
