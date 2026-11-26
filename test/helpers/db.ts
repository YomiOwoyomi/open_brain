// Database helper for the database tests.
//
// Only database test files import this helper. The pure tests (for example the
// secret scan and the database guard tests) do not, so they run with no database.
//
// Safety rules:
//   1. The helper turns on test mode (OPEN_BRAIN_TEST=1) when it loads, before
//      any test can call src/db.ts. In test mode, src/db.ts uses
//      TEST_DATABASE_URL only.
//   2. The helper gets its URL from resolveDatabaseUrl() in src/db.ts, so the
//      same guards protect the schema step and the TRUNCATE: the name must end
//      in "_test", and it must not be the database of DATABASE_URL.
//   3. No test file imports dotenv, so a local .env is never read by a test.
import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDatabaseUrl } from "../../src/db.js";

// Rule 1: turn on test mode at load time.
process.env.OPEN_BRAIN_TEST = "1";

/** The repository root, one folder above test/. */
const ROOT = join(import.meta.dirname, "..", "..");

/**
 * The skip option for a database test.
 *
 * - TEST_DATABASE_URL is set: run the test.
 * - TEST_DATABASE_URL is absent on a developer machine: skip the test, so
 *   `npm test` still runs the pure tests.
 * - TEST_DATABASE_URL is absent in CI: do not skip. The test then fails in
 *   prepareTestDatabase(), so CI can not pass with no database tests.
 */
export function dbTestOptions(env: NodeJS.ProcessEnv = process.env): { skip: string | false } {
  if (env.TEST_DATABASE_URL?.trim()) return { skip: false };
  // Only an exact "true" counts, so CI=false or CI=0 does not turn off the skip by mistake.
  if (env.CI === "true" || env.GITHUB_ACTIONS === "true") return { skip: false };
  return { skip: "TEST_DATABASE_URL is not set (run npm run test:db:up)" };
}

/**
 * Prepare the test database: check the guards, apply the schema, and remove
 * each row. Call it at the start of each database test file.
 * The guards run before any connection is made.
 */
export async function prepareTestDatabase(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  // Rule 2: the same guarded URL that src/db.ts uses. It throws before a connection.
  const url = resolveDatabaseUrl({ ...env, OPEN_BRAIN_TEST: "1" });

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    // The schema file is idempotent (CREATE ... IF NOT EXISTS).
    // A later task replaces this with the migrate script.
    await client.query(readFileSync(join(ROOT, "schema-ollama.sql"), "utf8"));
    await client.query("TRUNCATE thoughts");
  } finally {
    await client.end();
  }
}
