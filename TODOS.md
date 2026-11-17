# TODOS

Deferred work for the two-door house brain. Source: the `/autoplan` review of `docs/plans/two-door-house-brain-plan.md` on 2026-11-13.

## Export tool or restore script

- **What:** Add a `brain_export` tool, or a script that restores a dump.
- **Why:** A client can then move or copy the brain with no shell access.
- **Pros:** A restore becomes a routine operation.
- **Cons:** One more tool that returns all notes. It needs a scope rule on the public door.
- **Context:** The backup is a nightly `pg_dump`. Phase 1 proves one restore by hand. Start in `src/tools.ts`.
- **Effort:** human M / CC S. **Priority:** P3.
- **Depends on:** Phase 1.

## Nightly self-fill job

- **What:** A nightly job that writes dated facts from the chores app and the recipe server into the brain.
- **Why:** The brain then fills with no manual capture.
- **Pros:** The largest gain in daily value.
- **Cons:** It needs read access to two other systems, and a rule for facts that change.
- **Context:** The design names this as the later phase. `scope`, `source` and `supersedes` are the hooks.
- **Effort:** human L / CC M. **Priority:** P2.
- **Depends on:** Phase 1, and 14 days of real use.

## External monitor and restore drill date

- **What:** A scheduled check from outside the home network that calls `/healthz` on the public door. A date for a regular restore drill.
- **Why:** If the tunnel or the identity provider fails, the owner learns it on the day that the phone search is necessary.
- **Pros:** A silent failure becomes visible.
- **Cons:** It needs a service outside the home network.
- **Context:** `/healthz` on the public door returns only a status. The README runbook "If the phone can not connect" has the checks by hand.
- **Effort:** human S / CC S. **Priority:** P2.
- **Depends on:** Phase 2.

## Duplicate check for a repeated capture

- **What:** Reject or merge a capture that has the same content as a recent row.
- **Why:** A client that tries again after a timeout stores the fact two times.
- **Pros:** Cleaner search results.
- **Cons:** A rule for "the same" is not simple; a wrong rule loses a fact.
- **Context:** No evidence of the problem exists yet. The owner can invalidate one row on the private door.
- **Effort:** human S / CC S. **Priority:** P3.
- **Depends on:** Task P8.

## Trigram index for the substring match

- **What:** Add `pg_trgm` and a trigram index for the `ILIKE` substring match.
- **Why:** The substring match reads the table in sequence.
- **Pros:** Fast part-number search on a large table.
- **Cons:** One more extension in the schema.
- **Context:** Not necessary at some thousands of rows. Measure first.
- **Effort:** human S / CC S. **Priority:** P3.
- **Depends on:** Task P7.

## Approximate vector index with an iterative scan

- **What:** Replace the exact vector scan with the HNSW index and `hnsw.iterative_scan`.
- **Why:** An exact scan becomes slow on a large table.
- **Pros:** Fast vector search at a large size.
- **Cons:** It needs pgvector 0.8 or later, and a test with a small scope in a large table.
- **Context:** Task P7 uses `SET LOCAL enable_indexscan = off` because the index applies the scope filter after its scan. Change this above about 50 000 rows.
- **Effort:** human S / CC S. **Priority:** P3.
- **Depends on:** Task P7.

## Contributing guide

- **What:** A `CONTRIBUTING.md` and issue templates.
- **Why:** Other people can then contribute to the fork.
- **Pros:** Clear process for a contribution.
- **Cons:** No contributor exists today.
- **Context:** The README section "Run the tests" covers the commands.
- **Effort:** human S / CC S. **Priority:** P3.
- **Depends on:** none.
