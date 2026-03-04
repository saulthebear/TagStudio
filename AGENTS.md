# AGENTS.md

This file documents repository-specific execution guidance for coding agents working in `TagStudio`.

## Scope

- Applies to the entire repository unless overridden by deeper, path-specific agent guidance.
- Focuses on operational reliability and first-run success in this environment.

## Session Preflight (Run First)

Run these commands before making assumptions about branch state or tooling:

```bash
git status --short --branch
git log --oneline --decorate -n 5
git remote -v
bun --version && node --version
```

Purpose:
- lock branch/head context
- detect local/remote drift early
- confirm runtime/toolchain availability

## Known Environment Constraints

In this environment, sandbox restrictions can block key workflows:

- `gh` network calls may fail in sandbox with API connectivity errors.
- `gh api` commands with unquoted query params can fail in `zsh` glob expansion.
- `git` index writes may fail in sandbox with `.git/index.lock: Operation not permitted`.
- Playwright Chromium launch may fail in sandbox due macOS permission constraints (Mach rendezvous/bootstrap errors).

Default policy for this repo:
- prioritize first-run success for known constrained commands
- rerun critical commands with escalation immediately after sandbox denial/failure

## Escalation Rules (Operational)

Use escalated execution by default for these command classes in this environment:

- `gh pr view ...`
- `gh api ...`
- `gh api graphql ...`
- `bun run --cwd apps/web e2e`

For git write operations:
- if you hit `.git/index.lock` or similar write-permission errors on `git add`, `git commit`, or `git push`, rerun escalated immediately.

No extra user roundtrip should be needed after a known sandbox-related failure for critical commands.

## GitHub CLI Command Hygiene

Always quote `gh api` endpoints containing `?` or `&`.

Example:

```bash
gh api 'repos/<owner>/<repo>/pulls/<n>/comments?per_page=100'
```

Canonical PR-review commands:

1. List inline review comments:

```bash
gh api 'repos/<owner>/<repo>/pulls/<n>/comments?per_page=100'
```

2. List review threads (GraphQL):

```bash
gh api graphql -f query='query { repository(owner:"<owner>", name:"<repo>") { pullRequest(number:<n>) { reviewThreads(first:100) { nodes { id isResolved isOutdated path line comments(first:10) { nodes { id author { login } body url createdAt } } } } } } }'
```

3. Reply to an inline review comment:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/comments/<comment_id>/replies -f body='...'
```

4. Resolve a review thread:

```bash
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}' -f id='<thread_id>'
```

5. Confirm thread resolution status:

```bash
gh api graphql -f query='query { repository(owner:"<owner>", name:"<repo>") { pullRequest(number:<n>) { reviewThreads(first:100) { nodes { id isResolved path line } } } } }'
```

## Playwright Guidance

Preferred validation sequence for web changes:

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
bun run --cwd apps/web e2e
```

Notes:
- In this environment, run `e2e` escalated by default for reliability.
- If `e2e` fails with Chromium launch permission errors, treat as environment/sandbox issue first, not app regression.

## Artifact Hygiene

After Playwright runs, remove generated artifacts that should not be committed:

```bash
rm -rf apps/web/test-results
```

If project conventions change, update this cleanup path accordingly.

## PR Comment Workflow Template

For "address PR comments" tasks, follow this sequence:

1. Verify branch baseline (`status/log/remote` preflight).
2. Push current baseline branch before new edits (so existing fixes are visible on PR).
3. Implement code changes.
4. Run validation commands (`typecheck`, `build`, `e2e` as needed).
5. Push changes.
6. Post concise per-thread replies describing what changed and where.
7. Resolve addressed threads.
8. Confirm targeted threads are resolved via GraphQL query.

## Assumptions for This Guidance

- `gh` authentication is already configured.
- Playwright browser binaries are already installed.
- Sandbox behavior remains similar to current observed environment constraints.
