# open_brain

**Parent:** [GitHubPolishes](../AGENTS.md)

## Purpose

<!-- AGENTS-PURPOSE START -->
One shared memory layer for Cursor, Claude, and any MCP client: thoughts stored in **Postgres + pgvector**, exposed via an **MCP server** with semantic search, capture, and soft-delete (invalidation).
<!-- AGENTS-PURPOSE END -->

## Navigation

<!-- AGENTS-NAV START -->
### Subfolders
- [scripts/](./scripts/AGENTS.md) — Workspace folder: scripts
- [src/](./src/AGENTS.md) — Workspace folder: src

### Key files
- `AGENTS.md`
- `package.json`
- `README.md`
- `schema.sql` / `schema-ollama.sql`
- `package-lock.json`
- `tsconfig.json`

_Navigation auto-synced by `scripts/sync_agents_md.py`. Edit Purpose above; re-run sync after adding/removing folders or key files._
<!-- AGENTS-NAV END -->

## Public repository boundary

This is a public repository. Architectural changes and public-safe implementation are in scope. Never add private data, secrets, personal memory, raw transcripts, account-specific configuration, or private operational artifacts. Keep credentials in ignored local environment files and keep private verification receipts outside this repository.

### Secret scan

`scripts/check-no-secrets.mjs` scans for tailnet names (`*.ts.net`), tailnet addresses (the IPv4 `100.64/10` range and the IPv6 `fd7a:115c:a1e0` prefix) and JWT strings. It prints the file, the line number and the pattern class, never the matched text. The scan logic is in `scripts/secret-scan.mjs`.

The scan has three modes:
- No argument: the current content of each tracked file.
- `--range <from>..<to>`: the added lines of each commit in the range. A value that one commit adds and a later commit removes is still found, because the public history keeps it.
- `--pre-push <remote>`: the commits that a push sends. The pre-push hook uses this mode.

CI runs the current-files scan and the commit scan on each push and pull request.

1. Run the scan by hand: `npm run scan:secrets`.
2. Install the pre-push hook one time in each clone: `git config core.hooksPath .githooks`.
3. If a finding is a false positive, add an entry to `.secret-scan-allow`, with the reason in a comment. Prefer `<path> <pattern-class> <full-commit-sha>`, which permits the value only in that commit. `<path> <pattern-class>` permits it in the whole file, and also hides a later real value. A commit-scoped entry does not cover a merge commit that brings the same line in again, so use it only for a line that a later commit removes.

The scan does not read commit messages, author names, file names or tag messages. Do not put a private value in them.

## Hermes delivery and safety

Treat `README.md`, `package.json`, `src/`, `schema*.sql`, and `scripts/` as authoritative. Use Node >=18 and run `npm run build` and `npm run test:env` when dependencies and a safe environment are available. Do not run `npm run init-db` or mutate a database without explicit approval. Workers own explicit files; reviewers are read-only.
