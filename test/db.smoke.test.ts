// Database smoke test. It needs TEST_DATABASE_URL (see npm run test:db:up).
// On a developer machine with no test database, it is skipped.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { dbTestOptions, prepareTestDatabase } from "./helpers/db.js";
import { getBrainStats, closePool } from "../src/db.js";

// Close the pool after the tests, so Node can exit.
after(closePool);

test("the helper prepares the schema, and brain_stats returns zero", dbTestOptions(), async () => {
  // A DATABASE_URL with no server (port 1). In test mode the pool must use
  // TEST_DATABASE_URL, so this test fails if the pool reads DATABASE_URL.
  process.env.DATABASE_URL = "postgresql://u:p@localhost:1/brain";
  await prepareTestDatabase();
  const stats = await getBrainStats();
  assert.deepEqual(stats, { total: 0, last_7_days: 0, last_30_days: 0 });
});
