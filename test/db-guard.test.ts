// Pure tests for the test database guard. They need no database:
// each guard throws before a connection is made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDatabaseUrl, describeTestDatabase, getBrainStats, closePool } from "../src/db.js";
import { dbTestOptions, prepareTestDatabase } from "./helpers/db.js";

const REAL = "postgresql://u:p@db.example:5432/brain";
const TEST = "postgresql://u:p@localhost:54329/open_brain_test";

test("normal mode uses DATABASE_URL", () => {
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: REAL }), REAL);
});

test("normal mode with no DATABASE_URL throws", () => {
  assert.throws(() => resolveDatabaseUrl({}), /DATABASE_URL is required/);
});

test("test mode uses TEST_DATABASE_URL only", () => {
  assert.equal(
    resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", DATABASE_URL: REAL, TEST_DATABASE_URL: TEST }),
    TEST,
  );
});

test("test mode with no TEST_DATABASE_URL throws, and does not fall back to DATABASE_URL", () => {
  assert.throws(
    () => resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", DATABASE_URL: REAL }),
    /needs TEST_DATABASE_URL/,
  );
});

test("test mode throws when the two URLs are equal", () => {
  assert.throws(
    () => resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", DATABASE_URL: TEST, TEST_DATABASE_URL: TEST }),
    /same database/,
  );
});

test("test mode throws when the two URLs name the same database in different forms", () => {
  // Another scheme, another name for this machine, another password, a query parameter.
  const sameDbOtherForm = "postgres://other:secret@127.0.0.1:54329/open_brain_test?sslmode=disable";
  assert.throws(
    () => resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", DATABASE_URL: TEST, TEST_DATABASE_URL: sameDbOtherForm }),
    /same database/,
  );
});

test("a different port or name is a different database", () => {
  const otherPort = "postgresql://u:p@localhost:5433/open_brain_test";
  assert.equal(
    resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", DATABASE_URL: TEST, TEST_DATABASE_URL: otherPort }),
    otherPort,
  );
  const otherName = "postgresql://u:p@localhost:54329/other_test";
  assert.equal(
    resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", DATABASE_URL: TEST, TEST_DATABASE_URL: otherName }),
    otherName,
  );
});

test("test mode refuses a database name with no _test suffix", () => {
  assert.throws(
    () => resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", TEST_DATABASE_URL: REAL }),
    /must end in _test/,
  );
});

test("test mode refuses URL forms where pg can read another database", () => {
  const refused: Array<[string, RegExp]> = [
    ["socket:/var/run/postgresql?db=brain", /postgres:\/\/ or postgresql:\/\//],
    ["postgresql://u:p@localhost:54329/open_brain_test?host=db.example", /"host"/],
    ["postgresql://u:p@localhost:54329/open_brain_test?dbname=brain", /"dbname"/],
    ["postgresql://u:p@localhost:54329/open%5Fbrain_test", /encoded characters/],
    ["not a url", /not a valid URL/],
  ];
  for (const [url, message] of refused) {
    assert.throws(() => describeTestDatabase(url), message, url);
  }
});

test("another address for this machine counts as the same database", () => {
  const alias = "postgresql://u:p@127.0.0.2:54329/open_brain_test";
  assert.throws(
    () => resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", DATABASE_URL: TEST, TEST_DATABASE_URL: alias }),
    /same database/,
  );
});

test("test mode refuses a test URL with no host or no port", () => {
  assert.throws(() => describeTestDatabase("postgresql://u:p@localhost/open_brain_test"), /host and the port/);
  assert.throws(() => describeTestDatabase("postgresql:///open_brain_test"), /host and the port/);
});

test("test mode refuses a DATABASE_URL with a host, port or database query parameter", () => {
  for (const name of ["host", "port", "dbname"]) {
    assert.throws(
      () =>
        resolveDatabaseUrl({
          OPEN_BRAIN_TEST: "1",
          DATABASE_URL: `postgresql://u:p@db.example:5432/brain?${name}=x`,
          TEST_DATABASE_URL: TEST,
        }),
      new RegExp(`DATABASE_URL sets "${name}"`),
    );
  }
});

test("test mode refuses a DATABASE_URL that can not be read", () => {
  assert.throws(
    () => resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", DATABASE_URL: "not a url", TEST_DATABASE_URL: TEST }),
    /DATABASE_URL can not be read/,
  );
});

test("test mode refuses an encoded test host", () => {
  // The URL parser keeps "%2Ftmp" as the host, so this reaches the host check.
  assert.throws(() => describeTestDatabase("postgres://u:p@%2Ftmp:5432/open_brain_test"), /host must not contain encoded/);
});

test("PGHOST and PGPORT fill a DATABASE_URL with no host or port, as pg does", () => {
  const noHost = "postgresql:///open_brain_test";
  const test = "postgresql://u:p@localhost:5432/open_brain_test";
  // PGHOST names another server, so the two URLs name different databases.
  assert.equal(
    resolveDatabaseUrl({ OPEN_BRAIN_TEST: "1", DATABASE_URL: noHost, PGHOST: "db.example", TEST_DATABASE_URL: test }),
    test,
  );
  // PGPORT names the same port as the test URL on this machine, so they are the same.
  assert.throws(
    () =>
      resolveDatabaseUrl({
        OPEN_BRAIN_TEST: "1",
        DATABASE_URL: noHost,
        PGPORT: "54329",
        TEST_DATABASE_URL: "postgresql://u:p@[::1]:54329/open_brain_test",
      }),
    /same database/,
  );
});

test("upper case and a trailing dot do not hide the same host", () => {
  assert.throws(
    () =>
      resolveDatabaseUrl({
        OPEN_BRAIN_TEST: "1",
        DATABASE_URL: "postgresql://u:p@DB.Example.:5432/x_test",
        TEST_DATABASE_URL: "postgresql://u:p@db.example:5432/x_test",
      }),
    /same database/,
  );
});

test("getPool refuses a changed URL until closePool runs", async (t) => {
  const saved = process.env.TEST_DATABASE_URL;
  t.after(async () => {
    if (saved === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = saved;
    await closePool();
  });
  // Port 1 has no server, so each query fails with a connection error.
  // The first call makes the pool.
  process.env.TEST_DATABASE_URL = "postgresql://u:p@localhost:1/a_test";
  await assert.rejects(getBrainStats(), (e: Error) => !/URL changed/.test(e.message));
  // A different URL: the old pool must not be used.
  process.env.TEST_DATABASE_URL = "postgresql://u:p@localhost:2/a_test";
  await assert.rejects(getBrainStats(), /URL changed/);
  // After closePool, a new pool with the new URL is made.
  await closePool();
  await assert.rejects(getBrainStats(), (e: Error) => !/URL changed/.test(e.message));
});

test("a DATABASE_URL with no host or port uses the pg defaults in the comparison", () => {
  // pg would connect to localhost:5432 for both, so they are the same database.
  assert.throws(
    () =>
      resolveDatabaseUrl({
        OPEN_BRAIN_TEST: "1",
        DATABASE_URL: "postgresql:///open_brain_test",
        TEST_DATABASE_URL: "postgresql://u:p@localhost:5432/open_brain_test",
      }),
    /same database/,
  );
});

test("the helper refuses before it connects when the two URLs name the same database", async () => {
  // Port 1 has no server. A connection attempt would fail with another error,
  // so this message proves that the guard ran first.
  const url = "postgresql://u:p@localhost:1/open_brain_test";
  await assert.rejects(
    prepareTestDatabase({ DATABASE_URL: url, TEST_DATABASE_URL: url }),
    /same database/,
  );
});

test("the helper refuses before it connects when the name has no _test suffix", async () => {
  await assert.rejects(
    prepareTestDatabase({ TEST_DATABASE_URL: "postgresql://u:p@localhost:1/brain" }),
    /must end in _test/,
  );
});

test("npm test loads test/setup.mjs, which turns on test mode", () => {
  // This file imports the helper, which also sets the flag, so the check runs
  // in a separate process with no flag in its environment.
  const root = join(import.meta.dirname, "..");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts.test, /--import \.\/test\/setup\.mjs/);
  const env = { ...process.env };
  delete env.OPEN_BRAIN_TEST;
  const r = spawnSync(process.execPath, ["--import", "./test/setup.mjs", "-e", "console.log(process.env.OPEN_BRAIN_TEST)"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.equal(r.stdout.trim(), "1");
});

test("database tests skip on a developer machine with no TEST_DATABASE_URL", () => {
  assert.notEqual(dbTestOptions({}).skip, false);
  // CI=false is not CI.
  assert.notEqual(dbTestOptions({ CI: "false" }).skip, false);
});

test("database tests do not skip in CI, so a missing database fails the run", () => {
  assert.equal(dbTestOptions({ CI: "true" }).skip, false);
  assert.equal(dbTestOptions({ GITHUB_ACTIONS: "true" }).skip, false);
  assert.equal(dbTestOptions({ TEST_DATABASE_URL: TEST }).skip, false);
});
