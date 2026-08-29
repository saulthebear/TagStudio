# TagStudio Web

[![Backend Checks](https://github.com/saulthebear/TagStudio/actions/workflows/backend.yml/badge.svg)](https://github.com/saulthebear/TagStudio/actions/workflows/backend.yml)
[![Web Checks](https://github.com/saulthebear/TagStudio/actions/workflows/web.yml/badge.svg)](https://github.com/saulthebear/TagStudio/actions/workflows/web.yml)

TagStudio Web is an experimental, local-first interface for organizing files with rich tags,
fields, inheritance, search, and previews. It combines a React and TypeScript browser UI with a
local FastAPI service and SQLite library database.

> [!IMPORTANT]
> This repository began as a fork of
> [TagStudioDev/TagStudio](https://github.com/TagStudioDev/TagStudio) and has since diverged into a
> web-only project. It is independently maintained, is not supported by the upstream TagStudio
> project, and does not currently publish packaged releases.

## Current scope

- Browser UI in `apps/web`
- Local Python API in `src/tagstudio/api`
- SQLite-backed libraries stored under each library's `.TagStudio` directory
- Existing SQLite schema migrations, including supported older SQLite library versions
- Local thumbnails, media previews, file refresh, search, tagging, fields, and observability

The former Qt desktop client, PyInstaller releases, hosted documentation site, and pre-SQLite JSON
library importer have been removed. If you still have a `.TagStudio/ts_library.json` library,
convert it to SQLite with a compatible upstream TagStudio 9.5 release before opening it here.

## Requirements

- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- [Bun](https://bun.sh/) 1.2 or newer
- FFmpeg and FFprobe for video thumbnails and remuxing

## Development setup

```sh
uv sync --extra dev
bun install --frozen-lockfile
bun run dev
```

Nix users can run `nix develop` to provision the supported Python, uv, Bun, FFmpeg, and ripgrep
toolchain before running the same dependency-install commands.

`bun run dev` starts the API on `http://127.0.0.1:5987` and the Vite development server on
`http://127.0.0.1:5173`.

To run the processes separately:

```sh
uv run tagstudio-api --host 127.0.0.1 --port 5987
bun run dev:web
```

The local development server does not require a token by default. For a token-protected API, start
it with `--require-token --token <token>` and set the same value in
`VITE_TAGSTUDIO_API_TOKEN` for the web client.

## Validation

```sh
uv run ruff check .
uv run ruff format --check .
uv run mypy src/tagstudio
uv run pytest --cov=tagstudio --cov-report=term-missing --cov-fail-under=50

bun run --cwd apps/web typecheck
bun run --cwd apps/web lint
bun run --cwd apps/web test
bun run build:web
bun run --cwd apps/web e2e
```

The OpenAPI document in `packages/api-client/openapi/tagstudio-api.json` is a committed contract.
Regenerate it after API schema changes:

```sh
bun run generate:openapi
```

See [Architecture](docs/architecture.md) for the main boundaries and
[Development](docs/development.md) for repository conventions and CI behavior.

## Data and privacy

TagStudio Web operates on local files and stores library metadata in a local SQLite database. It
does not move or modify source files unless an explicit file operation requests it. Back up a
library's `.TagStudio` directory before testing migrations or bulk operations.

## License and attribution

This fork remains licensed under [GPL-3.0](LICENSE). Its history includes work from the upstream
TagStudio contributors; consult the Git history for authorship and provenance.
