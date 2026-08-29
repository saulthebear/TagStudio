# Development

## Working locally

Install Python and web dependencies with the commands in the root README. `bun run dev` starts
both development servers; individual scripts are available for debugging either side separately.

Use `TAGSTUDIO_APP_DATA_DIR` to redirect process-wide logs and metrics to an isolated directory.
Tests set this automatically so they never write to the developer's normal application-data path.

## Continuous integration

Normal pushes and pull requests targeting `main` run:

- Python formatting, linting, typing, API/core tests, coverage, and OpenAPI contract validation
- Web typechecking, linting, unit tests, production build, and the complete Playwright suite
- GitHub Actions workflow validation with actionlint when workflow files change

Playwright retains traces, screenshots, and an HTML report only when a browser test fails. Pull
requests that change dependency manifests also receive GitHub Dependency Review.

## Compatibility policy

The supported frontend is the Web UI. Python remains a required local backend, but native Qt UI
and packaged desktop releases are out of scope. Preserve SQLite migration coverage when changing
the database schema; legacy JSON import compatibility is not required.
