## Implementation plan
# Implementation plan: two-door house brain

Design: `docs/designs/two-door-house-brain.md` (approved 2026-11-12, with six decisions recorded).
Base branch: `main`. Repository: a fork of `Rixter145/open_brain`. The repository is public.

## Goal

Give one user one memory for all AI clients, on the PC and on the phone. One Node process on a home server has two HTTP doors. The private door (tailnet) has all 5 tools. The public door (Claude phone app) starts with 3 read tools behind OAuth bearer-token checks. `capture_thought` without `supersedes` goes on the public door later.

## Facts verified in the code

| # | Fact | Effect |
|---|---|---|
| M1 | `package.json` has no `test` script. No test directory and no `.github` directory exist. | Task P1 adds the test runner and the workflow. |
| M2 | `src/index.ts` makes the `McpServer` at module level and calls `main()` on import. | A test can not import it. Task P2 comes before each tool test. |
| M3 | Each tool uses a plain `z.object(...)`. Zod removes unknown keys and does not reject them. | Each tool schema is strict (task P2b). A test proves the rejection. |
| M4 | `searchThoughts(queryEmbedding, limit)` gets no query text. | The signature takes the query text, the vector, the scope and the limit. |
| M5 | `search_brain` permits a `limit` of 50. | Each candidate list has `max(20, limit)` rows (decision 1). |
| M6 | `useOllama()` is true when `OLLAMA_HOST` is set and no OpenAI key exists. An unknown provider value falls through to OpenAI. | One provider resolver rejects an unknown value. The stub check is first. |
| M7 | `src/db.ts` has a pool with no close function and reads only `DATABASE_URL`. | Add `closePool()`. Tests use `TEST_DATABASE_URL`. |
| M8 | `scripts/init-db.mjs` runs one schema file only. | `npm run migrate` applies the schema and the migrations (task P4). |
| M9 | `scripts/test-env.mjs` and `scripts/test-save.mjs` do not know the stub or `scope`. | Update them in the same commits. |
| M10 | `express` and `jose` are only transitive dependencies of the SDK. | They become direct dependencies (decision 2). |
| M11 | `package.json` has `"prepare": "npm run build"`. | The Dockerfile copies `src` and `tsconfig.json` before `npm ci`. |
| M12 | `.gitignore` ignores only `.env`. | Task P9 adds rules for `.env.*`, probe tokens, dumps and a real unit file. |
| M13 | `AGENTS.md` names files that do not exist (`scripts/sync_agents_md.py`). | Update the navigation block by hand. |

## SDK facts verified in the source of SDK 1.27.1

| # | Fact |
|---|---|
| S1 | Stateless mode is `sessionIdGenerator: undefined`. A stateless transport can not serve two requests. |
| S2 | `requireBearerAuth` sends `403` only for `InsufficientScopeError`. It has no `403` for a wrong subject. |
| S3 | `requireBearerAuth` rejects a token with no expiry time. It reads only the `Authorization` header. |
| S4 | `mcpAuthMetadataRouter` needs the full metadata of the authorization server and serves only the address with the path suffix. |
| S5 | `createMcpExpressApp` adds the host check only for a localhost bind, unless `allowedHosts` is given. It also runs `express.json()` before each other middleware (`express.js:29`), so the doors do not use it (Gate 1, G1). |
| S6 | An input that fails validation comes back as a tool result with `isError: true`. |
| S7 | `InMemoryTransport.createLinkedPair()` exists. |

## Decisions of the owner

1. Each candidate list of `search_brain` has `max(20, limit)` rows.
2. `express` and `jose` are direct dependencies. `@types/express` is a dev dependency.
3. The public tool set is a constant in the code, not an environment variable.
4. The Phase 0a spike has no database. `brain_stats` returns fixed zero counts.
5. A `supersedes` id that is unknown or already invalid gives an error, and no fact is stored.
6. The sign-in uses `requireBearerAuth` from the SDK, plus a small subject check for `403` and a small metadata route at the two address forms.

## Assumptions

| # | Assumption |
|---|---|
| A1 | The HTTP endpoint path is `/mcp` on each door. |
| A2 | Tests are TypeScript files in `test/`. They run with `node --import tsx --test`. |
| A3 | CI and the Docker image use Node 22. The `engines` field becomes `>=22`. |
| A4 | `superseded_by` is a plain `UUID` with no foreign key. |
| A5 | "Letter or digit" in the token rules means Unicode letters and digits. |
| A6 | The Phase 0 spike code stays on a branch that does not merge into `main`. |

## Gaps in the design, with the planned handling

| # | Gap | Handling |
|---|---|---|
| G1 | `${TAILNET_IP}:8787:8787` with an empty variable publishes on all interfaces. | The Compose file uses `${TAILNET_IP:?TAILNET_IP is required}`. |
| G2 | Claude Desktop reads stdio servers from a local file. Its remote connectors start in the Anthropic cloud and can not reach a tailnet address. | Test in Phase 0a. A stdio-to-HTTP bridge such as `mcp-remote` is the probable answer. |
| G3 | The private door is plain HTTP on a tailnet address. Some clients refuse HTTP for an address that is not localhost. | Test in Phase 0a with Claude Code. |
| G4 | The Phase 2 exit check "a tool list shows no write tool" needs a valid token. | Read the tool list in the Claude connector, or give an optional valid token to the probe. |
| G5 | A number such as `2024` is a part token by the rule. | Accept it. One test documents the behavior. |
| G6 | A public door with missing OAuth values is not specified. | The public door refuses to start. |

## Files

| File | Change |
|---|---|
| `src/index.ts` | Becomes a small start file: reads the mode, starts stdio or the doors. |
| `src/tools.ts` (new) | `registerTools(server, profile, ctx)`, the door profiles and the one error wrapper. |
| `src/config.ts` (new) | The configuration check. It returns a problem list. |
| `scripts/migrate.mjs` (new) | Applies `schema-ollama.sql` and each migration. |
| `docs/errors.md`, `CHANGELOG.md` (new) | One anchor for each `OB_` code; the breaking changes. |
| `src/http.ts` (new) | `createDoorApp(...)` and `startDoors(...)`. Tests import it and listen on port 0. |
| `src/auth.ts` (new) | Token verifier (6 checks), subject middleware, metadata route. |
| `src/search.ts` (new) | Pure functions: part tokens, word tokens, fusion and final order. |
| `src/db.ts` | Scope, `embedding_model`, hybrid queries, supersede transaction, `closePool()`. |
| `src/embeddings.ts` | Provider resolver, stub provider, `getEmbeddingModelName()`. |
| `migrations/001-scope-hybrid.sql` (new) | The 4 columns, the `CHECK`, the GIN index. |
| `test/` (new) | `helpers/db.ts` and one test file for each area. |
| `.github/workflows/ci.yml` (new) | Build and tests with a `pgvector/pgvector` service container. |
| `Dockerfile`, `.dockerignore`, `compose.yaml` (new) | Three services. Only `open_brain` publishes ports. |
| `deploy/open-brain.service.example` (new) | Unit file with placeholder values. |
| `deploy/backup.example.sh` (new) | Nightly `pg_dump` example. |
| `scripts/probe-public-door.mjs` (new) | The 5 probe cases. Reads tokens from an ignored file. |
| `scripts/check-no-secrets.mjs` (new) | CI scan for tailnet names, tailnet addresses and JWT strings. |
| `scripts/test-env.mjs`, `scripts/test-save.mjs`, `scripts/init-db.mjs` | Stub and scope updates. |
| `package.json`, `package-lock.json` | `test` script, direct `express`, `jose` and `express-rate-limit`, `@types/express`. |
| `.gitignore`, `.env.example` | New ignore rules and new variable names with placeholder values. |
| `README.md`, `AGENTS.md` | New modes, tools, migration steps, model pull step, navigation. |

## Tasks

Each row is one commit. Each row holds the requirements that name its task in the three requirement lists after "First commits". The lists have the full text and the tests of each requirement. The "Tests" column here names the main tests only.

### Track P: no dependency on the spikes

| ID | Task | Files | Depends on | Tests in the same commit |
|---|---|---|---|---|
| P9 | Add ignore rules, the `.env.example` names with one comment line each, the secret scan (output rules, allow file, `pre-push` hook) and the correct `repository.url`. | `.gitignore`, `.env.example`, `scripts/check-no-secrets.mjs`, `package.json`, `AGENTS.md` | none | The scan reads only the files of `git ls-files` and passes on the current tree. A JWT string that the test makes at run time is found and is not printed. |
| P1 | Add the test runner with `--test-concurrency=1`, the database helper with its guard, `closePool()`, the pool timeouts, `npm run test:db:up`, the workflow and `engines >=22`. | `package.json`, `test/helpers/db.ts`, `.github/workflows/ci.yml`, `src/db.ts` | none | One smoke test: the helper prepares the schema, and `brain_stats` returns zero. The guard throws for equal database addresses. The pure tests run with no database. |
| P2a | Move the 5 handlers to `src/tools.ts` with no change of behavior. Stdio stays the default mode. | `src/tools.ts`, `src/index.ts` | P1 | The 5 tools are listed through `InMemoryTransport`, and each one answers as before. |
| P2b | Prove strict schemas on the SDK. Add the door profiles, strict schemas, the one error wrapper with the `ctx` parameter, the `OB_` codes, the redaction rule and `docs/errors.md`. | `src/tools.ts`, `docs/errors.md` | P2a | Tool sets of 5, 3 and 4 tools. A misspelled key fails and stores no row. A call of a tool that is not in the profile fails. A failed `CHECK` does not put row content into stderr. |
| P3 | Add the provider resolver, the stub, the model name, the embedding timeout and the embedding error text. Reject an unknown provider value. | `src/embeddings.ts`, `scripts/test-env.mjs`, `scripts/init-db.mjs` | P1 | The stub gives 768 values, is the same for the same text, and is not a zero vector. An unknown value gives an error. An embedder that never resolves times out. |
| P4 | Write the migration, the `schema_migrations` table, `npm run migrate` and the schema check function. | `migrations/001-scope-hybrid.sql`, `scripts/migrate.mjs`, `src/db.ts`, `test/helpers/db.ts`, `package.json` | P1 | A second run gives no error and no change. A row with `scope = 'garden'` is rejected. The migration on a database that has rows sets `scope`, and sets `embedding_model` only on rows with 768 values. After a run, `schema_migrations` has version 1. A database with a lower version than the code needs gives `OB_SCHEMA_OLD`. |
| P5 | Add `scope`, `embedding_model`, the scope list of the profile, the validation messages, the length limits, the scope in the output, the stats by scope and the model filter. Add the "Breaking change" note and `CHANGELOG.md`. | `src/db.ts`, `src/tools.ts`, `scripts/test-save.mjs`, `README.md`, `CHANGELOG.md` | P2b, P3, P4 | The scope cases of the design. The public profile returns no `work` row. The public `brain_stats` counts 2 of 3 rows. A call with no `scope` returns the custom text. |
| P6 | Add the token functions, the stop-word list and the merge function. | `src/search.ts` | P1 | Token examples of the design, the apostrophe case, the empty case, the 3-character minimum, the fusion order. "what is the paint colour of the bedroom" gives the word tokens `paint`, `colour` and `bedroom` only. No database. |
| P7 | Add the text list and the merge to `searchThoughts`, with `max(20, limit)`, the exact vector scan and the degraded search. | `src/db.ts`, `src/tools.ts` | P5, P6 | The 3 part-number cases, each with 3 competitor rows. The `%` and `_` escape case. 200 `work` rows and 3 `house` rows: a `house` search returns the 3 rows. The degraded search returns the text matches. A question with no part token and many stop words returns the row that the vector list ranks first. |
| P8 | Add `supersedes` with the read, the insert and the guarded update in one transaction. Add the source prefix rules. | `src/db.ts`, `src/tools.ts` | P5 | One test for each of the three supersede codes. Two parallel captures give one success. A superseded row is absent from the two lists. `public:unknown` is stored for a public capture with no `source`. |

### Phase 0a and 0b: spike code (branch not merged)

| ID | Task | Files | Depends on |
|---|---|---|---|
| S0a | Write a throwaway HTTP server with only `brain_stats` and no database. Log each request path and each header name. Run it before pull request 2 starts. | one spike file | none |
| S0b | Write the first `src/auth.ts`: verifier with an injected key source, subject check, metadata route. Put it on the spike server. Run it before pull request 3 starts. | `src/auth.ts`, `test/auth.test.ts` | S0a, P1 |

Tests for S0b: the 5 token checks and the subject middleware (G2), with tokens that the test signs with `jose`. The key pair is made at run time, so no token is in git.

### Phase 1: private door

| ID | Task | Files | Depends on | Tests |
|---|---|---|---|---|
| H1a | Add `createDoorApp` for one profile. Build it by hand on `express()` in the middleware order of G1, not with `createMcpExpressApp`. Add the HTTP mode, one server and one `ctx` for each request, the required host list, the `400` for a batch, `/healthz` and the shutdown handler. | `src/http.ts`, `src/index.ts` | P2b, P3, result of S0a | An HTTP client lists 5 tools on port 0. 10 parallel calls succeed. A wrong `Host` header is rejected. `GET /mcp` gets `405`. A batch gets `400`. A `POST` with no `Accept: application/json, text/event-stream` gets `406`. |
| H1b | Add the configuration check, the schema check at start with its retry, the start line with the model count and the stub guard. | `src/config.ts`, `src/index.ts` | H1a, P4 | Two absent variables give two problems and exit code 78. An old schema gives `OB_SCHEMA_OLD`. A database that is down gives `OB_DB_UNAVAILABLE`. The names in `.env.example` agree with the check. |
| H1c | Add the request log with `request_id`, `error_code` and `degraded`, and `/readyz`. | `src/http.ts` | H1a | The log line of a capture has the tool name and no content. `/readyz` gives `503` and the failed check when the embedder throws. |
| H2 | Add the Dockerfile and the Compose file with the two published ports, the Postgres health check, log rotation and `init: true`. | `Dockerfile`, `.dockerignore`, `compose.yaml` | H1c | `docker compose config` fails when `TAILNET_IP` is empty. The first run order works on an empty volume. Checks by hand. |
| H3 | Add the unit example (the one supervisor at boot) and the backup example. | `deploy/*` | H2 | The secret scan passes. |
| H4 | Update the README (first five minutes, client blocks, runbooks, deploy order, tests) and `AGENTS.md`. | `README.md`, `AGENTS.md` | H1a to H3, result of Phase 0a | The secret scan passes on the README. |

### Phase 2: public door, read-only

| ID | Task | Files | Depends on | Tests |
|---|---|---|---|---|
| U1 | Add `src/auth.ts` and `test/auth.test.ts` in the form that Phase 0b proved: the verifier with its 5 token checks, the key error rule, the subject middleware (separate from the verifier, G2) and the metadata route. | `src/auth.ts`, `test/auth.test.ts` | recorded 0b result | The 5 token checks. `alg: none`, `HS256` and an unknown `kid` get `401`. A key fetch that fails on the network gets `500`. A token for a wrong subject passes the verifier and gets `403` from the subject middleware. A token that expired 10 seconds ago gets `401`. |
| U2 | Start the public door with the `PUBLIC_READ` profile: token check before the body parser, the two limits (the pre-auth limit keyed by client, G3), the error bodies, the public error text and the "Scopes searched" line. Refuse to start if an OAuth value is absent. | `src/http.ts`, `src/index.ts`, `compose.yaml`, `package.json` | U1, H1c | A `401` has `WWW-Authenticate`. The metadata route answers with no token. A wrong subject gets `403`. The tool list has 3 tools. A call of `invalidate_thought` or `capture_thought` by name fails and changes no row. |
| U3 | Add the probe script: the 5 token cases, and the calls of the hidden tools with a valid token. The probe reads the hidden tool list from the exported profile constant, and it never calls `capture_thought` with real content (G4). | `scripts/probe-public-door.mjs` | U2 | Run against a local door with tokens that a test signs. The output has no token. Each request sends `Accept: application/json, text/event-stream`. |

### Phase 3: public capture

| ID | Task | Files | Depends on | Tests |
|---|---|---|---|---|
| C1 | Change the profile of the public door from `PUBLIC_READ` to `PUBLIC_CAPTURE`. The probe follows the profile constant, so it needs no change. If a probe case still expects `capture_thought` to fail, correct that case in this commit. | `src/index.ts`, `scripts/probe-public-door.mjs` (only if necessary) | probe passed, restore passed | The public list has 4 tools. `capture_thought` has no `supersedes`. A call of `invalidate_thought` by name fails. |

## Owner tasks (by hand, not in git)

| Phase | Owner task |
|---|---|
| All | Enable GitHub Actions on the fork. |
| 0a | Start the spike on the home server. Open Tailscale Funnel. Add the connector on Claude web, then use it on the phone. Close the tunnel in the same hour. |
| 0a | Connect Claude Code and Claude Desktop to the spike over the tailnet. |
| 0b | Create the identity provider account. Set the audience. Register the client. Record the provider name and the connector requests in the design document. |
| 0b | Save the probe tokens in an ignored file on the home server. |
| 1 | Write `.env`. Run `docker compose up -d postgres`. Approve and run `docker compose run --rm open_brain npm run migrate`. Run `docker compose up -d --build`. Pull the `nomic-embed-text` model. |
| 1 | Add a Tailscale ACL that permits port 8787 only from the owner's devices. |
| 1 | Restore one dump into a scratch container. Measure one time the time from `git clone` to the first search in a second client. |
| 1 | After 14 days of use, record the count of facts and decide if Phase 2 starts. |
| 1 | Copy the unit example, fill the values, enable the unit. Restart the home server and check. |
| 1 | Install the nightly dump job and the weekly copy job. |
| 1 | Capture the 20 house facts. Update the capture instructions of each client for the required `scope`. |
| 2 | Set the tunnel to `127.0.0.1:8788`. Add the OAuth values to `.env`. Add the connector. |
| 2 | Run the probe and the network check. Restart and check the two doors. |
| 3 | Restore one dump into a scratch container. Run the probe again. |

## Risks, ranked

| Rank | Risk | Cheapest check | Settled by |
|---|---|---|---|
| 1 | No identity provider gives a JWT with the correct audience through a registration method that the connector accepts. | One sign-in with the spike and a request log. | 0b |
| 2 | The connector requests a metadata form that the server does not serve. | Read the request log of the spike. | 0b |
| 3 | The connector can not reach a Funnel address, or the stateless transport fails with it. | One `brain_stats` call from Claude web. | 0a |
| 4 | Claude Desktop can not use a tailnet HTTP address. | Point the two PC clients at the spike. | 0a |
| 5 | The private port opens on all interfaces because of an empty variable. | `docker compose config` with no `TAILNET_IP`. | H2 |
| 6 | A wrong provider value sends a note to a cloud provider. | The unit test of P3. | P3 |
| 7 | A test deletes real rows. | The helper stops without `TEST_DATABASE_URL` and the test flag. | P1 |
| 8 | A personal value goes into the public repository. | The secret scan in CI, and a review of each diff. | P9 |
| 9 | Ollama on the CPU is slow. | Time one call to `/api/embed`. | Phase 1 |

## Acceptance criteria

**Phase 0a**
1. The phone app shows one successful `brain_stats` result.
2. The owner closed the tunnel in the same hour.
3. The owner recorded if Claude Code and Claude Desktop connect over the tailnet.

**Phase 0b**
1. The Claude connector shows one tool result after a sign-in.
2. The design document names the provider and lists what the connector requested.
3. The tunnel is closed.
4. The record states if the connector accepts a static header credential.

**Phase 1**
1. `npm run build` and `npm test` pass in CI on the fork.
2. A search for `20x25x1` with `scope: house` returns the furnace filter fact first.
3. A search with `scope: work` returns zero house facts. A search with no `scope` is rejected.
4. All 5 tools work from Claude Code and from Claude Desktop, and one client that is not a Claude client (Cursor) lists the 5 tools and completes one search.
5. A request to port 8787 on the LAN address gets no connection.
6. After a power cycle of the home server, the private door answers with no manual work.
7. A second run of the migration gives no error.
8. A request to port 8788 on the LAN address gets no connection.
9. One restore of a dump into a scratch container succeeds, and the row count agrees.
10. `/readyz` on the private door answers `ready`.

**Phase 2**
0. The owner recorded the use check and decided to continue.
1. The probe passes its 5 cases: `401` for the first four, `403` for the wrong subject.
2. The tool list of the public door shows the 3 read tools only.
3. The phone app, away from the home network, finds a fact that Claude Code captured.
4. After a restart, the tunnel and the two doors answer with no manual work.

**Phase 3**
1. The probe passes again.
2. One restore of a dump into a scratch container succeeds.
3. The public tool list has 4 tools and does not list `invalidate_thought`.
4. A public call that sends `supersedes` gets an error, and the row count does not change.
5. `git log -p` shows no host name, address, token or personal note.

## First commits

| # | Branch (pull request) | Tasks |
|---|---|---|
| 1 | `chore/guards-and-test-harness` | P9, P1 |
| 2 | `feat/scope-and-hybrid-search` | P2a, P2b, P3, P4, P5, P6, P7, P8 |
| 3 | `feat/private-door` | H1a, H1b, H1c, H2, H3, H4 |
| 4 | `feat/public-door` | U1 (adds `src/auth.ts` and its tests), U2, U3 |
| 5 | `feat/public-capture` | C1, after the Phase 2 exit check |
| - | `spike/phase-0-reach` (do not merge) | S0a, S0b |

Each task stays one commit, in the order of the task tables.

## Requirements

The three lists below hold the full text and the tests of each requirement that the reviews added. The task tables name the task of each one. Where an earlier item and a later item disagree, the later item applies.

<!-- autoplan-accepted:ceo -->
- Health route (tasks H1 and U2). Each door serves `GET /healthz` with no sign-in. The route is a liveness check only and does not call the database. The private door returns `{"status":"ok","version":"<version>"}`, and the server reads the version from `package.json` at start. The public door returns `{"status":"ok"}` only. The list of permitted host names applies to this route. The rate limit does not apply to it. The unit file example (H3) and the restart checks of Phase 1 and Phase 2 use this route. Test: the route answers `200` on each door with no token, the public body has no version, and no body has row content.
- Request log (task H1; the `401` case in task U2). Each HTTP door writes JSON lines to stderr. Stdio writes no request line. The fields are `door`, `method`, `tool`, `http_status`, `is_error` and `duration_ms`. One HTTP middleware owns each line and writes it when the response finishes. (1) For a response with no handled JSON-RPC message (for example `400`, `401`, `403`, `404`, `405`, `429` or a host rejection), the line has `method: null` and `tool: null`. (2) For each JSON-RPC message of a handled request, the line has the `method` from the request body. For `tools/call`, `tool` is `params.name` from the request body; for each other method, `tool` is null. (3) `is_error` is null for a method that is not `tools/call`. For `tools/call`, a wrapper in `registerTools` records the flag of the tool result for the current request in an `AsyncLocalStorage` store, and the middleware reads it. If the wrapper recorded nothing, the line has `is_error: true`: the SDK validates the input before it calls the handler, so a call with invalid input or an unknown tool does not reach the wrapper. No line has the note content, the search query, the `source` value or a token. Tests: the line for a `capture_thought` call has `tool: "capture_thought"` and `is_error: false` and does not contain the content string; a `capture_thought` call with 8193 characters writes a line with `tool: "capture_thought"` and `is_error: true`; a request with no token on the public door writes a line with `http_status: 401` and `method: null`.
- Public source marker (task P8 for the logic, task C1 only opens the tool). `registerTools` gets an option `sourcePrefix`. The public tool set uses `sourcePrefix: "public:"`. With a prefix, the stored `source` is the prefix followed by the value from the client, or the prefix alone when the client gives no value. With no prefix (private door and stdio), a `source` that starts with `public:` fails validation. The value from the client has a maximum length of 64 characters in each mode, before the prefix is added. Tests: a capture with the prefix and `source: "private"` stores `public:private`; a capture with the prefix and no `source` stores `public:`; a capture with no prefix and `source: "public:x"` fails and stores no row; a client value of 65 characters fails.
- Length limit (task P5). `content` of `capture_thought` and `query` of `search_brain` have a maximum length of 8192 characters in the shared tool schema, so the limit applies in stdio and on each door. A longer value fails validation and nothing is stored. Reason: the Ollama and Google embedders cut the text at 8192 characters (`src/embeddings.ts:43`, `58`), and the OpenAI embedder cuts at 8191 (`src/embeddings.ts:76`). Tests: 8192 characters pass, 8193 characters fail.
- Scope in the output (task P5). `ThoughtRow` and each `SELECT` in `src/db.ts` get the `scope` column, and `formatThoughtForOutput` shows it. Test: the output of `search_brain` contains the scope of each row.
- Scope values (task P4 and P5, from the design). The permitted values of `scope` are `house`, `work` and `general`. `search_brain` and `list_recent` also accept `all`. A row that exists before the migration gets `general`.
- Static header check (owner task, Phase 0b). The Phase 0b record states if the Claude connector accepts a static header credential. `requireBearerAuth` rejects a token with no expiry time, so a static credential needs a different verifier; the record notes this.
- Rate limit (task U2). The public door has one global limit of 120 requests each minute on the `/mcp` route. The limiter runs after the token check and the subject check, so a request with no valid token gets `401` or `403` and does not use the limit. A client with no token can not lock the owner out. The limiter has a constant key, because each request comes from the tunnel with the same peer address. The limit value is a parameter of `createDoorApp`, so a test can set it to 2. A request over the limit gets `429`. `GET /healthz` and the metadata route are not limited. `express-rate-limit` becomes a direct dependency in `package.json` (it is in the lock file through the SDK). Tests: with a limit of 2, signed-in request 3 gets `429` and `/healthz` still gets `200`; 5 requests with no token get `401` and the next signed-in request succeeds. (Taste decision. The owner can decline it at the final gate.)
- Pull requests. The work goes to the fork in 5 pull requests. The "First commits" table gives the branch names and the tasks of each one. The spike branch does not merge. Each task stays one commit, and an addition in this list goes into the commit of the task that it names. (Taste decision.)
- Scope list for each door (task P5 for the option, task U2 for the public value). `registerTools` gets an option `allowedScopes`. The private door and stdio permit `house`, `work` and `general`. The public door permits `house` and `general` only, as a constant in the code. On the public door, `scope: all` means the permitted scopes, `scope: work` fails validation, and a public capture can not use `work`. Tests: a public search with `scope: all` returns no `work` row; a public search with `scope: work` fails; a public capture with `scope: work` fails and stores no row. (Taste decision. The owner can permit `work` on the phone at the final gate.)
- Spike order and result table. Task S0a runs before pull request 2 starts. Task S0b runs before pull request 3 starts. The result of Phase 0b selects one path: (a) a provider passes: continue with Phase 2. (b) no provider passes, but the connector accepts a static header credential: stop, and the owner decides on a design for a static credential before any Phase 2 code. (c) the two fail: the plan ends after Phase 1 with the private door, and Phases 2 and 3 are not built.
- Use check before Phase 2 (owner task, no code). After 14 days of use of the private door, the owner records the count of facts from `brain_stats` and decides if Phase 2 starts. Phase 2 gets acceptance criterion 0: "The owner recorded the use check and decided to continue." (Taste decision.)
- Second vendor check. Phase 1 acceptance criterion 4 becomes: "All 5 tools work from Claude Code and from Claude Desktop, and one client that is not a Claude client (Cursor) lists the 5 tools and completes one search."
- Degraded search (task P7). If the embedding call fails in `search_brain`, the tool returns the text list only, and the first line of the result says that the vector search is not available. `capture_thought` still fails when the embedding call fails, and stores nothing. Test: with an embedder that throws, a search for a stored part number returns the row and the note.
- Error text (task P2 for the wrapper, task U2 for the public value). One wrapper in `registerTools` holds the error handling for each tool; the five copies of the `try/catch` block are removed. The wrapper writes the error detail to stderr. On the private door and stdio, the tool result has the error message, as today. On the public door, the tool result has the fixed text "Error: the request failed." and no detail. A validation error of the SDK keeps its own text. Test: with a database that fails, the public tool result does not contain the database message.
- Key fetch failure (task U1). If the token verifier can not get the key set of the provider, it throws the `ServerError` of the SDK. The middleware then sends `500`, and the request log has the line. It does not send `401`, so the connector does not start a new sign-in. Test: a verifier with a key source that throws gives `500`.
- Parallel supersede (task P8). The insert of the new row and the `UPDATE` of the old row with `WHERE invalidated_at IS NULL` run in one transaction. If the `UPDATE` affects 0 rows, the transaction rolls back. Test: two parallel captures that supersede the same row give exactly one success and one error, and one new row exists.
- Minimum length (task P5). `content` and `query` have a minimum length of 1 character. Test: an empty string fails validation.
- Start line (task H1). At start, the HTTP mode writes one JSON line to stderr with the mode, the doors, the tool set of each door, the scope list of each door and the embedding provider. The line has no secret and no address. Test: the line has the tool names and does not contain the value of `DATABASE_URL`.
- README runbook (task H4). The README gets a section "If the phone can not connect" with the checks in order: `/healthz` on the public address, the request log line, the tunnel, the identity provider. It also states the deploy order (apply the migration first, then start the new image), the rollback steps, and the checks after a deploy (`/healthz` on each door, `brain_stats`, one search for a known part number).
<!-- /autoplan-accepted:ceo -->

<!-- autoplan-accepted:dx -->
- Strict tool schemas (task P2). Each of the 5 tool schemas is strict on each door and in stdio, so an unknown key fails validation. This replaces "the strict public capture schema" of task P8: the public capture schema differs only because it has no `supersedes` field. Test: a private `capture_thought` call with the misspelled key `supercedes` returns `isError: true` and stores no row.
- Configuration table (task P9 for `.env.example`, task H1 for the check). The variables are: `OPEN_BRAIN_MODE` (`stdio` default, or `http`), `DATABASE_URL` (required, secret), `EMBEDDING_PROVIDER` (`openai`, `google`, `ollama`, `stub`), `OLLAMA_HOST` (optional), `PRIVATE_PORT` (default 8787), `PRIVATE_ALLOWED_HOSTS` (required in `http` mode, list with commas), `PUBLIC_PORT` (default 8788), `PUBLIC_ALLOWED_HOSTS`, `OAUTH_ISSUER`, `OAUTH_AUDIENCE`, `OAUTH_SUBJECT`, `OAUTH_JWKS_URL` (these five are required when the public door is on), `PUBLIC_DOOR` (`off` default, or `on`), `PUBLIC_RATE_LIMIT` (default 120), `OPEN_BRAIN_TEST` (test flag), `TEST_DATABASE_URL` (tests only), `TAILNET_IP` (Compose file only). `.env.example` has one comment line for each variable with the door, required or optional, and a placeholder. Test: the variable names in `.env.example` are the same set as the names that the configuration check reads.
- Configuration check at start (task H1; the provider part in task P3). One function checks the full configuration before a listener starts. It collects each problem, writes one line for each to stderr in the form `OB_CONFIG_MISSING: OAUTH_AUDIENCE is not set. Add it to .env. See docs/errors.md#ob_config_missing`, prints variable names and never values, and exits with code 78. It covers an unknown provider value, the stub in `http` mode with no test flag, an absent OAuth value with `PUBLIC_DOOR=on`, and an absent host list. Test: two absent variables give two lines and exit code 78.
- Schema check at start and one migrate command (task P4). A new script `npm run migrate` applies `schema-ollama.sql` and then each file in `migrations/` in order; each statement is idempotent. The owner runs it by hand after approval; the server never runs it. `npm run init-db` stays, and it prints a line that names `npm run migrate` for the Ollama schema. At start in `http` mode, the server checks that the `scope` column exists. If it does not, the server writes `OB_SCHEMA_OLD: the database has no scope column. Run: npm run migrate` and exits with code 78. The test helper and CI use the same script. This replaces the `psql` owner task of Phase 1. Tests: a start against a database with no `scope` column exits with 78 and the text; a second run of `npm run migrate` makes no change. (Taste decision: a script in place of `psql` by hand.)
- Readiness route (task H1). The private door serves `GET /readyz`. It checks one database query, the `scope` column and one embedding call, and returns `200` with `{"status":"ready"}` or `503` with the name of the failed check. The public door has no `/readyz`. `npm run test:env` does the same three checks from the command line. Test: with an embedder that throws, `/readyz` returns `503` and names the embedding check.
- Error codes and texts (task P2 for the wrapper, the tasks below for each text). Each tool error and each start error starts with a stable code. A new file `docs/errors.md` has one anchor for each code. The codes are `OB_CONFIG_MISSING`, `OB_CONFIG_INVALID`, `OB_SCHEMA_OLD`, `OB_VALIDATION`, `OB_EMBEDDING_UNAVAILABLE`, `OB_DB_UNAVAILABLE`, `OB_SUPERSEDE_NOT_FOUND`, `OB_SUPERSEDE_INVALID`, `OB_SUPERSEDE_CONFLICT` and `OB_INTERNAL`. Each tool error text states the operation, says "Nothing was stored." when that is true, and gives the next step. Texts: an embedding failure names the provider, the model and the variable `OLLAMA_HOST`, and for an Ollama `404` it gives the command `docker compose exec ollama ollama pull nomic-embed-text` (task P3). A supersede error has the id, the state ("not found", or "already invalid, replaced by <id>") and the next step "Run search_brain to find the current fact, then try again with its id" (task P8). The loser of a parallel supersede gets `OB_SUPERSEDE_CONFLICT` with "another capture replaced this fact; read it first" and no retry advice (task P8). Tests: each code has one test that checks the code and the "Nothing was stored." sentence where it applies.
- Validation messages (task P5). The Zod fields have custom messages: `scope` ("scope is required. Use one of: house, work, general (search and list also accept all)"), `content` and `query` length (the limit of 8192 and the actual length), `source` length, and the `public:` prefix rule. Each tool description has the same `scope` line. Test: a call with no `scope` returns the custom text.
- Request id (task H1). The middleware makes a `request_id` for each HTTP request. The request log line has `request_id` and `error_code` (null when no error). The error detail line on stderr has the same `request_id`. On the public door, the fixed error text becomes `Error [OB_INTERNAL]: the request failed. Nothing was stored. Try again one time. Reference: <request_id>`, with `OB_EMBEDDING_UNAVAILABLE` or `OB_DB_UNAVAILABLE` in place of `OB_INTERNAL` for those two classes. This replaces the fixed text "Error: the request failed." of the CEO block. Test: the reference in a public error result is the `request_id` of the log line.
- Error detail redaction (task P2). The error detail line on stderr has the error code and the message of the error only. It never has `err.detail`, the query parameters, the note content or a token. Test: a row that fails the `CHECK` constraint does not put its content into stderr.
- HTTP error bodies (task U2; the key fetch part in task U1). A `429` has the `Retry-After` header. The `403` of the subject check has the OAuth JSON form (`error`, `error_description`). A host rejection writes the rejected host name to the log and names `PRIVATE_ALLOWED_HOSTS` or `PUBLIC_ALLOWED_HOSTS`. The `500` of a key fetch failure has the body text "identity provider keys are not available, try again later", and the log has the provider host. Tests: the `429` has `Retry-After`; the `403` body has `error`.
- Degraded search flag (task P7). When `search_brain` returns the text list only, the request log line has `degraded: true`, and the first line of the result keeps the note. Test: the log line of a degraded search has `degraded: true`.
- Public result lines (task U2 for the scope line, task P8 for the source value). On the public door, the first line of a `search_brain` or `list_recent` result is "Scopes searched: house, general". A public capture with no `source` stores `public:unknown`; this replaces the bare `public:` of the CEO block. Tests: the scope line is in a public result; a public capture with no `source` stores `public:unknown`.
- Script output (task P9 for the scan, task U3 for the probe). `scripts/check-no-secrets.mjs` prints the file, the line number and the pattern class only, never the matched text, exits non-zero on a match, and reads an allow file for false positives. `scripts/probe-public-door.mjs` prints the expected and the actual status of each case, never prints a token, exits 0 only if all 5 cases pass, and exits with a different code and the expected path when the token file is absent. Tests: the scan output for a planted JWT string does not contain the string.
- Test loop (task P1). `npm test` runs with `--test-concurrency=1`, because the database tests share one database. Only the database test files import `test/helpers/db.ts`, so the tests of `src/search.ts` and `src/auth.ts` run with no database. A new script `npm run test:db:up` starts a `pgvector/pgvector` container for local tests. In CI, an absent `TEST_DATABASE_URL` makes the database tests fail, not skip. The `engines` field becomes `>=22`, and the `test` script names the test files with a quoted pattern that Node expands. Test: `npm test` with no `TEST_DATABASE_URL` still runs and passes the pure tests on the developer machine.
- Model check (task H1). The start line has the count of rows whose `embedding_model` differs from the active model. `/readyz` reports the same count. The server still starts. Test: one row with a different model gives a count of 1.
- Docs in the same commit (all tasks). Each commit that changes a tool contract or a setup step also changes the README section for it. Task P5 adds a "Breaking change" note for the required `scope` and a new `CHANGELOG.md` entry. Task H4 keeps the door, deploy and runbook text. Task P9 corrects `repository.url` in `package.json`, which has the placeholder `yourusername`.
- README blocks (task H4, after the Phase 0a result). The README gets one copy-paste block for each client with the placeholder `<tailnet-ip>`: the `claude mcp add --transport http` command for Claude Code, the JSON block for Claude Desktop (with the bridge if Phase 0a shows that it is necessary), the `mcp.json` block for Cursor, and the connector steps for the phone. It gets a section "First five minutes" with the commands in order (`cp .env.example .env`, `docker compose up -d --build`, `npm run migrate`, the model pull, one client block) and two prompts: capture a fact with a part number, then search for the part number from a second client. It gets "If the private door does not connect" (host list, `TAILNET_IP`, a client that refuses HTTP, model not pulled, migration not applied) and "Run the tests" (`npm run test:db:up`, the two variables, the stub provider). `AGENTS.md` gets the same test commands.
- Time to first result (owner task, Phase 1). The owner measures one time, with a clock, the time from `git clone` on the home server to the first search result in a second client, and records it in the design document. The target is 10 minutes or less with Docker installed.
<!-- /autoplan-accepted:dx -->

<!-- autoplan-accepted:eng -->
- Task tables are current (all tasks). The task tables, the owner tasks and the acceptance criteria in this plan hold each requirement of the three lists. Where a list item of an earlier phase and a later item disagree, the later item and the task tables apply. Task P2 is now P2a (move only) and P2b. Task H1 is now H1a, H1b and H1c.
- Door profiles (task P2b). One constant object for each door holds each switch: `name`, `tools`, `allowSupersede`, `sourcePrefix`, `allowedScopes` and `publicErrors`. The profiles are `STDIO`, `PRIVATE`, `PUBLIC_READ` and `PUBLIC_CAPTURE`. `registerTools(server, profile, ctx)` takes one profile; this replaces the separate options `tools`, `allowSupersede`, `sourcePrefix` and `allowedScopes`. A tool that is not in the profile is not registered, so a call by name fails. Tests: each profile lists its tools; on `PUBLIC_READ`, a `tools/call` for `invalidate_thought` and for `capture_thought` returns an error and no row changes; on `PUBLIC_CAPTURE`, a `tools/call` for `invalidate_thought` returns an error and the row stays valid.
- Request context as a parameter (tasks P2b and H1a). The door makes one `McpServer` and one `ctx` object for each HTTP request and gives `ctx` to `registerTools`. `ctx` has `requestId` and `record(result)`, which holds `is_error`, `error_code` and `degraded` for the log line. Stdio gives a `ctx` that does nothing. This replaces the `AsyncLocalStorage` store of the CEO list. A JSON-RPC batch array is rejected with `400`. Tests: a batch body gets `400`; the log line of a tool call has the values that `ctx.record` got.
- Strict schema proof (task P2b, first step). Before other work in P2b, one test proves on SDK 1.27.1 that a tool registered with `z.object(...).strict()` rejects an unknown key and that the published input schema has `additionalProperties: false`. If the SDK does not permit it, the wrapper checks the raw arguments for unknown keys, and the plan records that change.
- Validation code (task P5). An SDK validation error can not start with a code, because the SDK writes the first words. Each custom Zod message ends with `(OB_VALIDATION)`. The rule "each tool error starts with a code" applies to errors of the wrapper only.
- First run order (tasks H2 and H4, owner task of Phase 1). The order is: `docker compose up -d postgres`, then `docker compose run --rm open_brain npm run migrate`, then `docker compose up -d`, then the model pull. The README "First five minutes", the deploy runbook and the owner task use this one order. The image contains `scripts/`, `migrations/` and `schema-ollama.sql`, and `scripts/migrate.mjs` is plain JavaScript that runs with production dependencies only. `npm run test:env` runs in the container in the same way. Test (by hand, Phase 1): the three commands on an empty volume give a server that answers `/readyz` with `ready`.
- Ports and hosts (tasks H1a and H2). Compose publishes `${TAILNET_IP:?TAILNET_IP is required}:8787:8787` and `127.0.0.1:8788:8788`. `createDoorApp` refuses a host list that is empty. Tests: a request with a wrong `Host` header is rejected on each door. Phase 1 gets the acceptance criterion "A request to port 8788 on the LAN address gets no connection."
- One supervisor (tasks H2 and H3). The systemd unit is the one supervisor of the stack at boot: it has `After=` and `Wants=` for `tailscaled.service` and `docker.service`, waits for `tailscale ip -4` (120 seconds at most), then runs `docker compose up -d`, and has `Restart=on-failure`. The Compose restart policy restarts a container that crashes after a good start. The Compose file has a health check on Postgres and `depends_on` with `condition: service_healthy`, log rotation (`max-size`, `max-file`) and `init: true`. The restart checks of Phase 1 and Phase 2 use a real power cycle of the home server, not `docker restart`.
- Start against a database that is not ready (task H1b). The schema check at start tries the connection again for 60 seconds at most. A connection failure after that time exits with code 1 and `OB_DB_UNAVAILABLE`. Exit code 78 is only for `OB_SCHEMA_OLD` and configuration errors. In stdio mode, the same schema check runs at the first database use and returns `OB_SCHEMA_OLD` as a tool error. Tests: a database that is down at start gives retries and then `OB_DB_UNAVAILABLE`, not `OB_SCHEMA_OLD`; stdio on an old schema returns `OB_SCHEMA_OLD`.
- Exact vector scan with the scope filter (task P7). The vector list query runs in a transaction with `SET LOCAL enable_indexscan = off`, so Postgres applies the scope filter before the limit. Reason: the HNSW index applies a filter after its scan and can return too few rows for a small scope. An exact scan is some milliseconds at this size. Test: with 200 `work` rows and 3 `house` rows, a `scope: house` search returns the 3 rows.
- Model filter (tasks P4 and P5). The migration sets `embedding_model` of each existing row to `nomic-embed-text`. The vector list uses only rows whose `embedding_model` is the active model; the text list uses each row. The count of other rows uses `IS DISTINCT FROM`. Tests: the migration on a database that has rows sets the value; a row with a different model is absent from the vector list and present in the text list.
- Stats by scope (task P5). `getBrainStats` takes the scope list of the door, so the public door counts only `house` and `general` rows. Test: with one row of each scope, the public `brain_stats` total is 2.
- Timeouts (tasks P3, P1 and U1). Each embedding call has a timeout of 15 seconds with `AbortSignal.timeout`. The pool has `connectionTimeoutMillis` of 5 seconds and a `statement_timeout` of 10 seconds. The key fetch has the `jose` timeout of 5 seconds. The Compose file sets the Ollama keep-alive so that the model stays loaded. Test: with an embedder that never resolves, a search returns the degraded result after the timeout, and a capture fails with `OB_EMBEDDING_UNAVAILABLE`.
- Supersede method (task P8). The embedding is computed before the transaction opens. `supersedes` is a UUID in the Zod schema. In the transaction, the server reads the old row first: no row gives `OB_SUPERSEDE_NOT_FOUND`; an invalid row gives `OB_SUPERSEDE_INVALID`. Then it inserts the new row and runs the guarded `UPDATE`; 0 rows after a valid read gives `OB_SUPERSEDE_CONFLICT`. The new row must have the same scope as the old row, or the call fails with `OB_VALIDATION`. Tests: one test for each of the three codes; a different scope fails; a superseded row is absent from the text list and from the vector list.
- Token verifier checks (task U1). The 6 checks are: the token is present in the `Authorization` header (a token in the query string is rejected); the algorithm is in an allowlist of asymmetric algorithms (`none` and `HS256` are rejected); the signature is valid for the key set; the issuer and the audience match (the audience can be a string or an array); the token is not expired, with a clock tolerance of 30 seconds; the subject is the permitted subject. Only a network failure or a timeout of the key fetch gives `500`. An unknown key id or a bad signature gives `401`. Tests: `alg: none`, `HS256` signed with the public key, an unknown `kid` (each `401`), a key fetch that fails on the network (`500`), and a token in the query string (rejected).
- Limits before the sign-in (task U2). On the public door, the token check runs before the JSON body parser. A second limit of 600 requests each minute runs before the token check. The body limit stays 100 kb. `express-rate-limit` gets `validate: { xForwardedForHeader: false }`, because the tunnel adds that header. Tests: request 601 with no token gets `429`; a body of 200 kb gets `413`.
- Stateless transport tests (task H1a). Tests: 10 parallel `tools/call` requests on one door all succeed; `GET /mcp` and `DELETE /mcp` get `405`; a `POST` with `Content-Type: text/plain` is rejected. No door adds CORS headers.
- Test database guard (task P1). With `OPEN_BRAIN_TEST=1`, `src/db.ts` uses `TEST_DATABASE_URL` only, and throws if it is absent or equal to `DATABASE_URL`. The helper refuses a database name that does not end in `_test`. No test file imports `dotenv`. Tests: equal values throw; a name with no `_test` suffix throws.
- Secret scan before the push (task P9). The scan also runs as a `pre-push` hook, and `AGENTS.md` documents how to install it. The patterns are `*.ts.net` names, addresses in `100.64.0.0/10` and strings that start with `eyJ`. The test makes its planted JWT at run time, so the scan does not flag its own fixture.
- Restore in Phase 1 (owner task). Phase 1 gets the acceptance criterion "One restore of a dump into a scratch container succeeds, and the row count agrees." The Phase 3 restore criterion stays. Dump files have mode `600`, and the dump directory is in `.dockerignore`.
- Shutdown (task H1a). A `SIGTERM` handler closes the listeners and calls `closePool()`. Test: the handler resolves and the pool is closed.
- Small rules (tasks named in each item). The request log writes a tool name only if it is in the profile, else `"unknown"`, and cuts a rejected host name at 255 characters (H1c). The `public:` prefix rule of the private door ignores case and outer spaces; tests: `Public:x` and ` public:x` fail (P8). The GIN index serves the full-text match only; the substring match reads the table in sequence, which is acceptable at this size (P7). A degraded search with no part token and no word token returns the line "No searchable word in the query." (P7). The configuration check returns its problem list, and only `src/index.ts` calls `process.exit`; `createDoorApp` takes an injected log function, and each test closes its listener (H1b, H1c). The CI workflow has `permissions: contents: read`, pinned actions and no repository secret (P1). The "Breaking change" note also names `engines >=22` (P5). The README notes that the 8192 limit counts UTF-16 units and that Ollama can cut a long text earlier (H4).
- Private door access (owner task, Phase 1). The private door has no sign-in: each device on the tailnet can use the 5 tools. The owner accepts this risk and adds a Tailscale ACL that permits port 8787 only from the owner's devices.
<!-- /autoplan-accepted:eng -->

### Gate 1 changes (solutions-architect review, 2026-11-17)

The Gate 1 review gave PASS WITH CHANGES, with no Critical finding. The owner approved each fix. These items are later than the three lists above, so they apply where an item above disagrees.

- G1. Door app built by hand (High; tasks H1a and U2). `createMcpExpressApp` runs `express.json()` before each other middleware (`express.js:29`). For that reason, `createDoorApp` uses `express()`, with the middleware in this order:
  1. `hostHeaderValidation(allowedHosts)`, imported from `@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js`.
  2. `GET /healthz`.
  3. Public door only: the pre-auth limit, the metadata route, `requireBearerAuth`, the subject middleware, then the post-auth limit.
  4. `express.json({ limit: '100kb' })`.
  5. The `/mcp` route.

  Test: on the public door, a body of 200 kb with no token gets `401`, not `413`. A body of 200 kb with a valid token gets `413`. This replaces "a body of 200 kb gets `413`" in the Eng item "Limits before the sign-in".
- G2. Subject check in its own middleware (Medium; task U1). `requireBearerAuth` turns each `InvalidTokenError` into `401`, and gives `403` only for `InsufficientScopeError`. The verifier therefore does not check the subject. It puts `sub` in `AuthInfo.extra`, and a separate middleware after `requireBearerAuth` sends the `403` in the OAuth JSON form. The verifier has 5 checks; the subject check is the sixth check, in the middleware. Test: a token for a wrong subject passes the verifier and gets `403`.
- G3. Pre-auth limit keyed by client (Medium; tasks S0a and U2). The 600/min limit uses the client address that the tunnel puts in a header as its key, not one constant key. Only the tunnel can reach `127.0.0.1:8788`, so the door can trust that header. Task S0a records which header the tunnel sets (for example `X-Forwarded-For` or `CF-Connecting-IP`). If the tunnel sets no such header, the limit keeps one constant key, and the plan records that a client with no token can lock out the owner. The post-auth limit of 120/min keeps one constant key. Test: 600 requests with no token from client A, then a signed-in request from client B succeeds.
- G4. Probe follows the profile (Medium; tasks U3 and C1). The probe reads the hidden tool list from the exported profile constant. It never calls `capture_thought` with real content. To test that a hidden tool fails, it sends a call with an empty `content`, so no row can be stored. Test: after the change to `PUBLIC_CAPTURE`, the probe passes and the row count does not change.
- G5. Migration versions (Medium; tasks P4 and H1b). `npm run migrate` keeps a table `schema_migrations(version, applied_at)` and records each file that it applies. The schema check at start compares the highest applied version with the version that the code needs. A lower version gives `OB_SCHEMA_OLD`. A file that is already recorded is not run again. Each statement stays idempotent. Test: a second run makes no change; a database at version 0 gives `OB_SCHEMA_OLD`.
- G6. Stop words in the text search (Medium; tasks P6 and P7). The generated `content_tsv` column keeps the `simple` configuration, so part tokens are not changed. The token function in `src/search.ts` removes the words of a fixed English stop-word list (a constant in the code) from the word tokens before the full-text query. Part tokens are never removed. If no word token and no part token remain, the text list is empty, and the search uses the vector list only. Tests: "what is the paint colour of the bedroom" gives the word tokens `paint`, `colour` and `bedroom`; a question with no part token returns the row that the vector list ranks first.
- G7. Expiry with no tolerance (Low; task U1). `requireBearerAuth` checks `expiresAt` again with no clock tolerance (`bearerAuth.js:33`). The 30-second `jose` tolerance therefore does not let an expired token pass. Test: a token that expired 10 seconds ago gets `401`.
- G8. Accept header (Low; tasks H1a and U3). The transport gives `406` to a `POST` whose `Accept` header does not list both `application/json` and `text/event-stream`. Each HTTP test and the probe send that header. Test: a `POST` with no such header gets `406`.
- G9. Model backfill (Low; task P4). The migration sets `embedding_model` to `nomic-embed-text` only on rows whose vector has 768 values. Other rows keep `NULL`, and the start line counts them as rows with a different model. This replaces the backfill of each row in the Eng item "Model filter". Test: a row with 1536 values keeps `NULL`.
- G10. Secret scan file set (Low; task P9). The scan reads only the files that `git ls-files` lists, so `node_modules` and `.gstack/tmp` are not read. The plan lines that name the pattern `100.64.0.0/10` go into the allow file. Test: the scan passes on the current tree.
## Review record

### Phase 1: CEO review (mode: SELECTIVE EXPANSION, via /autoplan)

Methodology read: `methodology.md` ranges 1-600, 601-1200, 1201-1800, 1801-2257 of 2257 lines.
Outside voice: Codex, disabled (`codex_reviews` is off). Native review only.

#### System audit

- Base branch `main`. The branch has one changed file, the design document. No stash exists.
- No `TODOS.md` and no `CLAUDE.md` exist in the repository. `AGENTS.md` holds the rules.
- No `TODO` or `FIXME` marker exists in the source. No earlier review exists for this plan.
- Taste references: `src/db.ts` (one small function for each query, parameters bound) and `src/embeddings.ts` (one function for each provider). To avoid: the five copies of the same `try/catch` block in `src/index.ts:33-56`, `70-87`, `102-120`, `135-152`, `163-177`.
- Landscape (from the design session, 2026-11-12): ready memory servers exist with HTTP and OAuth. The owner chose to extend this code to learn. Layer 3: at some hundreds of facts, retrieval is not the hard problem. The public door and facts that change are.

#### 0A. Premise challenge

The real problem: each AI client has a separate memory, and house facts are not recorded where a phone can get them. Do-nothing cost: the owner gives the same context to each client again, and a part number is not available in a store. The plan solves the problem directly for the PC (Phase 1). For the phone, the plan depends on a sign-in chain that no phase has proved yet.

| Premise | Claim | Receipt | Verdict |
|---|---|---|---|
| P-1 | The server has 5 tools over stdio only. | `src/index.ts:22`, `60`, `91`, `124`, `156`, `181` | verified |
| P-2 | No test script and no CI exist. | `package.json:13-20` | verified |
| P-3 | `search_brain` permits a limit of 50. | `src/index.ts:99` | verified |
| P-4 | An unknown provider value falls through to OpenAI. | `src/embeddings.ts:14-23`, `84-88` | verified |
| P-5 | The pool has no close function. | `src/db.ts:17-26` | verified |
| P-6 | `npm ci` runs `tsc` through `prepare`. | `package.json:14` | verified |
| P-7 | `.gitignore` ignores only `.env`. | `.gitignore:6` | verified |
| P-8 | The SDK middleware has no `403` for a wrong subject. | `node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/middleware/bearerAuth.js:51-57` | verified |
| P-9 | The schema has `invalidated_at` and `updated_at`. | `schema-ollama.sql:19-20` | verified |
| P-10 | `tsx` is available for the tests. | `package.json:19` (`dev` script uses `tsx`) | verified |
| P-11 | A Claude connector connects from the Anthropic cloud and needs a public address. | Claude help center, read 2026-11-12. No live test. | unverified |
| P-12 | Claude Desktop can not use a tailnet HTTP address directly. | No receipt. Phase 0a tests it. | unverified |
| P-13 | Ollama on the CPU of the home server is fast enough. | No receipt. Phase 1 measures it. | unverified |
| P-14 | An identity provider exists that gives a JWT with the correct audience to a Claude connector. | No receipt. Phase 0b tests it. | unverified |

Unverified premises: 4. Each one has a phase that settles it. P-14 is the largest risk: Track P does not depend on it, but Phase 2 and Phase 3 do.

#### 0B. Existing code leverage

| Sub-problem | Existing code | Plan |
|---|---|---|
| Tool handlers | `src/index.ts:22-178` | Reuse. Move to `src/tools.ts` with no change of behavior. |
| Vector search | `src/db.ts:105-124` | Reuse. Add the scope filter and the text list. |
| Soft delete | `src/db.ts:65-78` | Reuse for `supersedes`, in a transaction. |
| Embedding providers | `src/embeddings.ts:39-88` | Reuse. Add the resolver and the stub. |
| HTTP transport | SDK `StreamableHTTPServerTransport` | Reuse. No own transport. |
| Token check and `401` header | SDK `requireBearerAuth` | Reuse. Own code only for the subject check and the metadata route. |
| Output format | `src/db.ts:183-190` | Reuse. |
| Unused columns `people`, `topics`, `type`, `action_items` | `schema-ollama.sql:13-16` | Not used. No rebuild. |

No rebuild of an existing path is in the plan.

Reality rows:

REALITY: premise-table finding 14 premises, 10 verified, unverified=4 (P-11 to P-14) src/index.ts:99
REALITY: already-done pass no named file or symbol of the plan exists on origin/main src/index.ts:16
REALITY: surface-check finding `npm test` and `node --import tsx --test` do not exist yet and task P1 adds them; `npm run build`, `npm run init-db` and `npm run test:env` exist package.json:13
REALITY: binding-decisions pass no branch decision is recorded; the six owner decisions in the plan agree with the tasks docs/plans/two-door-house-brain-plan.md:42
REALITY: numbers pass 768 dimensions [measured: src/embeddings.ts:7]; limit 50 [measured: src/index.ts:99]; ports 8787 and 8788 [estimated: docs/designs/two-door-house-brain.md:74]; fusion constant 60 [estimated: docs/designs/two-door-house-brain.md:187]; wait 120 s [estimated: docs/designs/two-door-house-brain.md:88]; list size max(20, limit) [estimated: docs/designs/two-door-house-brain.md:180] src/embeddings.ts:7
REALITY: deferred-asks pass no linked issue exists docs/plans/two-door-house-brain-plan.md:1
REALITY: pr-count finding no .gstack/ship-policy.json exists (default: one PR per wave); the plan names 10 branches for one owner with no reviewer docs/plans/two-door-house-brain-plan.md:213

#### 0C. Dream state

```
CURRENT STATE                THIS PLAN                       12-MONTH IDEAL
stdio only, one PC,    --->  two HTTP doors, scope,    --->  the brain fills itself from
no tests, no CI,             hybrid search, sign-in,         the chores app and the recipe
no sign-in, vector           tests in CI, Compose on         server; the household asks
search only                  the home server, phone          from each device; a restore
                             reads and captures              is a routine operation
```

The plan moves toward the ideal. It does not build the self-fill job or family access, and it does not block them: `scope` and `source` are the hooks.

#### 0D. Approaches

No new approach decision was needed. The owner chose the two-door approach in the design (D9) and made six decisions after the plan.

#### 0E. Mode

SELECTIVE EXPANSION, set by /autoplan. The plan changes about 27 files. By the count rule alone, the recommendation is SCOPE REDUCTION. The owner approved this scope in the design, so the review keeps it and tests each phase boundary.

#### 0F and 0G. Hold-scope checks and cherry-picks

Complexity check: 5 new source modules (`tools`, `http`, `auth`, `search`, plus the migration) for a 475-line codebase. Each module has one job and its own tests. `src/search.ts` holds pure functions, so the hard logic has tests with no database. No module is removed by this review.

Minimum for the goal: Phase 1 alone gives "one memory for all tools" on the PC. The phases already make each later step optional. No retained item is deferred.

Candidates (each decided by the six principles; the owner sees taste items at the final gate):

| ID | Proposal | Effort | Risk | Decision | Principle and reason |
|---|---|---|---|---|---|
| E1 | `GET /healthz` on each door: no sign-in, returns status and version only, no data. | S | low | ACCEPTED | P2. One file. The reboot check, the tunnel check and the unit file need a target that is not a tool call. |
| E2 | One structured log line for each request: door, tool name, status, duration. Never the content, the query or a token. | S | low | ACCEPTED | P1. Directive: zero silent failures. The owner can not debug a failed phone call without it. |
| E3 | The public door sets `source` to a value with the prefix `public:` on each captured row. A client can not change the prefix. | S | low | ACCEPTED | P1. One query then finds each fact that came through the public door. This is the recovery path after a sign-in mistake. |
| E4 | Maximum length of 8192 characters for `content` and for `query`. | S | low | ACCEPTED | P1. `src/embeddings.ts:58` cuts the text at 8192 for the embedding, so a longer note is stored whole and found badly. The public door needs an input limit. |
| E5 | `formatThoughtForOutput` shows the scope of each row. | S | low | ACCEPTED | P2. One line in `src/db.ts:183`. A client sees why a row came back. |
| E6 | Phase 0b also records if the Claude connector accepts a static header credential. | S | low | ACCEPTED | P3. One more line in the 0b record. If it works, it is a much smaller sign-in. The owner then decides. |
| E7 | Rate limit on the public door. | S | med | ACCEPTED (taste) | P1 for a public endpoint. It needs `express-rate-limit` as a direct dependency (it is in the lock file through the SDK). The owner can decline it. |
| E8 | Fewer branches: 4 pull requests (guards and test harness; Track P features; private door; public door). | S | low | ACCEPTED (taste) | P3 and P6. One owner and no reviewer. 10 branches add merge work and no safety. The commits stay small. |
| E9 | `brain_export` tool or a restore script. | M | low | DEFERRED | P3. Outside the blast radius. `pg_dump` and one restore test cover the need. |
| E10 | Nightly self-fill job from the chores app and the recipe server. | L | med | DEFERRED | The design puts it in "Later". It needs access to two other systems. |
| E11 | Family access with more than one subject. | L | med | SKIPPED | The design says one user. The owner ruled it out. |

#### 0I. Temporal interrogation

| Time | What the implementer hits | Handling |
|---|---|---|
| Hour 1 (human: 1 day) | `src/index.ts` starts on import, so no test can import a tool. | P2 comes directly after P1. |
| Hours 2-3 | The stub must be first in the provider resolver, and `EMBEDDING_DIMS` is computed at import (`src/embeddings.ts:96`). | P3 makes the resolver a function. Tests set the environment before the import. |
| Hours 4-5 | The strict public schema and the `isError: true` result form. The test must read the tool result, not catch an exception. | Stated in S6 and in P8. |
| Hour 6 and later | The owner tasks on the home server take longer than the code. Phase 0b can stop the phone path. | Feasibility blocker for Phase 2 only. Track P and Phase 1 continue. |

Effort for the code: human team about 2 weeks, CC about 5 hours. Owner tasks on the home server: about 1 day in total, not compressible.

Feasibility blocker: P-14 (identity provider). It does not block Phase 1. No other blocker.

#### 0H. Spec review loop (3 launches, the limit)

| Round | Score | Blocking | Result |
|---|---|---|---|
| 1 | 6/10 | 5 | Additions had no task; pull request rule against the branch table; `src/auth.ts` only on the spike; log fields not defined; rate limit by client address. All fixed. |
| 2 | 7/10 | 1 | No log line for a rejected request. Fixed. The 5 issues of round 1: resolved. |
| 3 | 8/10 | 1 | A tool call with invalid input writes no log line (the SDK validates before the handler, `mcp.js:125`). Fixed after the round. |

Issues verified: 1 of 1 (the fix text "If the wrapper recorded nothing, the line has `is_error: true`" is in the plan). No reviewer read that last fix. Decision recorded: spec not re-verified for that one item. Scope documents approved by auto-decision (P6); the owner approves the plan at the final gate.

#### Step 0.5. Dual voices

CLAUDE SUBAGENT (CEO, independent): INPUT hash `db640a07...4a69` matches the snapshot. No Critical, 6 High (F1, F2, F4, F8, F9, F10), 4 Medium (F3, F5, F6, F7).
CODEX: disabled (`codex_reviews` is off). No outside review ran.

| # | Finding of the subagent | Severity | Decision | Reason |
|---|---|---|---|---|
| F1 | No measure of use and no stop rule | High | ACCEPTED (taste) | One owner check before Phase 2. It costs no code. |
| F2 | Phone capture is the last phase | High | DECLINED | The owner decided "read-only first" in the design (decision D8) for safety. The private door captures from day one. |
| F3 | "All AI clients" is tested only with Claude clients | Medium | ACCEPTED | One more client in the Phase 1 check. The README already names Cursor. |
| F4 | The public door can read the `work` scope | High | ACCEPTED (taste) | One sign-in mistake must not show work notes. A scope list for each door is a constant in the code. |
| F5 | A required `scope` on capture adds friction | Medium | DECLINED | The owner approved the required `scope` in the design. The validation error names the permitted values. |
| F6 | A public fork has no stated reason | Medium | DECLINED | The owner made the fork and pushed to it. Recorded as a note for the final gate, with no change. |
| F7 | No monitor for the public door, no restore drill date | Medium | DEFERRED | It needs a service outside the home network. |
| F8 | Regret: a large build, a small store, a silent failure | High | COVERED | By F1 (use check) and F7 (deferred monitor). |
| F9 | No order rule for the spikes and no fallback table | High | ACCEPTED | The four largest risks must be settled before the code that depends on them. |
| F10 | No comparison with a zero-infrastructure baseline | High | RECORDED | See "Alternatives" below. No plan change: the owner chose to build this to learn. |

```
CEO DUAL VOICES - CONSENSUS TABLE:
  Dimension                            Claude subagent   Codex   Consensus
  1. Premises valid?                   partly (F4, F5)   -       N/A
  2. Right problem to solve?           open (F1, F10)    -       N/A
  3. Scope calibration correct?        yes, order (F9)   -       N/A
  4. Alternatives explored?            no (F10)          -       N/A
  5. Competitive risks covered?        yes, personal     -       N/A
  6. 6-month trajectory sound?         risk (F8)         -       N/A
Outside review disabled: each Consensus cell is N/A, not CONFIRMED.
```

Alternatives that the owner ruled out (from the design session, recorded for F10):

| Baseline | What it can not do | Why the owner rejected it |
|---|---|---|
| A. One "house facts" document in a Claude Project | No capture from Claude Code or Cursor. No scope filter. One vendor only. | The goal is one memory for all tools, and the owner wants to learn MCP and pgvector. |
| B. Hosted database and hosted MCP endpoint | The notes leave the home. | The owner chose the home server (design decision D4). |
| C. Private door only | No phone. | The owner chose "PC and phone" (design decision D3). C is the fallback if Phase 0b fails. |

#### Current scope

Mode SELECTIVE EXPANSION (set by /autoplan). Accepted: E1 to E8, F1, F3, F4, F9 and the section findings below. Deferred: E9, E10, F7 and two section items. Skipped: E11. Declined: F2, F5, F6. Pending for the final gate (taste): E7, E8, F1, F4.

#### Section 1: Architecture review

```
                         HOME SERVER (one Node process)
  PC clients                +-------------------------------------------+
  Claude Code  --tailnet--> | private door :8787   tools: all 5         |
  Claude Desktop            |   host check -> /mcp -> McpServer (new    |
  Cursor                    |   for each request) -> registerTools      |
                            |                                           |
  Claude phone app          | public door :8788    tools: 3, later 4    |      +----------+
   -> Anthropic cloud       |   host check -> /healthz                  | ---> | Postgres |
   -> tunnel (host)  -----> |   requireBearerAuth -> subject check      |      | pgvector |
                            |   -> rate limit -> /mcp -> McpServer      |      +----------+
  identity provider <-keys- |   metadata route (no token)               | ---> | Ollama   |
                            +-------------------------------------------+      +----------+
        src/index.ts -> src/http.ts -> src/auth.ts
                                    -> src/tools.ts -> src/db.ts -> src/search.ts
                                                    -> src/embeddings.ts
```

Data flow, four paths, for `search_brain`:

```
query -> schema (scope, 1..8192) -> embed(query) -> vector list + text list -> merge -> format -> client
  nil:   no query or no scope      -> validation fails -> isError result, log line is_error: true
  empty: query with no token       -> no text list, vector list only
  error: embed fails (Ollama down) -> GAP in the plan: the search fails, but the text list needs no embedding
  error: database fails            -> handler error -> isError result with the raw message (see Section 2)
```

State machine of a thought row:

```
            capture                       invalidate_thought (private door)
 (none) -------------> ACTIVE ---------------------------------------------> INVALID
                         |   capture with supersedes (private door)             ^
                         +------------------------------------------------------+
                              sets invalidated_at and superseded_by = new id
 INVALID -> ACTIVE: no tool does this. Only SQL by the owner.
 INVALID -> INVALID: affects 0 rows (`WHERE invalidated_at IS NULL`, src/db.ts:71).
```

- Coupling: `src/tools.ts` depends on `src/db.ts` and `src/embeddings.ts`, as `src/index.ts` does today. New: `src/http.ts` depends on `src/auth.ts` and `src/tools.ts`. No cycle.
- Scale: one user. The first limit is the embedding call on the CPU, then the pool of 5 connections (`src/db.ts:23`). 10x load is still one person.
- Single points of failure: the home server, the tunnel, the identity provider (for the phone only) and Ollama (for capture and for the vector list).
- Rollback: check out the earlier commit and run `docker compose up -d --build`. The migration only adds columns, and the old code runs on the new schema (the old `INSERT` gets `scope = 'general'`). Time: some minutes.

Findings:
- **WARNING A1.** `search_brain` fails when the embedding provider is down, but the text list can still answer. Decision: accept a degraded search (P1). See the accepted block.
- **OK A2.** Two doors in one process: a crash stops the two doors. Accepted for one user; Docker restarts the container.

#### Section 2: Error and rescue map

| Codepath | What can go wrong | Error | Rescued? | Action | The client sees |
|---|---|---|---|---|---|
| `embed()` in capture | Ollama down or slow | fetch error, `src/embeddings.ts:60` | Y, catch-all in the handler | Fail the capture | "Error: ..." with `isError` |
| `embed()` in search | Ollama down | same | N (GAP, A1) | Accepted: text list only, with a note | Results, with "vector search not available" |
| `insertThought` | Database down, pool timeout | `pg` error | Y, catch-all | Fail | Raw `pg` message (GAP, E-1) |
| `insertThought` with `supersedes` | Unknown or invalid id | own error | Y | Roll back | A clear message (owner decision 5) |
| Supersede, two calls at the same time | The two replace one row | 0 rows updated | Y | Roll back the second | A clear message |
| Tool input | Wrong scope, 8193 characters, unknown key on the public capture | Zod error | Y, by the SDK | Nothing stored | `isError` with the Zod text |
| Token verifier | Bad signature, issuer, audience, expiry | `InvalidTokenError` | Y, SDK | `401` with `WWW-Authenticate` | The connector starts the sign-in |
| Token verifier | The key set of the provider is not reachable | fetch error in `jose` | N (GAP, E-2) | Accepted: `ServerError`, `500`, one log line | A temporary failure, not a new sign-in |
| Subject check | Wrong subject | own | Y | `403` | Access denied |
| Rate limiter | Over the limit | none | Y | `429` | Try again |
| Start of the HTTP mode | OAuth value absent, stub provider, unknown provider | own | Y | Refuse to start, one clear line | The container stops with the reason |
| Migration | Second run | none | Y | Idempotent statements | No change |

- **WARNING E-1.** The handlers return the raw error message (`src/index.ts:50-52`). A `pg` or `fetch` message can contain an internal address. On the public door this goes to the Anthropic cloud. Decision: accept a generic message on the public door (P1).
- **WARNING E-2.** A failed key fetch is not specified. Decision: accept `500` with a log line (P1).
- The catch-all `catch (err)` blocks stay, in one wrapper (see Section 5). The wrapper logs what it tried.

#### Section 3: Security and threat model

| # | Threat | Likelihood | Impact | Mitigation in the plan |
|---|---|---|---|---|
| T1 | A valid token of a different account of the provider | Med | High | Subject check, `403`, probe case 5 |
| T2 | One sign-in mistake shows each note, also `work` notes | Low | High | Accepted from F4: scope list for each door |
| T3 | Memory poisoning through the public capture | Low | High | Read-only first; no `supersedes`; `public:` marker; probe before Phase 3 |
| T4 | SQL injection through the query | Low | High | Bound parameters; `ILIKE` with escape; word tokens have only letters and digits |
| T5 | Flood of requests | Med | Low | Rate limit after the token check; 8192-character limit; the default body limit of `express.json` |
| T6 | A secret in the public repository | Med | High | Ignore rules, secret scan in CI, review of each diff |
| T7 | DNS rebinding or a wrong `Host` header | Low | Med | List of permitted host names on each door |
| T8 | Internal address in an error text | Med | Low | Accepted from E-1: generic message on the public door |
| T9 | Prompt injection in a stored note that a client reads later | Low | Med | Not mitigated. A note is data that the client model reads. One user writes the notes. Recorded as an accepted risk. |
| T10 | New packages | Low | Med | `express`, `jose`, `express-rate-limit` are in the lock file through the SDK |

No finding is High with no mitigation after F4. Audit: the request log has no subject, which is acceptable for one permitted subject.

#### Section 4: Data flow and interaction edge cases

```
capture: content, scope, source, supersedes
  -> schema (1..8192, enum scope, source <= 64, strict on the public door)
  -> embed(content) -> BEGIN -> INSERT new -> UPDATE old (supersedes) -> COMMIT -> "Captured (id)"
     shadow: schema fails -> nothing stored      shadow: embed fails -> nothing stored
     shadow: INSERT fails -> ROLLBACK            shadow: UPDATE affects 0 rows -> ROLLBACK, error
```

Async order for `supersedes`. Invariant: one old row has one replacement at most.

```
 call A                      call B                      old row
 INSERT new A                                            ACTIVE
                             INSERT new B                ACTIVE
 UPDATE old WHERE invalidated_at IS NULL  (row lock)     locked by A
                             UPDATE old ... waits        locked by A
 COMMIT                                                  INVALID, superseded_by = A
                             UPDATE affects 0 rows       INVALID
                             ROLLBACK (new B removed)    INVALID, superseded_by = A
```

The opposite order gives the same result with A and B exchanged. The mechanism is the row lock of `UPDATE` and the `WHERE invalidated_at IS NULL` condition in one transaction. Decision: accept one test with two parallel calls (exactly one succeeds).

| Interaction | Edge case | Handled? | How |
|---|---|---|---|
| Capture | The client sends the same capture two times after a timeout | No | Two rows. Deferred: duplicate check. The owner can invalidate one row. |
| Capture | Empty `content` | No (GAP) | Accepted: minimum length of 1 for `content` and `query` |
| Search | Zero results | Yes | "No matching thoughts found." (`src/index.ts:108`) |
| Search | `limit` of 50 | Yes | `max(20, limit)` |
| Search | A query with only punctuation | Yes | No token; vector list only |
| List | `days` of 0 or a negative number | Yes | `min(1)` (`src/index.ts:132`) |
| Phone | The sign-in ends in the middle of a session | Yes | `401` with the header; the connector signs in again |

#### Section 5: Code quality review

- **WARNING Q-1.** `src/index.ts` has the same `try/catch` block 5 times (lines 33-56, 70-87, 102-120, 135-152, 163-177). The plan moves the handlers with no change. The log wrapper of E2 and the generic message of E-1 need one place for errors. Decision: accept one wrapper in `registerTools` that holds the error handling for each tool (P4, DRY).
- Module structure: each new module has one job. `src/search.ts` has pure functions. This fits the style of `src/db.ts`.
- Names: `registerTools`, `createDoorApp`, `startDoors`, `closePool`, `getEmbeddingModelName` say what they do.
- Over-engineering check: the `AsyncLocalStorage` store for `is_error` is the smallest way to pass one flag from a handler to the middleware. No finding.
- Complexity: the hybrid query has the most branches. The token and merge logic is in pure functions with tests, so no method has more than 5 branches by design.

#### Section 6: Test review

```
NEW CODEPATH                         TEST TYPE     IN THE PLAN?   FAILURE TEST
registerTools tool sets (5, 3, 4)    unit          yes (P2)       wrong set
provider resolver and stub           unit          yes (P3)       unknown value
migration                            integration   yes (P4)       second run, bad scope
scope filter                         integration   yes (P5)       no scope, wrong value
tokens and merge                     unit          yes (P6)       apostrophe, empty
hybrid search                        integration   yes (P7)       3 competitor rows
supersede transaction                integration   yes (P8)       bad id, failed insert
supersede, two parallel calls        integration   NO  -> accepted
search with the embedder down        integration   NO  -> accepted
length limits 0, 8192, 8193          unit          partly -> accepted (0 added)
public source marker                 unit          yes (accepted block)
public door scope list               integration   NO  -> accepted (F4)
token verifier, 6 checks             unit          yes (S0b, U1)
key fetch failure -> 500             unit          NO  -> accepted
generic error text on public door    unit          NO  -> accepted
rate limit                           integration   yes (accepted block)
request log lines                    integration   yes (accepted block)
/healthz                             integration   yes (accepted block)
probe, network check, restart        by hand       yes (owner tasks)
```

- The test that gives confidence at 2 in the morning: the probe with real tokens against the real public door.
- The hostile test: a signed token of a second account with `scope: all` on the public door. It must get `403`, and the scope list must hold even with a valid token.
- The chaos test: stop Ollama, then search. The accepted degraded search covers it.
- Pyramid: many unit tests (`search`, `auth`, tool sets), fewer integration tests with the service container, and checks by hand only for the home server. Not inverted.
- Flakiness: the rate limit test uses a limit parameter of 2, not time. `duration_ms` is not asserted. The stub embedder removes the model from CI.
- No prompt or LLM file pattern exists in this repository, so no eval suite applies.

#### Section 7: Performance review

- Indexes: GIN on `content_tsv` (new), HNSW on `embedding` and B-tree on `created_at` (exist, `schema-ollama.sql:24-28`). The substring match with `ILIKE '%token%'` reads the table in sequence. At some thousands of rows this is some milliseconds. Deferred: a `pg_trgm` index if the table grows.
- The HNSW index applies the scope filter after the index scan, so a small scope can return fewer than `N` rows from a large table. No effect at this size. Recorded for later.
- Slowest paths [estimated]: the embedding call on the CPU (0.2 to 3 s), the token check with a first key fetch (one HTTPS call, then a cache), the hybrid query (some milliseconds).
- A new `McpServer` for each request registers 5 tools. This is cheap. The pool is shared at module level (`src/db.ts:17`), so no connection opens for each request.
- No N+1 query. No new cache is necessary.

No finding needs a plan change.

#### Section 8: Observability and debuggability

- Logs: the accepted request log gives one line for each request, also for a rejected one.
- **WARNING O-1.** No line says how the server started. Decision: accept one start line with the mode, the doors, the tool set of each door, the scope list of each door and the embedding provider, with no secret (P1).
- **WARNING O-2.** No runbook exists for "the phone can not connect". Decision: accept a short section in the README (task H4) with the checks in order: `/healthz` on the public address, the log line of the request, the tunnel, the provider (P1).
- Health: `/healthz` is accepted. An external monitor is deferred (F7).
- Three weeks later: the log has the method, the tool, the status and the error flag, with no content. The owner can see that a call failed and where, but not what the query was. This is the privacy choice of the owner.

#### Section 9: Deployment and rollout

- Migration: `ADD COLUMN IF NOT EXISTS` with a default, a generated column and an index. On a table of some hundreds of rows the lock is short. It is backward-compatible: the old code runs on the new schema.
- **WARNING D-1.** The new code does not run on the old schema, and the plan does not state the order. Decision: accept "apply the migration first, then start the new image" in the README (task H4) (P1).
- Rollback: check out the earlier commit, then `docker compose up -d --build`. The schema stays. Phase 3 rollback: change the constant back and deploy.
- Checklist after a deploy: `/healthz` on each door, `brain_stats` from Claude Code, one search for a known part number. Accepted into the README section of O-2.
- No staging exists. CI with the service container is the only environment before the home server. Accepted for one user.

#### Section 10: Long-term trajectory

- Reversibility: 4 of 5. The migration only adds columns. The doors are new files. The public door closes with one tunnel command.
- Debt: the own metadata route and the SDK facts are tied to SDK 1.27.1 and to the behavior of the Claude connector on one day. `package.json` has `^1.27.1`; the lock file holds the exact version. Recorded: check S1 to S7 again when the SDK version changes.
- Path dependency: `scope` values are in a `CHECK` constraint, so a fourth value needs a migration. Accepted; a migration is 2 lines.
- Fork: the move of `src/index.ts` into 5 files makes a merge from upstream improbable (F6). The owner decides at the gate if that matters.
- After this plan: the self-fill job (deferred) uses `scope` and `source`. Family access needs more than one subject and a row owner. The architecture does not block the two.
- Cherry-pick check: no skipped item is necessary for an accepted one.

#### Section 11: Design and UX review

SKIPPED (no UI scope). The scope scan found no rendered file and no UI term next to a visual noun.

#### NOT in scope

Deferred (to write to `TODOS.md` after the owner approves the plan):
- E9 `brain_export` tool or restore script. Reason: `pg_dump` and one restore test cover the need.
- E10 nightly self-fill job. Reason: the design puts it in "Later".
- F7 external monitor of the public `/healthz`, and a restore drill date. Reason: it needs a service outside the home network.
- Duplicate check for a repeated capture. Reason: the owner can invalidate a row; no evidence of the problem yet.
- `pg_trgm` index for the substring match. Reason: not necessary at this size.

Rejected:
- E11 family access. Reason: the design says one user.
- F2 phone capture before the read-only phase. Reason: the owner decided "read-only first".
- F5 a default scope for capture. Reason: the owner approved the required `scope`.

#### What already exists

See the table in 0B. In short: the 5 handlers, the vector query, the soft delete, the three embedders and the output format are reused. The SDK gives the transport, the bearer middleware and the in-memory transport for tests.

#### Dream state delta

After this plan: one memory on the PC and the phone, a safe public door, a search that finds part numbers, tests in CI. Still absent from the 12-month ideal: the self-fill job, family access, an external monitor, and a restore that is routine.

#### Failure modes registry

| Codepath | Failure mode | Rescued? | Test? | The user sees | Logged? |
|---|---|---|---|---|---|
| Search, embedder down | Vector list not available | Y (accepted) | Y (accepted) | Text results with a note | Y |
| Capture, embedder down | No embedding | Y | N, covered by the error wrapper test | An error | Y |
| Any tool, database down | Query fails | Y | Y (generic text test) | Generic error on the public door | Y |
| Supersede, bad id | No old row | Y | Y | A clear error | Y |
| Supersede, two parallel calls | Second finds 0 rows | Y | Y (accepted) | A clear error | Y |
| Token check, key fetch fails | Provider not reachable | Y (accepted) | Y (accepted) | `500`, temporary | Y |
| Public door start, OAuth value absent | Not configured | Y | Y (U2) | The container stops with the reason | Y |
| Private port publish, Tailscale not ready | Container does not start | Y (unit file) | By hand (restart check) | The door is late | systemd journal |
| Tunnel or provider down | Phone can not connect | N | N | The connector fails | Request never arrives (deferred monitor, F7) |
| Client repeats a capture | Duplicate row | N | N | Two results | Y |

CRITICAL GAPS: 0. The row "tunnel or provider down" is not silent to the user (the connector shows a failure), and the README runbook covers the response. The duplicate row is visible in the results.

#### Completion summary

```
+====================================================================+
|            MEGA PLAN REVIEW - COMPLETION SUMMARY                   |
+====================================================================+
| Mode selected        | SELECTIVE EXPANSION (via /autoplan)         |
| System Audit         | no tests, no CI, no TODOS.md; design only   |
| Step 0               | 14 premises, 4 unverified; 11 candidates    |
| Section 1  (Arch)    | 1 issue found (A1)                          |
| Section 2  (Errors)  | 12 error paths mapped, 2 GAPS (E-1, E-2)    |
| Section 3  (Security)| 2 issues found (T2, T8), 1 High severity    |
| Section 4  (Data/UX) | 7 edge cases mapped, 2 unhandled            |
| Section 5  (Quality) | 1 issue found (Q-1)                         |
| Section 6  (Tests)   | Diagram produced, 5 gaps                    |
| Section 7  (Perf)    | 0 issues found                              |
| Section 8  (Observ)  | 2 gaps found (O-1, O-2)                     |
| Section 9  (Deploy)  | 1 risk flagged (D-1)                        |
| Section 10 (Future)  | Reversibility: 4/5, debt items: 2           |
| Section 11 (Design)  | SKIPPED (no UI scope)                       |
+--------------------------------------------------------------------+
| NOT in scope         | written (8 items)                           |
| What already exists  | written                                     |
| Dream state delta    | written                                     |
| Error/rescue registry| 12 rows, 0 CRITICAL GAPS                    |
| Failure modes        | 10 total, 0 CRITICAL GAPS                   |
| TODOS.md updates     | 5 items proposed (pending the final gate)   |
| Scope proposals      | 11 proposed, 8 accepted                     |
| CEO plan             | written                                     |
| Outside voice        | codex, disabled                             |
| Lake Score           | N/A (no scored coverage question)           |
| Diagrams produced    | 4 (architecture, data flow, state, async)   |
| Stale diagrams found | 0 (no diagram exists in the touched files)  |
| Unresolved decisions | 4 taste items for the final gate            |
| Reality rows         | 7/7 rows (PLAN_REALITY), 4 unverified       |
+====================================================================+
```


<!-- autoplan-accepted:ceo -->
- Health route (tasks H1 and U2). Each door serves `GET /healthz` with no sign-in. The route is a liveness check only and does not call the database. The private door returns `{"status":"ok","version":"<version>"}`, and the server reads the version from `package.json` at start. The public door returns `{"status":"ok"}` only. The list of permitted host names applies to this route. The rate limit does not apply to it. The unit file example (H3) and the restart checks of Phase 1 and Phase 2 use this route. Test: the route answers `200` on each door with no token, the public body has no version, and no body has row content.
- Request log (task H1; the `401` case in task U2). Each HTTP door writes JSON lines to stderr. Stdio writes no request line. The fields are `door`, `method`, `tool`, `http_status`, `is_error` and `duration_ms`. One HTTP middleware owns each line and writes it when the response finishes. (1) For a response with no handled JSON-RPC message (for example `400`, `401`, `403`, `404`, `405`, `429` or a host rejection), the line has `method: null` and `tool: null`. (2) For each JSON-RPC message of a handled request, the line has the `method` from the request body. For `tools/call`, `tool` is `params.name` from the request body; for each other method, `tool` is null. (3) `is_error` is null for a method that is not `tools/call`. For `tools/call`, a wrapper in `registerTools` records the flag of the tool result for the current request in an `AsyncLocalStorage` store, and the middleware reads it. If the wrapper recorded nothing, the line has `is_error: true`: the SDK validates the input before it calls the handler, so a call with invalid input or an unknown tool does not reach the wrapper. No line has the note content, the search query, the `source` value or a token. Tests: the line for a `capture_thought` call has `tool: "capture_thought"` and `is_error: false` and does not contain the content string; a `capture_thought` call with 8193 characters writes a line with `tool: "capture_thought"` and `is_error: true`; a request with no token on the public door writes a line with `http_status: 401` and `method: null`.
- Public source marker (task P8 for the logic, task C1 only opens the tool). `registerTools` gets an option `sourcePrefix`. The public tool set uses `sourcePrefix: "public:"`. With a prefix, the stored `source` is the prefix followed by the value from the client, or the prefix alone when the client gives no value. With no prefix (private door and stdio), a `source` that starts with `public:` fails validation. The value from the client has a maximum length of 64 characters in each mode, before the prefix is added. Tests: a capture with the prefix and `source: "private"` stores `public:private`; a capture with the prefix and no `source` stores `public:`; a capture with no prefix and `source: "public:x"` fails and stores no row; a client value of 65 characters fails.
- Length limit (task P5). `content` of `capture_thought` and `query` of `search_brain` have a maximum length of 8192 characters in the shared tool schema, so the limit applies in stdio and on each door. A longer value fails validation and nothing is stored. Reason: the Ollama and Google embedders cut the text at 8192 characters (`src/embeddings.ts:43`, `58`), and the OpenAI embedder cuts at 8191 (`src/embeddings.ts:76`). Tests: 8192 characters pass, 8193 characters fail.
- Scope in the output (task P5). `ThoughtRow` and each `SELECT` in `src/db.ts` get the `scope` column, and `formatThoughtForOutput` shows it. Test: the output of `search_brain` contains the scope of each row.
- Scope values (task P4 and P5, from the design). The permitted values of `scope` are `house`, `work` and `general`. `search_brain` and `list_recent` also accept `all`. A row that exists before the migration gets `general`.
- Static header check (owner task, Phase 0b). The Phase 0b record states if the Claude connector accepts a static header credential. `requireBearerAuth` rejects a token with no expiry time, so a static credential needs a different verifier; the record notes this.
- Rate limit (task U2). The public door has one global limit of 120 requests each minute on the `/mcp` route. The limiter runs after the token check and the subject check, so a request with no valid token gets `401` or `403` and does not use the limit. A client with no token can not lock the owner out. The limiter has a constant key, because each request comes from the tunnel with the same peer address. The limit value is a parameter of `createDoorApp`, so a test can set it to 2. A request over the limit gets `429`. `GET /healthz` and the metadata route are not limited. `express-rate-limit` becomes a direct dependency in `package.json` (it is in the lock file through the SDK). Tests: with a limit of 2, signed-in request 3 gets `429` and `/healthz` still gets `200`; 5 requests with no token get `401` and the next signed-in request succeeds. (Taste decision. The owner can decline it at the final gate.)
- Pull requests. The work goes to the fork in 5 pull requests. The "First commits" table gives the branch names and the tasks of each one. The spike branch does not merge. Each task stays one commit, and an addition in this list goes into the commit of the task that it names. (Taste decision.)
- Scope list for each door (task P5 for the option, task U2 for the public value). `registerTools` gets an option `allowedScopes`. The private door and stdio permit `house`, `work` and `general`. The public door permits `house` and `general` only, as a constant in the code. On the public door, `scope: all` means the permitted scopes, `scope: work` fails validation, and a public capture can not use `work`. Tests: a public search with `scope: all` returns no `work` row; a public search with `scope: work` fails; a public capture with `scope: work` fails and stores no row. (Taste decision. The owner can permit `work` on the phone at the final gate.)
- Spike order and result table. Task S0a runs before pull request 2 starts. Task S0b runs before pull request 3 starts. The result of Phase 0b selects one path: (a) a provider passes: continue with Phase 2. (b) no provider passes, but the connector accepts a static header credential: stop, and the owner decides on a design for a static credential before any Phase 2 code. (c) the two fail: the plan ends after Phase 1 with the private door, and Phases 2 and 3 are not built.
- Use check before Phase 2 (owner task, no code). After 14 days of use of the private door, the owner records the count of facts from `brain_stats` and decides if Phase 2 starts. Phase 2 gets acceptance criterion 0: "The owner recorded the use check and decided to continue." (Taste decision.)
- Second vendor check. Phase 1 acceptance criterion 4 becomes: "All 5 tools work from Claude Code and from Claude Desktop, and one client that is not a Claude client (Cursor) lists the 5 tools and completes one search."
- Degraded search (task P7). If the embedding call fails in `search_brain`, the tool returns the text list only, and the first line of the result says that the vector search is not available. `capture_thought` still fails when the embedding call fails, and stores nothing. Test: with an embedder that throws, a search for a stored part number returns the row and the note.
- Error text (task P2 for the wrapper, task U2 for the public value). One wrapper in `registerTools` holds the error handling for each tool; the five copies of the `try/catch` block are removed. The wrapper writes the error detail to stderr. On the private door and stdio, the tool result has the error message, as today. On the public door, the tool result has the fixed text "Error: the request failed." and no detail. A validation error of the SDK keeps its own text. Test: with a database that fails, the public tool result does not contain the database message.
- Key fetch failure (task U1). If the token verifier can not get the key set of the provider, it throws the `ServerError` of the SDK. The middleware then sends `500`, and the request log has the line. It does not send `401`, so the connector does not start a new sign-in. Test: a verifier with a key source that throws gives `500`.
- Parallel supersede (task P8). The insert of the new row and the `UPDATE` of the old row with `WHERE invalidated_at IS NULL` run in one transaction. If the `UPDATE` affects 0 rows, the transaction rolls back. Test: two parallel captures that supersede the same row give exactly one success and one error, and one new row exists.
- Minimum length (task P5). `content` and `query` have a minimum length of 1 character. Test: an empty string fails validation.
- Start line (task H1). At start, the HTTP mode writes one JSON line to stderr with the mode, the doors, the tool set of each door, the scope list of each door and the embedding provider. The line has no secret and no address. Test: the line has the tool names and does not contain the value of `DATABASE_URL`.
- README runbook (task H4). The README gets a section "If the phone can not connect" with the checks in order: `/healthz` on the public address, the request log line, the tunnel, the identity provider. It also states the deploy order (apply the migration first, then start the new image), the rollback steps, and the checks after a deploy (`/healthz` on each door, `brain_stats`, one search for a known part number).
<!-- /autoplan-accepted:ceo -->

<!-- autoplan-baseline-edits:ceo {"sourceSha256":"2c89c3a4156dc4e8f14a9757bccbb67eb62cfdc472d5e50086842c8c76e66653","replacements":[{"oldText":"| # | Branch | Commit | Task |\n|---|---|---|---|\n| 1 | `chore/repo-guards` | Add ignore rules, `.env.example` names and the secret scan. | P9 |\n| 2 | `chore/test-harness-ci` | Add the `node:test` runner, the database helper, `closePool()` and the workflow. | P1 |\n| 3 | `refactor/tools-module` | Move the 5 handlers to `src/tools.ts`. Add the tool-set tests. | P2 |\n| 4 | `feat/stub-embedder` | Add the provider resolver, the stub and `getEmbeddingModelName()`. | P3 |\n| 5 | `feat/scope-migration` | Add the migration, then the required `scope`. | P4, P5 |\n| 6 | `spike/phase-0-reach` (do not merge) | Add the throwaway `brain_stats` HTTP server. | S0a |\n\nNext groups: `feat/hybrid-search` (P6, P7), `feat/supersede` (P8), `feat/auth-verifier` (S0b unit tests), `feat/private-door` (H1 to H4).","newText":"| # | Branch (pull request) | Tasks |\n|---|---|---|\n| 1 | `chore/guards-and-test-harness` | P9, P1 |\n| 2 | `feat/scope-and-hybrid-search` | P2, P3, P4, P5, P6, P7, P8 |\n| 3 | `feat/private-door` | H1, H2, H3, H4 |\n| 4 | `feat/public-door` | U1 (adds `src/auth.ts` and its tests), U2, U3 |\n| 5 | `feat/public-capture` | C1, after the Phase 2 exit check |\n| - | `spike/phase-0-reach` (do not merge) | S0a, S0b |\n\nEach task stays one commit, in the order of the task tables."},{"oldText":"| U1 | Change `src/auth.ts` to the form that Phase 0b proved. | `src/auth.ts` |","newText":"| U1 | Add `src/auth.ts` and `test/auth.test.ts` in the form that Phase 0b proved. | `src/auth.ts`, `test/auth.test.ts` |"},{"oldText":"| `src/http.ts`, `src/index.ts`, `compose.yaml` | U1, H1 |","newText":"| `src/http.ts`, `src/index.ts`, `compose.yaml`, `package.json` | U1, H1 |"},{"oldText":"3. The tunnel is closed.\n","newText":"3. The tunnel is closed.\n4. The record states if the connector accepts a static header credential.\n"},{"oldText":"| C1 | Change the public tool-set constant to the 4-tool set. |","newText":"| C1 | Change the public tool-set constant to the 4-tool set. This is the only change of C1. |"},{"oldText":"| `src/tools.ts` (new) | `registerTools(server, { tools, allowSupersede })` and the tool-set constants. |","newText":"| `src/tools.ts` (new) | `registerTools(server, { tools, allowSupersede, sourcePrefix })` and the tool-set constants. |"},{"oldText":"| `package.json`, `package-lock.json` | `test` script, direct `express` and `jose`, `@types/express`. |","newText":"| `package.json`, `package-lock.json` | `test` script, direct `express`, `jose` and `express-rate-limit`, `@types/express`. |"}]} -->

### Phase 2: Design review

SKIPPED. No UI scope was detected. This is not a completed review.

### Phase 2.5: DX review (mode: DX POLISH, via /autoplan)

Methodology read: `methodology.md` ranges 1-600, 601-1200, 1201-1800, 1801-1905 of 1905 lines. Reference file `dx-hall-of-fame.md` read in full (204 lines).
Outside voice: Codex, disabled. Native review only. No earlier DX review exists for this project.
Product type: an MCP server that one person hosts (the "Claude Code Skill / MCP" type, with Platform parts for the Compose deployment).

#### Step 0A. Persona

```
TARGET DEVELOPER PERSONA
========================
Who:       A developer who hosts a service at home for one user. Today this is the owner.
           The second reader is an AI agent: each tool call and each tool error is read by a model.
Context:   Sets the server up one time, then uses it through AI clients each day.
Tolerance: About 30 minutes for the first setup. Zero patience for a failure with no reason.
Expects:   Docker, a `.env.example`, one command to prepare the database, a copy-paste client block.
```

Decision: persona inferred from the README and the design (auto, P6).

#### Step 0B. Empathy narrative (observed from the README and the code, predictions marked)

I open the README. It tells me to run `npm install`, `npm run build`, edit `.env`, make a Supabase project, paste `schema.sql` into a web editor, and then put a JSON block into my client. I count more than ten steps before one tool call (README lines 16-26, 61-93, 125-147). The plan changes my path: Docker Compose, a home server, a tailnet address. Now I must also run two SQL files with `psql` in a container, pull a model, and fill a unit file. Nothing tells me if a step worked. I predict that my first capture fails, because I forgot the model, and the client shows me a raw fetch error. I predict that I fix it, and then a search fails with `column "scope" does not exist`, because I started the new image before the migration. `/healthz` says `ok` the whole time. When it works, I capture the filter size in one client and find it in a second client, and that moment is good. The path to it has no signs.

Decision: narrative accepted as the working description (auto, P6). It is a prediction for the new path, because the new path does not exist yet.

#### Step 0C. Benchmark and target

| Tool | Start to result | Time and evidence type | DX choice | Source |
|---|---|---|---|---|
| This plan, private door | `git clone` on the server to the first search in a second client | about 30 to 60 minutes, about 10 steps [estimated by the reviewer] | Compose, `psql` by hand, model pull by hand | the plan |
| This repository today, stdio | `npm install` to the first tool call | 10 to 15 minutes [estimated] | Hosted database, schema pasted in a web editor | `README.md:16-26` |
| A Compose-based memory server | clone, then `docker compose up -d` | not measured; migrations run at first start [reported] | Migrations at start, a status command | project README, through a web search |
| A single-container memory server | one `docker run` | not measured [reported] | Embedded model, no other service | project README, through a web search |
| MCP Memory Service (Docker) | image build | 3 to 5 minutes for the build only [reported] | Prebuilt service | project notes, through a web search |

Limit: no source gives a measured time to the first memory, so the table compares setup choices, not times.

Target (auto-decided, P5): 10 minutes or less and 5 commands from `git clone` to the first search in a second client, on a server that has Docker. This is the "Needs Work" tier (5 to 10 minutes). The "Competitive" tier (2 to 5 minutes) is not possible with a model download of about 270 MB and two services. The clock includes the model pull.

#### Step 0D. Magical moment

The moment: a fact with a part number, captured in one client, is the first result of a search for that part number in a second client. Vehicle (auto, P5, lowest effort): the README section "First five minutes" with the commands and the two prompts. No new capability is necessary.

#### Step 0E. Mode

DX POLISH, set by /autoplan.

#### Step 0F. Developer journey map

```
STAGE           | DEVELOPER DOES                         | FRICTION POINTS                              | STATUS
----------------|----------------------------------------|----------------------------------------------|--------
1. Discover     | Reads the README of the fork           | README describes only stdio and Supabase     | fixed (README blocks)
2. Install      | clone, .env, compose up, schema, model | psql by hand; init-db must not run; no check | fixed (npm run migrate, config check)
3. Hello World  | Adds a client, captures, searches      | No client block; silent wrong state          | fixed (client blocks, /readyz, schema check)
4. Real Usage   | Captures with scope, supersedes        | Raw Zod text; misspelled key stored silently | fixed (strict schemas, custom messages)
5. Debug        | Reads stderr of the container          | No code, no request id, raw messages         | fixed (OB_ codes, request_id, runbook)
6. Upgrade      | git pull, compose up                   | New image on old schema; no changelog        | fixed (schema check, migrate, CHANGELOG)
```

#### Step 0G. First-time developer report

```
FIRST-TIME DEVELOPER REPORT
============================
Persona: self-hosting developer, with an AI agent as the tool caller
Attempting: private door, from the plan before this review

T+0:00  Clones the fork. Opens the README. It still describes Supabase and stdio.        -> fixed
T+3:00  Copies .env.example. The new names are there, with no note on which are needed.  -> fixed
T+6:00  docker compose up. The open_brain container starts. /healthz says ok.            -> /readyz added
T+8:00  Adds the client by guessing the URL form. No block to copy.                      -> fixed
T+10:00 First capture fails: raw fetch error. The model is not pulled.                   -> error text with the pull command
T+18:00 Pulls the model. Capture fails: column "scope" does not exist.                   -> schema check at start
T+25:00 Finds the two SQL files, runs psql. Capture works. Search finds the fact.        -> one migrate command
T+26:00 Types supercedes in a capture. The tool says "Captured". The old fact stays.     -> strict schemas (CAP4)
```

#### Step 0.5. Dual voices

CLAUDE SUBAGENT (DX, independent): INPUT hash `6c64afb3...69c1` matches the snapshot. 1 Critical (CAP4), 9 High (G-1, G-2, G-4, A-1, A-2, D-1, D-2 and the CAP6 group), many Medium.
CODEX: disabled. No outside review ran.

```
DX DUAL VOICES - CONSENSUS TABLE:
  Dimension                           Claude subagent        Codex   Consensus
  1. Getting started < 5 min?         no (30 to 60 minutes)  -       N/A
  2. API/CLI naming guessable?        partly (no config names) -     N/A
  3. Error messages actionable?       no (CAP4, 5 x CAP6)    -       N/A
  4. Docs findable and complete?      no (no client block)   -       N/A
  5. Upgrade path safe?               no (old schema path)   -       N/A
  6. Dev environment friction-free?   no (test database)     -       N/A
Outside review disabled: each Consensus cell is N/A. Single-voice critical finding: CAP4, verified below.
```

#### Pass 1: Getting started. 4/10 before, 7/10 after

A 10 for this product: clone, one `.env` edit, one `up` command, and a first search in 5 minutes. Gaps: no single schema command (G-1), a silent wrong state after deploy (G-2), a model pull with no command (G-3), no client block (D-1). All four accepted. Remaining gap: two services and a model download keep the time above 5 minutes.

#### Pass 2: API and configuration design. 6/10 before, 8/10 after

Good: the tool names stay, stdio stays the default, and the security limits are constants. Gaps: no variable has a name (A-1); the required `scope` breaks each client with a raw message (A-2); `scope: all` has two meanings (A-3); a bare `public:` source (A-5); operational values have no override. All accepted: the configuration table, custom messages, the "Scopes searched" line, `public:unknown`, `PUBLIC_RATE_LIMIT` and the port variables. Agent ergonomics: non-interactive, text results, `isError` for failures.

#### Pass 3: Error messages, agent-ready. 4/10 before (CAP4), 8/10 after

```
ERROR PATH MATRIX (agent-ready-v1), before this review
Path                          | Class      | what | fix  | recovery | code | context | trace | redaction | channel | Cap
capture, misspelled key       | usage      | fail | fail | N/A      | fail | N/A     | N/A   | pass      | FAIL    | CAP4:capture_thought:channel
start refusal (config)        | usage      | fail | fail | N/A      | fail | N/A     | N/A   | unknown   | fail    | CAP6:startup:fix
new image on old schema       | environment| pass | fail | fail     | fail | fail    | N/A   | pass      | pass    | CAP6:schema:fix
capture, embedder down        | dependency | pass | fail | fail     | fail | fail    | N/A   | pass      | pass    | CAP6:embedding:fix
public tool, database down    | unexpected | fail | fail | fail     | fail | N/A     | fail  | pass      | pass    | CAP6:public-error:recovery
supersede, bad id             | usage      | fail | fail | N/A      | fail | N/A     | N/A   | pass      | pass    | CAP6:supersede:fix
```

- CAP4, verified in the code: each schema is a plain `z.object` (`src/index.ts:28-31`), and fact M3 of the plan says that Zod removes unknown keys. Today an agent sees "Captured thought (id: ...)". Corrected: `Error [OB_VALIDATION]: capture_thought does not accept the key "supercedes". Did you mean "supersedes"? Nothing was stored.`
- CAP6 paths: each one gets a code, a "Nothing was stored." statement and a next step. See the accepted block.
- Unexpected failure path: the public door returns a fixed text with a `request_id`, and the detail goes to stderr with the same id.
- Safety model: the public door can not invalidate or replace, and each public row has the `public:` marker. No debug mode exists; the request log is always on.

After the fixes, no CAP4 path remains. One residual gap keeps the score at 8: the SDK writes the validation text, so the server can shape the message but not add a structured code field.

#### Pass 4: Documentation. 5/10 before, 8/10 after

Gaps: no copy-paste client block (D-1); the README changes one pull request after the behavior (D-2); the runbook covers only the phone (D-3); no section for the tests (D-4); `.env.example` has no notes (D-5). All accepted. `docs/errors.md` is new. No interactive element applies to this product.

#### Pass 5: Upgrade path. 5/10 before, 7/10 after

Breaking change: the required `scope`. No deprecation period is possible for one user, so the plan gives a "Breaking change" note, a `CHANGELOG.md` entry and a clear message. The migration is idempotent. New: the schema check stops a new image on an old schema with the command to run. No codemod applies. Residual gap: no version number policy for the fork.

#### Pass 6: Developer environment. 5/10 before, 8/10 after

Gaps: the database tests can collide (G-4); the pure tests stop when no database exists (G-5); the Node version and the test pattern on Windows (G-6). All accepted: `--test-concurrency=1`, the helper only in database test files, `npm run test:db:up`, `engines >=22`. CI runs on each push. TypeScript types stay.

#### Pass 7: Community. 4/10 before, 5/10 after

The fork is public with an MIT license. It has no contributing guide and no issue template. This is a tool for one person, so the review adds only the "Run the tests" section. Not in scope: a contributing guide.

#### Pass 8: Measurement. 3/10 before, 6/10 after

No measure existed. Accepted: one measured time to the first result by the owner in Phase 1, the use check before Phase 2 (from the CEO phase), and the request log. No telemetry: this is a private tool. `/devex-review` can compare the measured time with the 10-minute target after Phase 1.

#### Claude Code Skill and MCP checklist

- Agent-readable errors: was a gap, now accepted (codes, fix, recovery).
- Bounded autonomy: covered. The public door has a fixed tool set, no invalidation and a scope list.
- Error recovery: covered. A failed capture stores nothing, and the text says so.
- State storage, progressive consent, auto-upgrade, skill composition, session continuity: not applicable to a memory server with one table.

#### DX Review Scorecard

```
+====================================================================+
|              DX PLAN REVIEW - SCORECARD                            |
+====================================================================+
| Dimension            | Score  | Prior  | Trend  |
|----------------------|--------|--------|--------|
| Getting Started      |  7/10  |  4/10  |  up    |
| API/CLI/SDK          |  8/10  |  6/10  |  up    |
| Error Messages       |  8/10  |  4/10  |  up    |
| Documentation        |  8/10  |  5/10  |  up    |
| Upgrade Path         |  7/10  |  5/10  |  up    |
| Dev Environment      |  8/10  |  5/10  |  up    |
| Community            |  5/10  |  4/10  |  up    |
| DX Measurement       |  6/10  |  3/10  |  up    |
+--------------------------------------------------------------------+
| TTHW                 | 10 min target | 30 to 60 min estimated      |
| Competitive Rank     | Needs Work (5 to 10 minutes)                |
| Magical Moment       | designed, via the README "First five minutes" |
| Product Type         | MCP server, self-hosted                     |
| Mode                 | POLISH                                      |
| Overall DX           |  7.1/10 |  4.5/10 |  up   |
+====================================================================+
| DX PRINCIPLE COVERAGE                                              |
| Zero Friction      | gap (two services and a model download)       |
| Learn by Doing     | covered (two prompts in the README)           |
| Fight Uncertainty  | covered (/readyz, schema check, codes)        |
| Opinionated + Escape Hatches | covered (constants and variables)   |
| Code in Context    | covered (client blocks, Compose file)         |
| Magical Moments    | covered                                       |
| Agents Are Users   | covered (strict schemas, error contract)      |
+====================================================================+
```

"Prior" is the score of the plan before this review, not an earlier review. Community is below 6: this is a known limit of a tool for one person, not adoption debt. The estimated time before the fixes was above 10 minutes, which the skill marks as a blocking issue; the accepted fixes set the 10-minute target, and the owner measures it in Phase 1.

#### DX Implementation Checklist

```
DX IMPLEMENTATION CHECKLIST
============================
[ ] Time to the first search in a second client is 10 minutes or less (measured one time)
[ ] The database is ready after one command: npm run migrate
[ ] /readyz on the private door says ready, or names the failed check
[ ] The magical moment works from the README "First five minutes"
[ ] Each error has an OB_ code, a next step and "Nothing was stored." where true
[ ] Each tool schema is strict; a misspelled key fails
[ ] Each variable is in the configuration table and in .env.example
[ ] The README has a copy-paste block for each client
[ ] The README changes in the same commit as the behavior
[ ] CHANGELOG.md has the breaking change for the required scope
[ ] npm test runs the pure tests with no database
[ ] CI runs on each push with the service container
[ ] The scan and the probe never print a secret
```

#### NOT in scope (DX)

- A contributing guide and issue templates. Reason: a tool for one person.
- A structured error field in tool results. Reason: the SDK owns the validation result form.
- A model pull service in the Compose file. Reason: the README command and the error text cover it.
- Telemetry. Reason: a private tool.

#### What already exists (DX)

`README.md` setup sections, `.env.example`, `scripts/test-env.mjs` (configuration check from the command line), `scripts/encode-password.mjs`, and the `isError` result form of each handler.


<!-- autoplan-accepted:dx -->
- Strict tool schemas (task P2). Each of the 5 tool schemas is strict on each door and in stdio, so an unknown key fails validation. This replaces "the strict public capture schema" of task P8: the public capture schema differs only because it has no `supersedes` field. Test: a private `capture_thought` call with the misspelled key `supercedes` returns `isError: true` and stores no row.
- Configuration table (task P9 for `.env.example`, task H1 for the check). The variables are: `OPEN_BRAIN_MODE` (`stdio` default, or `http`), `DATABASE_URL` (required, secret), `EMBEDDING_PROVIDER` (`openai`, `google`, `ollama`, `stub`), `OLLAMA_HOST` (optional), `PRIVATE_PORT` (default 8787), `PRIVATE_ALLOWED_HOSTS` (required in `http` mode, list with commas), `PUBLIC_PORT` (default 8788), `PUBLIC_ALLOWED_HOSTS`, `OAUTH_ISSUER`, `OAUTH_AUDIENCE`, `OAUTH_SUBJECT`, `OAUTH_JWKS_URL` (these five are required when the public door is on), `PUBLIC_DOOR` (`off` default, or `on`), `PUBLIC_RATE_LIMIT` (default 120), `OPEN_BRAIN_TEST` (test flag), `TEST_DATABASE_URL` (tests only), `TAILNET_IP` (Compose file only). `.env.example` has one comment line for each variable with the door, required or optional, and a placeholder. Test: the variable names in `.env.example` are the same set as the names that the configuration check reads.
- Configuration check at start (task H1; the provider part in task P3). One function checks the full configuration before a listener starts. It collects each problem, writes one line for each to stderr in the form `OB_CONFIG_MISSING: OAUTH_AUDIENCE is not set. Add it to .env. See docs/errors.md#ob_config_missing`, prints variable names and never values, and exits with code 78. It covers an unknown provider value, the stub in `http` mode with no test flag, an absent OAuth value with `PUBLIC_DOOR=on`, and an absent host list. Test: two absent variables give two lines and exit code 78.
- Schema check at start and one migrate command (task P4). A new script `npm run migrate` applies `schema-ollama.sql` and then each file in `migrations/` in order; each statement is idempotent. The owner runs it by hand after approval; the server never runs it. `npm run init-db` stays, and it prints a line that names `npm run migrate` for the Ollama schema. At start in `http` mode, the server checks that the `scope` column exists. If it does not, the server writes `OB_SCHEMA_OLD: the database has no scope column. Run: npm run migrate` and exits with code 78. The test helper and CI use the same script. This replaces the `psql` owner task of Phase 1. Tests: a start against a database with no `scope` column exits with 78 and the text; a second run of `npm run migrate` makes no change. (Taste decision: a script in place of `psql` by hand.)
- Readiness route (task H1). The private door serves `GET /readyz`. It checks one database query, the `scope` column and one embedding call, and returns `200` with `{"status":"ready"}` or `503` with the name of the failed check. The public door has no `/readyz`. `npm run test:env` does the same three checks from the command line. Test: with an embedder that throws, `/readyz` returns `503` and names the embedding check.
- Error codes and texts (task P2 for the wrapper, the tasks below for each text). Each tool error and each start error starts with a stable code. A new file `docs/errors.md` has one anchor for each code. The codes are `OB_CONFIG_MISSING`, `OB_CONFIG_INVALID`, `OB_SCHEMA_OLD`, `OB_VALIDATION`, `OB_EMBEDDING_UNAVAILABLE`, `OB_DB_UNAVAILABLE`, `OB_SUPERSEDE_NOT_FOUND`, `OB_SUPERSEDE_INVALID`, `OB_SUPERSEDE_CONFLICT` and `OB_INTERNAL`. Each tool error text states the operation, says "Nothing was stored." when that is true, and gives the next step. Texts: an embedding failure names the provider, the model and the variable `OLLAMA_HOST`, and for an Ollama `404` it gives the command `docker compose exec ollama ollama pull nomic-embed-text` (task P3). A supersede error has the id, the state ("not found", or "already invalid, replaced by <id>") and the next step "Run search_brain to find the current fact, then try again with its id" (task P8). The loser of a parallel supersede gets `OB_SUPERSEDE_CONFLICT` with "another capture replaced this fact; read it first" and no retry advice (task P8). Tests: each code has one test that checks the code and the "Nothing was stored." sentence where it applies.
- Validation messages (task P5). The Zod fields have custom messages: `scope` ("scope is required. Use one of: house, work, general (search and list also accept all)"), `content` and `query` length (the limit of 8192 and the actual length), `source` length, and the `public:` prefix rule. Each tool description has the same `scope` line. Test: a call with no `scope` returns the custom text.
- Request id (task H1). The middleware makes a `request_id` for each HTTP request. The request log line has `request_id` and `error_code` (null when no error). The error detail line on stderr has the same `request_id`. On the public door, the fixed error text becomes `Error [OB_INTERNAL]: the request failed. Nothing was stored. Try again one time. Reference: <request_id>`, with `OB_EMBEDDING_UNAVAILABLE` or `OB_DB_UNAVAILABLE` in place of `OB_INTERNAL` for those two classes. This replaces the fixed text "Error: the request failed." of the CEO block. Test: the reference in a public error result is the `request_id` of the log line.
- Error detail redaction (task P2). The error detail line on stderr has the error code and the message of the error only. It never has `err.detail`, the query parameters, the note content or a token. Test: a row that fails the `CHECK` constraint does not put its content into stderr.
- HTTP error bodies (task U2; the key fetch part in task U1). A `429` has the `Retry-After` header. The `403` of the subject check has the OAuth JSON form (`error`, `error_description`). A host rejection writes the rejected host name to the log and names `PRIVATE_ALLOWED_HOSTS` or `PUBLIC_ALLOWED_HOSTS`. The `500` of a key fetch failure has the body text "identity provider keys are not available, try again later", and the log has the provider host. Tests: the `429` has `Retry-After`; the `403` body has `error`.
- Degraded search flag (task P7). When `search_brain` returns the text list only, the request log line has `degraded: true`, and the first line of the result keeps the note. Test: the log line of a degraded search has `degraded: true`.
- Public result lines (task U2 for the scope line, task P8 for the source value). On the public door, the first line of a `search_brain` or `list_recent` result is "Scopes searched: house, general". A public capture with no `source` stores `public:unknown`; this replaces the bare `public:` of the CEO block. Tests: the scope line is in a public result; a public capture with no `source` stores `public:unknown`.
- Script output (task P9 for the scan, task U3 for the probe). `scripts/check-no-secrets.mjs` prints the file, the line number and the pattern class only, never the matched text, exits non-zero on a match, and reads an allow file for false positives. `scripts/probe-public-door.mjs` prints the expected and the actual status of each case, never prints a token, exits 0 only if all 5 cases pass, and exits with a different code and the expected path when the token file is absent. Tests: the scan output for a planted JWT string does not contain the string.
- Test loop (task P1). `npm test` runs with `--test-concurrency=1`, because the database tests share one database. Only the database test files import `test/helpers/db.ts`, so the tests of `src/search.ts` and `src/auth.ts` run with no database. A new script `npm run test:db:up` starts a `pgvector/pgvector` container for local tests. In CI, an absent `TEST_DATABASE_URL` makes the database tests fail, not skip. The `engines` field becomes `>=22`, and the `test` script names the test files with a quoted pattern that Node expands. Test: `npm test` with no `TEST_DATABASE_URL` still runs and passes the pure tests on the developer machine.
- Model check (task H1). The start line has the count of rows whose `embedding_model` differs from the active model. `/readyz` reports the same count. The server still starts. Test: one row with a different model gives a count of 1.
- Docs in the same commit (all tasks). Each commit that changes a tool contract or a setup step also changes the README section for it. Task P5 adds a "Breaking change" note for the required `scope` and a new `CHANGELOG.md` entry. Task H4 keeps the door, deploy and runbook text. Task P9 corrects `repository.url` in `package.json`, which has the placeholder `yourusername`.
- README blocks (task H4, after the Phase 0a result). The README gets one copy-paste block for each client with the placeholder `<tailnet-ip>`: the `claude mcp add --transport http` command for Claude Code, the JSON block for Claude Desktop (with the bridge if Phase 0a shows that it is necessary), the `mcp.json` block for Cursor, and the connector steps for the phone. It gets a section "First five minutes" with the commands in order (`cp .env.example .env`, `docker compose up -d --build`, `npm run migrate`, the model pull, one client block) and two prompts: capture a fact with a part number, then search for the part number from a second client. It gets "If the private door does not connect" (host list, `TAILNET_IP`, a client that refuses HTTP, model not pulled, migration not applied) and "Run the tests" (`npm run test:db:up`, the two variables, the stub provider). `AGENTS.md` gets the same test commands.
- Time to first result (owner task, Phase 1). The owner measures one time, with a clock, the time from `git clone` on the home server to the first search result in a second client, and records it in the design document. The target is 10 minutes or less with Docker installed.
<!-- /autoplan-accepted:dx -->

### Phase 3: Eng review (via /autoplan)

Methodology read: `methodology.md` ranges 1-600, 601-1200, 1201-1800, 1801-2143 of 2143 lines.
Outside voice: Codex, disabled. Native review only. Target: this plan file, section "Implementation plan".

#### Step 0. Scope challenge

What already solves each sub-problem: see the CEO table "Existing code leverage". Checked again in the code for this phase: the lazy pool (`src/db.ts:17-26`, `max: 5`), `getBrainStats` with no scope (`src/db.ts:157-181`), the HNSW index (`schema-ollama.sql:24-25`) and `import "dotenv/config"` (`src/index.ts:2`).

Complexity check: the plan changes or adds about 30 files and 6 new modules (`tools`, `http`, `auth`, `search`, `config`, the migrate script). This is above the limit of 8 files. Scope decision (auto, override "never reduce", P2): `scope accepted as-is`. Structure decision (auto, P5): the original arrangement of modules stays, with one change: the switches of `registerTools` become one profile object. No smaller arrangement keeps the approved contracts.

Search check: the plan uses built-ins where they exist. [Layer 1] `StreamableHTTPServerTransport` and `requireBearerAuth` of the SDK, `jose` for the key set, `express-rate-limit`, `node:test`, Postgres full-text search, a row lock for the supersede race. No new pattern needs research beyond the SDK source that was read on 2026-11-12.

Distribution check: the deliverable is a service for one user. The image builds on the home server with `docker compose up -d --build`. No registry and no release pipeline are in scope; CI builds and tests only.

TODOS: no `TODOS.md` existed. This phase writes it with the deferred items of all phases.

REALITY: premise-table finding 14 premises from the CEO phase stay; unverified=4 (connector reach, Claude Desktop on the tailnet, Ollama speed, identity provider) src/index.ts:99
REALITY: already-done pass no file of the plan exists on origin/main; the last source commit is 6149697 src/index.ts:60
REALITY: surface-check finding `npm test`, `npm run migrate` and `npm run test:db:up` do not exist yet and tasks P1 and P4 add them; `StreamableHTTPServerTransport`, `requireBearerAuth` and `InMemoryTransport` exist in SDK 1.27.1 package.json:13
REALITY: binding-decisions pass the six owner decisions and the accepted lists agree with the new task tables docs/plans/two-door-house-brain-plan.md:42
REALITY: numbers pass pool max 5 [measured: src/db.ts:23]; 768 dimensions [measured: src/embeddings.ts:7]; embedding timeout 15 s [estimated: docs/plans/two-door-house-brain-plan.md:42]; limits 120 and 600 each minute [estimated: docs/plans/two-door-house-brain-plan.md:42]; retry 60 s [estimated: docs/plans/two-door-house-brain-plan.md:42] src/db.ts:23
REALITY: deferred-asks pass no linked issue exists docs/plans/two-door-house-brain-plan.md:1
REALITY: pr-count pass 5 pull requests plus one spike branch that does not merge; the Eng phase adds no pull request docs/plans/two-door-house-brain-plan.md:213

Scope challenge result: scope accepted as-is.

#### Step 0.5. Dual voices

CLAUDE SUBAGENT (eng, independent): INPUT hash `b1d7434f...5ac5` matches the snapshot. 0 Critical, 7 High, 14 Medium, 9 Low.
CODEX: disabled. No outside review ran.

```
ENG DUAL VOICES - CONSENSUS TABLE:
  Dimension                            Claude subagent            Codex   Consensus
  1. Architecture sound?               yes, with H-6 and H-7      -       N/A
  2. Test coverage sufficient?         no (H-3, H-4, M-12, M-6)   -       N/A
  3. Perf risks and budget named?      no (H-5, M-3)              -       N/A
  4. Security threats covered?         model correct; gaps        -       N/A
  5. Error paths handled?              partly (M-1, M-4, M-5)     -       N/A
  6. Deployment risk manageable?       no (H-1, H-2)              -       N/A
Outside review disabled: each Consensus cell is N/A. No single-voice Critical finding.
```

Each of the 7 High and 14 Medium findings is accepted. Of the 9 Low findings, 8 are accepted as text in the plan and L-2 is accepted as an owner task with a recorded risk. See the audit trail.

#### Section 1: Architecture review

```
 src/index.ts  (reads the mode; the only caller of process.exit)
   |-- src/config.ts   check(env) -> problem list            (new)
   |-- stdio: McpServer + registerTools(server, STDIO, noopCtx)
   '-- http:  src/http.ts  createDoorApp(profile, deps)      (new)
               |-- host list -> /healthz, /readyz (private only)
               |-- public only: pre-auth limit -> src/auth.ts (new) -> body parser -> limit
               |-- for each request: new McpServer + ctx -> registerTools(server, profile, ctx)
               '-- request log (reads ctx)
 src/tools.ts  profiles + 5 handlers + one error wrapper      (new, from src/index.ts)
   |-- src/db.ts          queries, supersede transaction, schema check, closePool
   |     '-- src/search.ts  tokens, fusion, final order       (new, pure)
   '-- src/embeddings.ts  provider resolver, stub, timeout
 scripts/migrate.mjs -> schema-ollama.sql + migrations/001-scope-hybrid.sql
```

Design-twice. The plan adds a public surface, `registerTools`, that two callers use.
- Shape 1 (the plan before this phase): `registerTools(server, { tools, allowSupersede, sourcePrefix, allowedScopes })` plus a public error switch. Five switches, set at two call sites.
- Shape 2: `registerTools(server, profile, ctx)` with four named profile constants. The door picks one name.
- Pick: shape 2. It hides the same behavior behind a smaller surface, and a wrong combination of switches (for example the public tools with the private scope list) can not be written.

Red flags:
1. Shallow module: none. `src/search.ts` and `src/auth.ts` hide real logic.
2. Information leakage: the scope list was in the tool schema and in the query. Fix: the profile owns it, and the query takes it as an argument.
3. Temporal decomposition: none.
4. Pass-through method: none planned.
5. Split ownership: `is_error` was written by a wrapper and read through a store. Fix: one `ctx` object for each request.
6. Two ways to do one task: `npm run init-db` and `npm run migrate`. Fix: `init-db` stays for the OpenAI schema of upstream users and prints a pointer; the README names only `migrate`.
7. Importable internals: tests must import the profiles and `createDoorApp`. Accepted; these are the public surface.
8. Hand-synced list: the variable names in `.env.example` and in the configuration check. Fix: one test compares the two.

Findings:
- [INFORMATIONAL] (confidence: 9/10) docs/plans/two-door-house-brain-plan.md:108 — "## Tasks": the task tables describe the old behavior, and the requirement lists replace parts of them (H-7). Accepted: the tables are rewritten in this phase.
- [INFORMATIONAL] (confidence: 8/10) docs/plans/two-door-house-brain-plan.md:118 — "| P2 | Move the 5 handlers to `src/tools.ts` with no change of behavior." The same task now also holds the wrapper and strict schemas (H-7). Accepted: split into P2a and P2b.
- [INFORMATIONAL] (confidence: 8/10) src/db.ts:23 — `pool = new pg.Pool({ connectionString: url, max: 5 });` A slow embedder inside a transaction holds one of 5 connections (M-5). Accepted: the embedding is computed before the transaction.
- [INFORMATIONAL] (confidence: 7/10) docs/plans/two-door-house-brain-plan.md:140 — "| H2 | Add the Dockerfile and the Compose file." The public port and the first run order are not stated (H-1, H-4). Accepted.

Production failure for each new path: tunnel down (the phone gets no answer; runbook), key set not reachable (`500`, log line), Ollama cold (timeout, degraded search), Tailscale late at boot (the unit waits), old schema (exit 78 with the command). Each one is in the plan after this phase.

Dispositions: 4 findings accepted (auto-decided, rows 40 to 45 of the audit trail).

#### Section 2: Code quality review

- [INFORMATIONAL] (confidence: 9/10) src/index.ts:49 — `} catch (err) {` The same block is in 5 handlers (lines 49, 80, 113, 145, 170). The CEO phase accepted one wrapper; this phase gives it the `ctx` parameter. No new decision.
- [INFORMATIONAL] (confidence: 9/10) src/db.ts:157 — `export async function getBrainStats(): Promise<{` It has no scope argument, so the public door would count `work` rows (M-9). Accepted.
- [INFORMATIONAL] (confidence: 8/10) src/index.ts:2 — `import "dotenv/config";` Tests that import the server would load the real `.env` (M-11). Accepted: the guard in `src/db.ts` and no `dotenv` import in tests.
- [INFORMATIONAL] (confidence: 7/10) src/db.ts:37 — `const client = await getPool().connect();` Each function repeats connect, try, release. Shared-code check: 5 callers with the same shape (`src/db.ts:37`, `66`, `109`, `130`, `161`). Decision (auto, P3): no extraction now. `pool.query` covers the single-query functions when a function is changed for scope; the transaction needs its own client. No abstraction is added.

No stale ASCII diagram exists in the touched files. Dispositions: 2 accepted, 1 carried from the CEO phase, 1 no change.

#### Section 3: Test review

Test framework: none today (`package.json` has no `test` script, and no test file exists). The plan selects `node:test` with `tsx`, which the owner approved in the design ("the `node:test` runner that Node already has").

Regression rule: three planned changes put existing behavior at risk. (1) The move to `src/tools.ts` (P2a): the 5 tools must answer as before; the P2a test covers it. (2) Strict schemas and the required `scope` (P2b, P5): an intended change, named in the "Breaking change" note. (3) The search query rewrite (P7): a vector-only result for a query with no part token must stay the same order as today; accepted as a P7 test.

```
CODE PATHS                                                  USER FLOWS
[+] src/tools.ts                                            [+] Capture on the PC, search on a second client
  |-- profiles                                                |-- [GAP -> plan] [->E2E] first five minutes (by hand)
  |   |-- [GAP -> plan] tool set of each profile              '-- [GAP -> plan] [->E2E] second vendor client (by hand)
  |   '-- [GAP -> plan] call of a tool outside the profile  [+] Replace a fact
  |-- strict schemas                                          |-- [GAP -> plan] supersede, then search finds only the new row
  |   '-- [GAP -> plan] misspelled key fails                  '-- [GAP -> plan] two captures at the same time
  |-- error wrapper                                         [+] Phone search (public door)
  |   |-- [GAP -> plan] each OB_ code                         |-- [GAP -> plan] [->E2E] probe with real tokens (by hand)
  |   '-- [GAP -> plan] redaction of err.detail               |-- [GAP -> plan] hidden tool called by name
[+] src/db.ts                                                 '-- [GAP -> plan] work rows never returned
  |-- scope filter         [GAP -> plan] 5 cases            [+] Error states
  |-- vector list          [GAP -> plan] 200 + 3 rows         |-- [GAP -> plan] embedder down: degraded search
  |-- text list            [GAP -> plan] 3 part numbers       |-- [GAP -> plan] embedder never answers: timeout
  |-- model filter         [GAP -> plan] other model          |-- [GAP -> plan] old schema: OB_SCHEMA_OLD
  |-- supersede            [GAP -> plan] 3 codes, parallel    |-- [GAP -> plan] database down at start
  |-- stats by scope       [GAP -> plan]                      '-- [GAP -> plan] key set not reachable: 500
  '-- schema check         [GAP -> plan]                    [+] Boot
[+] src/search.ts          [GAP -> plan] tokens, merge        '-- [GAP -> plan] [->E2E] power cycle (by hand)
[+] src/embeddings.ts      [GAP -> plan] resolver, stub, timeout
[+] src/auth.ts            [GAP -> plan] 6 checks, alg cases
[+] src/http.ts
  |-- [GAP -> plan] parallel calls, 405, batch 400, Host
  |-- [GAP -> plan] limits, error bodies, log lines
  '-- [GAP -> plan] /healthz, /readyz
[+] src/config.ts          [GAP -> plan] problems, exit 78
[+] scripts/migrate.mjs    [GAP -> plan] second run, rows

COVERAGE today: 0/38 paths tested (no test exists).  COVERAGE in the plan: 38/38 paths have a named test or a check by hand.
E2E by hand: 5 (first run, second vendor, probe, power cycle, restore).  Eval: 0 (no LLM call and no prompt file).
```

Legend: [GAP -> plan] = no test exists today and the plan names one; [->E2E] = a check on the real system.

Test gaps that this phase adds (auto-decided, P1): a call of a hidden tool by name (H-3); a wrong `Host` header and port 8788 on the LAN (H-4); 200 and 3 rows (H-5); 10 parallel calls, `405` and the batch `400` (M-12); the algorithm cases of the verifier (M-6); the migration on a database with rows (M-8); the test database guard (M-11); the vector-only order regression (P7).

LLM and eval scope: none. No prompt file and no LLM call are in the plan.

Tests made obsolete by this plan: none. No test exists.

Test plan artifact: written to the gstack project folder (path in the phase summary).

Dispositions: 8 test gaps accepted.

#### Section 4: Performance review

- [INFORMATIONAL] (confidence: 8/10) schema-ollama.sql:24 — `CREATE INDEX IF NOT EXISTS thoughts_embedding_idx ON thoughts` `USING hnsw (embedding vector_cosine_ops);` A scope filter after the index scan can return too few rows (H-5). Accepted: exact scan for the vector list. Scale: some hundreds to some thousands of rows; an exact scan of 10 000 rows of 768 values is some tens of milliseconds [estimated, not measured].
- [INFORMATIONAL] (confidence: 7/10) src/embeddings.ts:55 — `const res = await fetch(`${base}/api/embed`, {` The call has no timeout (M-3). Accepted: 15 seconds.
- [INFORMATIONAL] (confidence: 6/10) Medium confidence, verify this is actually an issue. src/db.ts:113 — `SELECT id, content, embedding::text, people, topics, type, action_items, source, created_at` Each search returns the full vector as text for each row, about 8 kB for each row, and the tool does not show it. Decision (auto, P3): remove `embedding::text` from the list and search queries in task P5, because that task already changes each `SELECT`. `insertThought` keeps it.

Budget: one search is one embedding call (15 seconds at most) and two queries (10 seconds statement limit). The owner measures one embedding call in Phase 1 (premise P-13). No N+1 query. No cache is necessary.

Dispositions: 3 accepted.

#### Failure modes (Eng)

| New path | Realistic failure | Test | Error handling | The user sees |
|---|---|---|---|---|
| First run | New image starts before the migration | by hand | Exit 78, `OB_SCHEMA_OLD` with the command | A clear line in the log |
| Boot | Tailscale has no address yet | power cycle by hand | The unit waits 120 s, then restarts on failure | The door is late, then up |
| Vector list | Small scope in a large table | yes | Exact scan | Correct rows |
| Embedding | Ollama loads the model for 20 s | yes | Timeout, degraded search or `OB_EMBEDDING_UNAVAILABLE` | A note or a clear error |
| Public door | A hidden tool is called by name | yes | Not registered in the profile | An error; no row changes |
| Public door | Flood with no token | yes | Limit before the sign-in | `429` |
| Token check | Forged key id | yes | `401`, not `500` | Sign-in again |
| Supersede | Two captures replace one row | yes | Row lock, `OB_SUPERSEDE_CONFLICT` | A clear error for the second |
| Tests | A test points at the real database | yes | Guard throws | The test run stops |
| Backup | A dump can not be restored | by hand, Phase 1 | Restore check before real use | Known before data loss |

Critical gaps: 0. No row has no test, no handling and a silent result.

#### NOT in scope (Eng)

- An approximate vector index with an iterative scan. Reason: an exact scan is fast at this size. Deferred to `TODOS.md`.
- A shared database helper for connect and release. Reason: no net saving for 5 small functions.
- A registry image and a release pipeline. Reason: one server builds its own image.
- A sign-in on the private door. Reason: Tailscale controls access; the owner adds an ACL.

#### What already exists (Eng)

The 5 handlers, the three embedders, the soft delete and the format function are reused. The SDK gives the transport, the bearer middleware, the host check and the in-memory transport. `jose` and `express-rate-limit` are in the lock file. No shared-code extraction is accepted.

#### Worktree parallelization strategy

| Step | Modules touched | Depends on |
|---|---|---|
| PR 1: guards and test harness | repository root, `test/`, `.github/` | - |
| Spike 0a | spike branch only | - |
| PR 2: scope and hybrid search | `src/`, `migrations/`, `scripts/` | PR 1, result of 0a |
| Spike 0b | spike branch only | 0a, PR 1 |
| PR 3: private door | `src/`, `deploy/`, Docker files, README | PR 2, result of 0b |
| PR 4: public door | `src/`, `scripts/` | PR 3 |
| PR 5: public capture | `src/` | PR 4, use check |

Lane A: PR 1, then PR 2, then PR 3, then PR 4, then PR 5 (each one changes `src/`). Lane B: the spike branch (0a, then 0b), which changes no file of `main`. Launch A and B together after PR 1. The spikes are owner work on the home server, so the two lanes do not conflict. In lane A the work is sequential.

#### Completion summary (Eng)

- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 7/7 applicable rows emitted (`PLAN_REALITY` line), 4 unverified premises
- Architecture Review: 4 issues found
- Code Quality Review: 4 issues found
- Test Review: diagram produced, 8 gaps identified
- Performance Review: 3 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 7 items written (the deferred items of all phases)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review; 5 taste decisions wait for the final gate
- Outside voice: codex, disabled
- Parallelization: 2 lanes, 1 parallel pair (lane A with the spike lane) / lane A is sequential
- Lake Score: N/A (no scored coverage question was asked)


<!-- autoplan-accepted:eng -->
- Task tables are current (all tasks). The task tables, the owner tasks and the acceptance criteria in this plan hold each requirement of the three lists. Where a list item of an earlier phase and a later item disagree, the later item and the task tables apply. Task P2 is now P2a (move only) and P2b. Task H1 is now H1a, H1b and H1c.
- Door profiles (task P2b). One constant object for each door holds each switch: `name`, `tools`, `allowSupersede`, `sourcePrefix`, `allowedScopes` and `publicErrors`. The profiles are `STDIO`, `PRIVATE`, `PUBLIC_READ` and `PUBLIC_CAPTURE`. `registerTools(server, profile, ctx)` takes one profile; this replaces the separate options `tools`, `allowSupersede`, `sourcePrefix` and `allowedScopes`. A tool that is not in the profile is not registered, so a call by name fails. Tests: each profile lists its tools; on `PUBLIC_READ`, a `tools/call` for `invalidate_thought` and for `capture_thought` returns an error and no row changes; on `PUBLIC_CAPTURE`, a `tools/call` for `invalidate_thought` returns an error and the row stays valid.
- Request context as a parameter (tasks P2b and H1a). The door makes one `McpServer` and one `ctx` object for each HTTP request and gives `ctx` to `registerTools`. `ctx` has `requestId` and `record(result)`, which holds `is_error`, `error_code` and `degraded` for the log line. Stdio gives a `ctx` that does nothing. This replaces the `AsyncLocalStorage` store of the CEO list. A JSON-RPC batch array is rejected with `400`. Tests: a batch body gets `400`; the log line of a tool call has the values that `ctx.record` got.
- Strict schema proof (task P2b, first step). Before other work in P2b, one test proves on SDK 1.27.1 that a tool registered with `z.object(...).strict()` rejects an unknown key and that the published input schema has `additionalProperties: false`. If the SDK does not permit it, the wrapper checks the raw arguments for unknown keys, and the plan records that change.
- Validation code (task P5). An SDK validation error can not start with a code, because the SDK writes the first words. Each custom Zod message ends with `(OB_VALIDATION)`. The rule "each tool error starts with a code" applies to errors of the wrapper only.
- First run order (tasks H2 and H4, owner task of Phase 1). The order is: `docker compose up -d postgres`, then `docker compose run --rm open_brain npm run migrate`, then `docker compose up -d`, then the model pull. The README "First five minutes", the deploy runbook and the owner task use this one order. The image contains `scripts/`, `migrations/` and `schema-ollama.sql`, and `scripts/migrate.mjs` is plain JavaScript that runs with production dependencies only. `npm run test:env` runs in the container in the same way. Test (by hand, Phase 1): the three commands on an empty volume give a server that answers `/readyz` with `ready`.
- Ports and hosts (tasks H1a and H2). Compose publishes `${TAILNET_IP:?TAILNET_IP is required}:8787:8787` and `127.0.0.1:8788:8788`. `createDoorApp` refuses a host list that is empty. Tests: a request with a wrong `Host` header is rejected on each door. Phase 1 gets the acceptance criterion "A request to port 8788 on the LAN address gets no connection."
- One supervisor (tasks H2 and H3). The systemd unit is the one supervisor of the stack at boot: it has `After=` and `Wants=` for `tailscaled.service` and `docker.service`, waits for `tailscale ip -4` (120 seconds at most), then runs `docker compose up -d`, and has `Restart=on-failure`. The Compose restart policy restarts a container that crashes after a good start. The Compose file has a health check on Postgres and `depends_on` with `condition: service_healthy`, log rotation (`max-size`, `max-file`) and `init: true`. The restart checks of Phase 1 and Phase 2 use a real power cycle of the home server, not `docker restart`.
- Start against a database that is not ready (task H1b). The schema check at start tries the connection again for 60 seconds at most. A connection failure after that time exits with code 1 and `OB_DB_UNAVAILABLE`. Exit code 78 is only for `OB_SCHEMA_OLD` and configuration errors. In stdio mode, the same schema check runs at the first database use and returns `OB_SCHEMA_OLD` as a tool error. Tests: a database that is down at start gives retries and then `OB_DB_UNAVAILABLE`, not `OB_SCHEMA_OLD`; stdio on an old schema returns `OB_SCHEMA_OLD`.
- Exact vector scan with the scope filter (task P7). The vector list query runs in a transaction with `SET LOCAL enable_indexscan = off`, so Postgres applies the scope filter before the limit. Reason: the HNSW index applies a filter after its scan and can return too few rows for a small scope. An exact scan is some milliseconds at this size. Test: with 200 `work` rows and 3 `house` rows, a `scope: house` search returns the 3 rows.
- Model filter (tasks P4 and P5). The migration sets `embedding_model` of each existing row to `nomic-embed-text`. The vector list uses only rows whose `embedding_model` is the active model; the text list uses each row. The count of other rows uses `IS DISTINCT FROM`. Tests: the migration on a database that has rows sets the value; a row with a different model is absent from the vector list and present in the text list.
- Stats by scope (task P5). `getBrainStats` takes the scope list of the door, so the public door counts only `house` and `general` rows. Test: with one row of each scope, the public `brain_stats` total is 2.
- Timeouts (tasks P3, P1 and U1). Each embedding call has a timeout of 15 seconds with `AbortSignal.timeout`. The pool has `connectionTimeoutMillis` of 5 seconds and a `statement_timeout` of 10 seconds. The key fetch has the `jose` timeout of 5 seconds. The Compose file sets the Ollama keep-alive so that the model stays loaded. Test: with an embedder that never resolves, a search returns the degraded result after the timeout, and a capture fails with `OB_EMBEDDING_UNAVAILABLE`.
- Supersede method (task P8). The embedding is computed before the transaction opens. `supersedes` is a UUID in the Zod schema. In the transaction, the server reads the old row first: no row gives `OB_SUPERSEDE_NOT_FOUND`; an invalid row gives `OB_SUPERSEDE_INVALID`. Then it inserts the new row and runs the guarded `UPDATE`; 0 rows after a valid read gives `OB_SUPERSEDE_CONFLICT`. The new row must have the same scope as the old row, or the call fails with `OB_VALIDATION`. Tests: one test for each of the three codes; a different scope fails; a superseded row is absent from the text list and from the vector list.
- Token verifier checks (task U1). The 6 checks are: the token is present in the `Authorization` header (a token in the query string is rejected); the algorithm is in an allowlist of asymmetric algorithms (`none` and `HS256` are rejected); the signature is valid for the key set; the issuer and the audience match (the audience can be a string or an array); the token is not expired, with a clock tolerance of 30 seconds; the subject is the permitted subject. Only a network failure or a timeout of the key fetch gives `500`. An unknown key id or a bad signature gives `401`. Tests: `alg: none`, `HS256` signed with the public key, an unknown `kid` (each `401`), a key fetch that fails on the network (`500`), and a token in the query string (rejected).
- Limits before the sign-in (task U2). On the public door, the token check runs before the JSON body parser. A second limit of 600 requests each minute runs before the token check. The body limit stays 100 kb. `express-rate-limit` gets `validate: { xForwardedForHeader: false }`, because the tunnel adds that header. Tests: request 601 with no token gets `429`; a body of 200 kb gets `413`.
- Stateless transport tests (task H1a). Tests: 10 parallel `tools/call` requests on one door all succeed; `GET /mcp` and `DELETE /mcp` get `405`; a `POST` with `Content-Type: text/plain` is rejected. No door adds CORS headers.
- Test database guard (task P1). With `OPEN_BRAIN_TEST=1`, `src/db.ts` uses `TEST_DATABASE_URL` only, and throws if it is absent or equal to `DATABASE_URL`. The helper refuses a database name that does not end in `_test`. No test file imports `dotenv`. Tests: equal values throw; a name with no `_test` suffix throws.
- Secret scan before the push (task P9). The scan also runs as a `pre-push` hook, and `AGENTS.md` documents how to install it. The patterns are `*.ts.net` names, addresses in `100.64.0.0/10` and strings that start with `eyJ`. The test makes its planted JWT at run time, so the scan does not flag its own fixture.
- Restore in Phase 1 (owner task). Phase 1 gets the acceptance criterion "One restore of a dump into a scratch container succeeds, and the row count agrees." The Phase 3 restore criterion stays. Dump files have mode `600`, and the dump directory is in `.dockerignore`.
- Shutdown (task H1a). A `SIGTERM` handler closes the listeners and calls `closePool()`. Test: the handler resolves and the pool is closed.
- Small rules (tasks named in each item). The request log writes a tool name only if it is in the profile, else `"unknown"`, and cuts a rejected host name at 255 characters (H1c). The `public:` prefix rule of the private door ignores case and outer spaces; tests: `Public:x` and ` public:x` fail (P8). The GIN index serves the full-text match only; the substring match reads the table in sequence, which is acceptable at this size (P7). A degraded search with no part token and no word token returns the line "No searchable word in the query." (P7). The configuration check returns its problem list, and only `src/index.ts` calls `process.exit`; `createDoorApp` takes an injected log function, and each test closes its listener (H1b, H1c). The CI workflow has `permissions: contents: read`, pinned actions and no repository secret (P1). The "Breaking change" note also names `engines >=22` (P5). The README notes that the 8192 limit counts UTF-16 units and that Ollama can cut a long text earlier (H4).
- Private door access (owner task, Phase 1). The private door has no sign-in: each device on the tailnet can use the 5 tools. The owner accepts this risk and adds a Tailscale ACL that permits port 8787 only from the owner's devices.
<!-- /autoplan-accepted:eng -->

<!-- autoplan-baseline-edits:eng {"sourceSha256":"1892ae2955cda7540bff6aa47686c735c1f5dcce65f528ca41f98e3eb0c54523","replacements":[{"oldText":"## Tasks\n\nEach row is one commit.\n\n### Track P: no dependency on the spikes\n\n| ID | Task | Files | Depends on | Tests in the same commit |\n|---|---|---|---|---|\n| P9 | Add ignore rules, new `.env.example` names and the secret scan. | `.gitignore`, `.env.example`, `scripts/check-no-secrets.mjs` | none | The scan passes on the current tree. |\n| P1 | Add the test runner, the database helper and the workflow. The helper requires `OPEN_BRAIN_TEST=1` and `TEST_DATABASE_URL`, and stops if one is absent. | `package.json`, `test/helpers/db.ts`, `.github/workflows/ci.yml`, `src/db.ts` | none | One smoke test: the helper applies `schema-ollama.sql`, and `brain_stats` returns zero. |\n| P2 | Move the 5 handlers to `src/tools.ts` with no change of behavior. Stdio stays the default mode. | `src/tools.ts`, `src/index.ts` | P1 | Tool set: 5, 3 and 4 tools for the three sets, through `InMemoryTransport`. |\n| P3 | Add the provider resolver, the stub and the model name. Reject an unknown provider value. | `src/embeddings.ts`, `scripts/test-env.mjs`, `scripts/init-db.mjs` | P1 | The stub gives 768 values, is the same for the same text, and is not a zero vector. An unknown value gives an error. |\n| P4 | Write the migration. | `migrations/001-scope-hybrid.sql`, `test/helpers/db.ts` | P1 | A second run gives no error and no change. A row with `scope = 'garden'` is rejected. |\n| P5 | Add `scope` and `embedding_model` to insert, list and vector search. Add the required `scope` and the guidance line to the tools. | `src/db.ts`, `src/tools.ts`, `scripts/test-save.mjs` | P2, P3, P4 | The 5 scope cases of the design. A stub row records `embedding_model = 'stub'`. |\n| P6 | Add the token functions and the merge function. | `src/search.ts` | P1 | Token examples of the design, the apostrophe case, the empty case, the 3-character minimum, the fusion order. No database. |\n| P7 | Add the text list and the merge to `searchThoughts`, with `max(20, limit)`. | `src/db.ts`, `src/tools.ts` | P5, P6 | The 3 part-number cases, each with 3 competitor rows. The `%` and `_` escape case. |\n| P8 | Add `supersedes` with one transaction. Add the strict public capture schema. | `src/db.ts`, `src/tools.ts` | P5 | The old row is invalid and linked. A failed insert leaves the old row valid. A bad id gives an error. A public call with `supersedes` stores no row. |\n\n### Phase 0a and 0b: spike code (branch not merged)\n\n| ID | Task | Files | Depends on |\n|---|---|---|---|\n| S0a | Write a throwaway HTTP server with only `brain_stats` and no database. Log each request path and each header name. | one spike file | none |\n| S0b | Write the first `src/auth.ts`: verifier with an injected key source, subject check, metadata route. Put it on the spike server. | `src/auth.ts`, `test/auth.test.ts` | S0a, P1 |\n\nTests for S0b: the 6 checks with tokens that the test signs with `jose`. The key pair is made at run time, so no token is in git.\n\n### Phase 1: private door\n\n| ID | Task | Files | Depends on | Tests |\n|---|---|---|---|---|\n| H1 | Add `createDoorApp` and the HTTP mode, with a list of permitted host names. Add the stub guard for the HTTP modes. | `src/http.ts`, `src/index.ts` | P2, P3, result of S0a | An HTTP client lists 5 tools on port 0. The HTTP mode with the stub and no test flag refuses to start. |\n| H2 | Add the Dockerfile and the Compose file. | `Dockerfile`, `.dockerignore`, `compose.yaml` | H1 | `docker compose config` fails when `TAILNET_IP` is empty. Check by hand. |\n| H3 | Add the unit example and the backup example. | `deploy/*` | H2 | The secret scan passes. |\n| H4 | Update the README and `AGENTS.md`. | `README.md`, `AGENTS.md` | H1 to H3 | none |\n\n### Phase 2: public door, read-only\n\n| ID | Task | Files | Depends on | Tests |\n|---|---|---|---|---|\n| U1 | Add `src/auth.ts` and `test/auth.test.ts` in the form that Phase 0b proved. | `src/auth.ts`, `test/auth.test.ts` | recorded 0b result | The 6 checks. |\n| U2 | Start the public door with the 3 read tools. Refuse to start if an OAuth value is absent. | `src/http.ts`, `src/index.ts`, `compose.yaml`, `package.json` | U1, H1 | A `401` has `WWW-Authenticate`. The metadata route answers with no token. Wrong subject gets `403`. The tool list has 3 tools. |\n| U3 | Add the probe script. | `scripts/probe-public-door.mjs` | U2 | Run against a local door with tokens that a test signs. |\n\n### Phase 3: public capture\n\n| ID | Task | Files | Depends on | Tests |\n|---|---|---|---|---|\n| C1 | Change the public tool-set constant to the 4-tool set. This is the only change of C1. | `src/tools.ts` | probe passed, restore passed | The public list has 4 tools. `capture_thought` has no `supersedes`. `invalidate_thought` is absent. |\n\n","newText":"## Tasks\n\nEach row is one commit. Each row holds the requirements that name its task in the three requirement lists after \"First commits\". The lists have the full text and the tests of each requirement. The \"Tests\" column here names the main tests only.\n\n### Track P: no dependency on the spikes\n\n| ID | Task | Files | Depends on | Tests in the same commit |\n|---|---|---|---|---|\n| P9 | Add ignore rules, the `.env.example` names with one comment line each, the secret scan (output rules, allow file, `pre-push` hook) and the correct `repository.url`. | `.gitignore`, `.env.example`, `scripts/check-no-secrets.mjs`, `package.json`, `AGENTS.md` | none | The scan passes on the current tree. A JWT string that the test makes at run time is found and is not printed. |\n| P1 | Add the test runner with `--test-concurrency=1`, the database helper with its guard, `closePool()`, the pool timeouts, `npm run test:db:up`, the workflow and `engines >=22`. | `package.json`, `test/helpers/db.ts`, `.github/workflows/ci.yml`, `src/db.ts` | none | One smoke test: the helper prepares the schema, and `brain_stats` returns zero. The guard throws for equal database addresses. The pure tests run with no database. |\n| P2a | Move the 5 handlers to `src/tools.ts` with no change of behavior. Stdio stays the default mode. | `src/tools.ts`, `src/index.ts` | P1 | The 5 tools are listed through `InMemoryTransport`, and each one answers as before. |\n| P2b | Prove strict schemas on the SDK. Add the door profiles, strict schemas, the one error wrapper with the `ctx` parameter, the `OB_` codes, the redaction rule and `docs/errors.md`. | `src/tools.ts`, `docs/errors.md` | P2a | Tool sets of 5, 3 and 4 tools. A misspelled key fails and stores no row. A call of a tool that is not in the profile fails. A failed `CHECK` does not put row content into stderr. |\n| P3 | Add the provider resolver, the stub, the model name, the embedding timeout and the embedding error text. Reject an unknown provider value. | `src/embeddings.ts`, `scripts/test-env.mjs`, `scripts/init-db.mjs` | P1 | The stub gives 768 values, is the same for the same text, and is not a zero vector. An unknown value gives an error. An embedder that never resolves times out. |\n| P4 | Write the migration, `npm run migrate` and the schema check function. | `migrations/001-scope-hybrid.sql`, `scripts/migrate.mjs`, `src/db.ts`, `test/helpers/db.ts`, `package.json` | P1 | A second run gives no error and no change. A row with `scope = 'garden'` is rejected. The migration on a database that has rows sets `scope` and `embedding_model`. |\n| P5 | Add `scope`, `embedding_model`, the scope list of the profile, the validation messages, the length limits, the scope in the output, the stats by scope and the model filter. Add the \"Breaking change\" note and `CHANGELOG.md`. | `src/db.ts`, `src/tools.ts`, `scripts/test-save.mjs`, `README.md`, `CHANGELOG.md` | P2b, P3, P4 | The scope cases of the design. The public profile returns no `work` row. The public `brain_stats` counts 2 of 3 rows. A call with no `scope` returns the custom text. |\n| P6 | Add the token functions and the merge function. | `src/search.ts` | P1 | Token examples of the design, the apostrophe case, the empty case, the 3-character minimum, the fusion order. No database. |\n| P7 | Add the text list and the merge to `searchThoughts`, with `max(20, limit)`, the exact vector scan and the degraded search. | `src/db.ts`, `src/tools.ts` | P5, P6 | The 3 part-number cases, each with 3 competitor rows. The `%` and `_` escape case. 200 `work` rows and 3 `house` rows: a `house` search returns the 3 rows. The degraded search returns the text matches. |\n| P8 | Add `supersedes` with the read, the insert and the guarded update in one transaction. Add the source prefix rules. | `src/db.ts`, `src/tools.ts` | P5 | One test for each of the three supersede codes. Two parallel captures give one success. A superseded row is absent from the two lists. `public:unknown` is stored for a public capture with no `source`. |\n\n### Phase 0a and 0b: spike code (branch not merged)\n\n| ID | Task | Files | Depends on |\n|---|---|---|---|\n| S0a | Write a throwaway HTTP server with only `brain_stats` and no database. Log each request path and each header name. Run it before pull request 2 starts. | one spike file | none |\n| S0b | Write the first `src/auth.ts`: verifier with an injected key source, subject check, metadata route. Put it on the spike server. Run it before pull request 3 starts. | `src/auth.ts`, `test/auth.test.ts` | S0a, P1 |\n\nTests for S0b: the 6 checks with tokens that the test signs with `jose`. The key pair is made at run time, so no token is in git.\n\n### Phase 1: private door\n\n| ID | Task | Files | Depends on | Tests |\n|---|---|---|---|---|\n| H1a | Add `createDoorApp` for one profile, the HTTP mode, one server and one `ctx` for each request, the required host list, the `400` for a batch, `/healthz` and the shutdown handler. | `src/http.ts`, `src/index.ts` | P2b, P3, result of S0a | An HTTP client lists 5 tools on port 0. 10 parallel calls succeed. A wrong `Host` header is rejected. `GET /mcp` gets `405`. A batch gets `400`. |\n| H1b | Add the configuration check, the schema check at start with its retry, the start line with the model count and the stub guard. | `src/config.ts`, `src/index.ts` | H1a, P4 | Two absent variables give two problems and exit code 78. An old schema gives `OB_SCHEMA_OLD`. A database that is down gives `OB_DB_UNAVAILABLE`. The names in `.env.example` agree with the check. |\n| H1c | Add the request log with `request_id`, `error_code` and `degraded`, and `/readyz`. | `src/http.ts` | H1a | The log line of a capture has the tool name and no content. `/readyz` gives `503` and the failed check when the embedder throws. |\n| H2 | Add the Dockerfile and the Compose file with the two published ports, the Postgres health check, log rotation and `init: true`. | `Dockerfile`, `.dockerignore`, `compose.yaml` | H1c | `docker compose config` fails when `TAILNET_IP` is empty. The first run order works on an empty volume. Checks by hand. |\n| H3 | Add the unit example (the one supervisor at boot) and the backup example. | `deploy/*` | H2 | The secret scan passes. |\n| H4 | Update the README (first five minutes, client blocks, runbooks, deploy order, tests) and `AGENTS.md`. | `README.md`, `AGENTS.md` | H1a to H3, result of Phase 0a | The secret scan passes on the README. |\n\n### Phase 2: public door, read-only\n\n| ID | Task | Files | Depends on | Tests |\n|---|---|---|---|---|\n| U1 | Add `src/auth.ts` and `test/auth.test.ts` in the form that Phase 0b proved: the verifier with its 6 checks, the key error rule, the subject check and the metadata route. | `src/auth.ts`, `test/auth.test.ts` | recorded 0b result | The 6 checks. `alg: none`, `HS256` and an unknown `kid` get `401`. A key fetch that fails on the network gets `500`. |\n| U2 | Start the public door with the `PUBLIC_READ` profile: token check before the body parser, the two limits, the error bodies, the public error text and the \"Scopes searched\" line. Refuse to start if an OAuth value is absent. | `src/http.ts`, `src/index.ts`, `compose.yaml`, `package.json` | U1, H1c | A `401` has `WWW-Authenticate`. The metadata route answers with no token. A wrong subject gets `403`. The tool list has 3 tools. A call of `invalidate_thought` or `capture_thought` by name fails and changes no row. |\n| U3 | Add the probe script: the 5 token cases, and the calls of the hidden tools with a valid token. | `scripts/probe-public-door.mjs` | U2 | Run against a local door with tokens that a test signs. The output has no token. |\n\n### Phase 3: public capture\n\n| ID | Task | Files | Depends on | Tests |\n|---|---|---|---|---|\n| C1 | Change the profile of the public door from `PUBLIC_READ` to `PUBLIC_CAPTURE`. This is the only change of C1. | `src/index.ts` | probe passed, restore passed | The public list has 4 tools. `capture_thought` has no `supersedes`. A call of `invalidate_thought` by name fails. |\n\n"},{"oldText":"| A3 | CI and the Docker image use Node 22. The `engines` field stays `>=18`. |","newText":"| A3 | CI and the Docker image use Node 22. The `engines` field becomes `>=22`. |"},{"oldText":"| The public `capture_thought` schema uses `.strict()`. A test proves the rejection. |","newText":"| Each tool schema is strict (task P2b). A test proves the rejection. |"},{"oldText":"| Do not use it for the migration or in CI. |","newText":"| `npm run migrate` applies the schema and the migrations (task P4). |"},{"oldText":"| `src/tools.ts` (new) | `registerTools(server, { tools, allowSupersede, sourcePrefix })` and the tool-set constants. |","newText":"| `src/tools.ts` (new) | `registerTools(server, profile, ctx)`, the door profiles and the one error wrapper. |\n| `src/config.ts` (new) | The configuration check. It returns a problem list. |\n| `scripts/migrate.mjs` (new) | Applies `schema-ollama.sql` and each migration. |\n| `docs/errors.md`, `CHANGELOG.md` (new) | One anchor for each `OB_` code; the breaking changes. |"},{"oldText":"| 1 | Approve and run `schema-ollama.sql`, then `migrations/001-scope-hybrid.sql`, with `psql` in the Postgres container. Do not run `npm run init-db`. |\n| 1 | Write `.env`. Run `docker compose up -d --build`. Pull the `nomic-embed-text` model. |","newText":"| 1 | Write `.env`. Run `docker compose up -d postgres`. Approve and run `docker compose run --rm open_brain npm run migrate`. Run `docker compose up -d --build`. Pull the `nomic-embed-text` model. |\n| 1 | Add a Tailscale ACL that permits port 8787 only from the owner's devices. |\n| 1 | Restore one dump into a scratch container. Measure one time the time from `git clone` to the first search in a second client. |\n| 1 | After 14 days of use, record the count of facts and decide if Phase 2 starts. |"},{"oldText":"4. All 5 tools work from Claude Code and from Claude Desktop.\n","newText":"4. All 5 tools work from Claude Code and from Claude Desktop, and one client that is not a Claude client (Cursor) lists the 5 tools and completes one search.\n"},{"oldText":"7. A second run of the migration gives no error.\n","newText":"7. A second run of the migration gives no error.\n8. A request to port 8788 on the LAN address gets no connection.\n9. One restore of a dump into a scratch container succeeds, and the row count agrees.\n10. `/readyz` on the private door answers `ready`.\n"},{"oldText":"**Phase 2**\n1. The probe passes its 5 cases","newText":"**Phase 2**\n0. The owner recorded the use check and decided to continue.\n1. The probe passes its 5 cases"},{"oldText":"6. After a restart of the home server, the private door answers with no manual work.","newText":"6. After a power cycle of the home server, the private door answers with no manual work."},{"oldText":"| 2 | `feat/scope-and-hybrid-search` | P2, P3, P4, P5, P6, P7, P8 |","newText":"| 2 | `feat/scope-and-hybrid-search` | P2a, P2b, P3, P4, P5, P6, P7, P8 |"},{"oldText":"| 3 | `feat/private-door` | H1, H2, H3, H4 |","newText":"| 3 | `feat/private-door` | H1a, H1b, H1c, H2, H3, H4 |"},{"oldText":"Each task stays one commit, in the order of the task tables.","newText":"Each task stays one commit, in the order of the task tables.\n\n## Requirements\n\nThe three lists below hold the full text and the tests of each requirement that the reviews added. The task tables name the task of each one. Where an earlier item and a later item disagree, the later item applies."}]} -->

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | Mode SELECTIVE EXPANSION, keep the approved scope | Mechanical | P6 | /autoplan sets the mode; the owner approved the scope in the design | SCOPE REDUCTION by file count |
| 2 | CEO | Accept premises P-11 to P-14 as unverified with a phase that settles each | Mechanical | P6 | Each has a cheap check in Phase 0a, 0b or 1 | Stop the plan until they are verified |
| 3 | CEO | E1 health route: accept | Mechanical | P2 | One file, needed by the reboot and tunnel checks | No health route |
| 4 | CEO | E2 request log line: accept | Mechanical | P1 | No other way to debug a failed phone call | Console errors only |
| 5 | CEO | E3 `public:` source prefix: accept | Mechanical | P1 | Recovery path after a sign-in mistake | No marker on public rows |
| 6 | CEO | E4 8192-character limit: accept | Mechanical | P1 | The embedding already cuts at 8192 (`src/embeddings.ts:58`) | No limit |
| 7 | CEO | E5 scope in the output: accept | Mechanical | P2 | One line, same file | No change |
| 8 | CEO | E6 static header check in Phase 0b: accept | Mechanical | P3 | One line in the record, can remove much sign-in work | Do not check |
| 9 | CEO | E7 rate limit on the public door: accept | Taste | P1 | Public endpoint; adds one direct dependency | Depend on the tunnel provider for limits |
| 10 | CEO | E8 four pull requests in place of 10 branches: accept | Taste | P3, P6 | One owner, no reviewer | 10 branches as planned |
| 11 | CEO | E9 export tool: defer | Mechanical | P3 | Outside the blast radius; `pg_dump` covers it | Add now |
| 12 | CEO | E10 self-fill job: defer | Mechanical | P3 | The design puts it in "Later" | Add now |
| 13 | CEO | E11 family access: skip | Mechanical | P4 | The owner ruled it out | Add now |
| 14 | CEO | Spec review loop: fix 7 reported issues, stop at 3 launches | Mechanical | P1 | Each fix is in the accepted block | A fourth review |
| 15 | CEO | F1 use check before Phase 2: accept | Taste | P1 | No code; guards against a large build with no use | No stop rule |
| 16 | CEO | F2 phone capture earlier: decline | Mechanical | P6 | The owner decided read-only first | Move C1 into Phase 2 |
| 17 | CEO | F3 second vendor check: accept | Mechanical | P1 | One more client in an existing check | Claude clients only |
| 18 | CEO | F4 scope list for each door: accept | Taste | P1 | One sign-in mistake must not show work notes | All scopes on the public door |
| 19 | CEO | F5 default scope on capture: decline | Mechanical | P6 | The owner approved the required scope | Default `general` |
| 20 | CEO | F6 public fork: no change, note for the gate | Mechanical | P6 | The owner made the fork | Private copy |
| 21 | CEO | F7 external monitor and restore drill: defer | Mechanical | P3 | Needs a service outside the home network | Add now |
| 22 | CEO | F9 spike order and result table: accept | Mechanical | P1 | Settles the four largest risks first | No order rule |
| 23 | CEO | A1 degraded search when the embedder fails: accept | Mechanical | P1 | The text list needs no embedding | Fail the search |
| 24 | CEO | E-1 generic error text on the public door: accept | Mechanical | P1 | A raw message can contain an internal address | Raw message |
| 25 | CEO | E-2 key fetch failure gives 500: accept | Mechanical | P5 | A 401 starts a sign-in loop | 401 |
| 26 | CEO | Parallel supersede test and minimum length of 1: accept | Mechanical | P1 | Two unhandled edge cases | No test |
| 27 | CEO | Q-1 one error wrapper in registerTools: accept | Mechanical | P4 | Five copies of one block | Move with no change |
| 28 | CEO | O-1 start line, O-2 and D-1 README runbook: accept | Mechanical | P1 | No other way to see the configuration or the deploy order | No runbook |
| 29 | DX | Mode DX POLISH; persona inferred; target 10 minutes and 5 commands | Mechanical | P5, P6 | /autoplan sets the mode; the Competitive tier is not possible with a model download | Competitive tier |
| 30 | DX | CAP4 strict schemas on each door: accept | Mechanical | P1 | A misspelled key is stored as success today | Strict only on the public capture |
| 31 | DX | Configuration table and one check at start with exit code 78: accept | Mechanical | P1 | No variable had a name; a refusal had no text | Refuse with no message |
| 32 | DX | `npm run migrate` and a schema check at start: accept | Taste | P5 | One command in place of two `psql` runs; the owner still runs it | `psql` by hand |
| 33 | DX | `/readyz` on the private door: accept | Mechanical | P1 | `/healthz` says ok when the schema or the model is absent | Liveness only |
| 34 | DX | OB_ error codes, texts, request id, redaction: accept | Mechanical | P1 | The agent-ready error contract is required by the DX rules | Raw messages |
| 35 | DX | Custom validation messages and the breaking change note: accept | Mechanical | P1 | The required scope breaks each client with a raw message | Raw Zod text |
| 36 | DX | Test loop: concurrency 1, helper only in database tests, test:db:up, engines >=22: accept | Mechanical | P5 | The database tests can collide; the pure tests must run alone | Parallel test files |
| 37 | DX | README in the same commit, client blocks, runbooks, CHANGELOG: accept | Mechanical | P1 | The docs were one pull request behind the behavior | Docs in H4 only |
| 38 | DX | `public:unknown` and the "Scopes searched" line: accept | Mechanical | P5 | A bare prefix and a silent scope limit are not clear | Bare `public:` |
| 39 | DX | Model pull service in Compose, contributing guide, telemetry: not in scope | Mechanical | P3 | The README command and the error text cover the need | Add now |
| 40 | Eng | Scope accepted as-is; module arrangement kept, switches become one profile object | Mechanical | P2, P5 | Never reduce scope; a profile can not hold a wrong combination | Five separate switches |
| 41 | Eng | H-7 rewrite the task tables; split P2 and H1 | Mechanical | P5 | The tables and the lists disagreed | Two layers |
| 42 | Eng | H-1 one first-run order, migrate in the container | Mechanical | P1 | The first start failed by design | Host `npm run migrate` |
| 43 | Eng | H-2 the systemd unit is the one supervisor at boot; power cycle check | Mechanical | P5 | Two supervisors with no rule | Compose restart only |
| 44 | Eng | H-3 tests that call a hidden tool by name; H-4 public port on loopback and Host test | Mechanical | P1 | A list filter alone is not proof | List tests only |
| 45 | Eng | H-5 exact vector scan with the scope filter | Mechanical | P5 | The index applies the filter after its scan | Index scan with a larger ef_search |
| 46 | Eng | H-6 request context as a parameter; batch gets 400 | Mechanical | P5 | No hidden store between layers | AsyncLocalStorage |
| 47 | Eng | M-1 to M-14: accept each (code suffix, strict proof, timeouts, start retry, supersede method, verifier checks, pre-auth limit, model filter, stats by scope, restore in Phase 1, test guard, transport tests, pre-push scan, stdio schema check) | Mechanical | P1 | Each one is in the blast radius and small | Leave for the build |
| 48 | Eng | L-1, L-3 to L-9: accept as plan text; L-2: recorded risk and an ACL owner task | Mechanical | P1, P3 | Small and in the files that the plan changes | Ignore |
| 49 | Eng | Remove `embedding::text` from the list and search queries | Mechanical | P3 | About 8 kB for each row that no tool shows | Keep |
| 50 | Eng | No shared database helper | Mechanical | P5 | No net saving for 5 small functions | Extract a helper |
| 51 | Eng | Iterative-scan vector index: defer to TODOS.md | Mechanical | P3 | Not necessary at this size | Add now |
