import pg from "pg";
import pgvector from "pgvector/pg";
import type { Pool } from "pg";

export interface ThoughtRow {
  id: string;
  content: string;
  embedding: number[];
  people: string[];
  topics: string[];
  type: string | null;
  action_items: string[];
  source: string | null;
  created_at: Date;
}

let pool: Pool | null = null;
/** The URL that the current pool uses. getPool() compares it with each call. */
let poolUrl: string | null = null;

/** The parts of a database URL that name one database. */
export interface DatabaseIdentity {
  host: string;
  port: string;
  database: string;
}

/** Host names that all mean "this machine" (the 127.x.x.x range is checked separately). */
const LOCAL_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "[::1]", "host.docker.internal"]);

/** Give each name for "this machine" one form, so two forms of one address compare as equal. */
function normalizeHost(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (LOCAL_HOSTS.has(host) || /^127\./.test(host)) return "localhost";
  return host;
}

/** Query parameters that the pg driver reads to change the host, port, user or database. */
const OVERRIDE_PARAMS = ["host", "hostaddr", "port", "db", "database", "dbname", "user"];

/**
 * Read the host, port and database name from a test database URL.
 *
 * The test guard must check the same database that the pg driver connects
 * to. For that reason the function refuses each URL form where the driver
 * can take the database from a different place than the URL path:
 *   - a protocol other than postgres:// or postgresql:// (for example socket:)
 *   - a query parameter that sets the host, port, user or database
 *   - a "%" in the database name, because two decoders can read it differently
 */
export function describeTestDatabase(url: string): DatabaseIdentity {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must start with postgres:// or postgresql://.");
  }
  for (const name of OVERRIDE_PARAMS) {
    if (parsed.searchParams.has(name)) {
      throw new Error(`TEST_DATABASE_URL must not set "${name}" as a query parameter. Put it in the URL itself.`);
    }
  }
  const rawName = parsed.pathname.replace(/^\//, "");
  if (rawName.includes("%")) {
    throw new Error("The test database name must not contain encoded characters.");
  }
  // With no host or port in the URL, pg reads PGHOST and PGPORT, so the guard
  // could check a different server than the one pg connects to.
  if (!parsed.hostname || !parsed.port) {
    throw new Error("TEST_DATABASE_URL must name the host and the port, for example localhost:54329.");
  }
  // pg reads an encoded host (for example %2Ftmp) as a Unix socket folder.
  if (parsed.hostname.includes("%")) {
    throw new Error("The test database host must not contain encoded characters.");
  }
  return {
    host: normalizeHost(parsed.hostname),
    port: parsed.port,
    database: rawName,
  };
}

/**
 * Read the host, port and database name of DATABASE_URL, to compare it with
 * the test URL. Returns null when DATABASE_URL is not set. Throws when it is
 * set but can not be read, because then the comparison could not protect it.
 */
function describeRealDatabase(env: NodeJS.ProcessEnv): DatabaseIdentity | null {
  const url = env.DATABASE_URL;
  if (!url?.trim()) return null;
  // A query parameter can move pg to another host, port or database, so the
  // comparison below would check the wrong database. Refuse it in test mode.
  let params: URLSearchParams | null = null;
  try {
    params = new URL(url.trim()).searchParams;
  } catch {
    // The parse error is reported below.
  }
  for (const name of OVERRIDE_PARAMS) {
    if (params?.has(name)) {
      throw new Error(
        `DATABASE_URL sets "${name}" as a query parameter, so test mode can not prove that the test database is a different one. Unset DATABASE_URL for the test run.`,
      );
    }
  }
  try {
    const parsed = new URL(url.trim());
    // With no host or port in the URL, pg uses PGHOST and PGPORT, then
    // localhost and 5432. Use the same defaults, so the comparison checks
    // the server that pg would connect to.
    return {
      host: normalizeHost(parsed.hostname || env.PGHOST || "localhost"),
      port: parsed.port || env.PGPORT || "5432",
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    };
  } catch {
    throw new Error(
      "DATABASE_URL can not be read, so test mode can not prove that the test database is a different one. Unset DATABASE_URL for the test run.",
    );
  }
}

/**
 * Select the database URL from the environment.
 *
 * Normal mode: use DATABASE_URL.
 * Test mode (OPEN_BRAIN_TEST=1): use TEST_DATABASE_URL only, and throw unless
 *   1. TEST_DATABASE_URL is set,
 *   2. its database name ends in "_test" (see describeTestDatabase), and
 *   3. it does not name the same database as DATABASE_URL. The check compares
 *      host, port and name, so "localhost" and "127.0.0.1" count as the same.
 * These rules make sure that a test can never change the real database.
 *
 * The function takes the environment as a parameter, so a test can call it
 * with no change to process.env.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPEN_BRAIN_TEST === "1") {
    const testUrl = env.TEST_DATABASE_URL?.trim();
    if (!testUrl) {
      throw new Error("OPEN_BRAIN_TEST=1 needs TEST_DATABASE_URL. The real DATABASE_URL is not used in test mode.");
    }
    const test = describeTestDatabase(testUrl);
    if (!/^[A-Za-z0-9_]+_test$/.test(test.database)) {
      throw new Error("The test database name must end in _test. The test mode refuses to use this database.");
    }
    const real = describeRealDatabase(env);
    if (real && real.host === test.host && real.port === test.port && real.database === test.database) {
      throw new Error("TEST_DATABASE_URL names the same database as DATABASE_URL. Tests need a separate database.");
    }
    return testUrl;
  }
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

function getPool(): Pool {
  // Read the URL again on each call. If the mode or the URL changed after the
  // pool was made (for example, test mode turned on late), refuse to use the
  // old pool, because it can point at the real database.
  const url = resolveDatabaseUrl();
  if (pool && url !== poolUrl) {
    throw new Error("The database URL changed after the pool was made. Call closePool() first.");
  }
  if (!pool) {
    poolUrl = url;
    pool = new pg.Pool({
      connectionString: url,
      max: 5,
      // Fail a connection attempt after 5 seconds, not after the OS timeout.
      connectionTimeoutMillis: 5_000,
      // Postgres stops a statement that runs longer than 10 seconds.
      statement_timeout: 10_000,
    });
    // An idle connection can fail (for example, when Postgres restarts).
    // Without this handler the error would stop the whole process.
    pool.on("error", (err) => {
      console.error(`Database pool error: ${err.message}`);
    });
  }
  return pool;
}

/**
 * Close the pool and its connections. Tests call it at the end, so Node can
 * exit. A later call of getPool() makes a new pool.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    poolUrl = null;
    await current.end();
  }
}

export async function insertThought(params: {
  content: string;
  embedding: number[];
  people?: string[];
  topics?: string[];
  type?: string | null;
  action_items?: string[];
  source?: string | null;
}): Promise<ThoughtRow> {
  const client = await getPool().connect();
  try {
    pgvector.registerTypes(client);
    const embeddingSql = pgvector.toSql(params.embedding);
    const res = await client.query<ThoughtRow>(
      `INSERT INTO thoughts (content, embedding, people, topics, type, action_items, source)
       VALUES ($1, $2::vector, $3::text[], $4::text[], $5, $6::text[], $7)
       RETURNING id, content, embedding::text, people, topics, type, action_items, source, created_at`,
      [
        params.content,
        embeddingSql,
        params.people ?? [],
        params.topics ?? [],
        params.type ?? null,
        params.action_items ?? [],
        params.source ?? null,
      ]
    );
    const row = res.rows[0];
    if (!row) throw new Error("Insert failed");
    return parseThoughtRow(row as unknown as Record<string, unknown>);
  } finally {
    client.release();
  }
}

// Soft-delete a thought by id: mark it invalidated so it stops appearing in reads.
// Idempotent — re-invalidating an already-invalid (or missing) row affects 0 rows.
export async function invalidateThought(id: string): Promise<number> {
  const client = await getPool().connect();
  try {
    const res = await client.query(
      `UPDATE thoughts
         SET invalidated_at = now(), updated_at = now()
       WHERE id = $1::uuid AND invalidated_at IS NULL`,
      [id]
    );
    return res.rowCount ?? 0;
  } finally {
    client.release();
  }
}

function parseThoughtRow(row: Record<string, unknown>): ThoughtRow {
  let vec: number[] = [];
  const e = row.embedding;
  if (Array.isArray(e)) vec = e as number[];
  else if (typeof e === "string") vec = e.startsWith("[") ? JSON.parse(e) : parsePgVector(e);
  return {
    id: row.id as string,
    content: row.content as string,
    embedding: vec,
    people: (row.people as string[]) ?? [],
    topics: (row.topics as string[]) ?? [],
    type: (row.type as string | null) ?? null,
    action_items: (row.action_items as string[]) ?? [],
    source: (row.source as string | null) ?? null,
    created_at: new Date(row.created_at as string),
  };
}

function parsePgVector(s: string): number[] {
  if (typeof s !== "string") return [];
  const trimmed = s.replace(/^\[|\]$/g, "").trim();
  if (!trimmed) return [];
  return trimmed.split(",").map((n) => parseFloat(n.trim()));
}

export async function searchThoughts(
  queryEmbedding: number[],
  limit: number = 10
): Promise<ThoughtRow[]> {
  const client = await getPool().connect();
  try {
    const embeddingSql = pgvector.toSql(queryEmbedding);
    const res = await client.query<Record<string, unknown>>(
      `SELECT id, content, embedding::text, people, topics, type, action_items, source, created_at
       FROM thoughts
       WHERE invalidated_at IS NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [embeddingSql, limit]
    );
    return res.rows.map(parseThoughtRow);
  } finally {
    client.release();
  }
}

export async function listRecentThoughts(
  limit: number = 20,
  days?: number
): Promise<ThoughtRow[]> {
  const client = await getPool().connect();
  try {
    if (days != null) {
      const res = await client.query<Record<string, unknown>>(
        `SELECT id, content, embedding::text, people, topics, type, action_items, source, created_at
         FROM thoughts
         WHERE invalidated_at IS NULL AND created_at >= now() - ($2::text || ' days')::interval
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit, days]
      );
      return res.rows.map(parseThoughtRow);
    }
    const res = await client.query<Record<string, unknown>>(
      `SELECT id, content, embedding::text, people, topics, type, action_items, source, created_at
       FROM thoughts
       WHERE invalidated_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows.map(parseThoughtRow);
  } finally {
    client.release();
  }
}

export async function getBrainStats(): Promise<{
  total: number;
  last_7_days: number;
  last_30_days: number;
}> {
  const client = await getPool().connect();
  try {
    const res = await client.query<{ total: string; last_7: string; last_30: string }>(
      `SELECT
         count(*)::text AS total,
         count(*) FILTER (WHERE created_at >= now() - interval '7 days')::text AS last_7,
         count(*) FILTER (WHERE created_at >= now() - interval '30 days')::text AS last_30
       FROM thoughts
       WHERE invalidated_at IS NULL`
    );
    const row = res.rows[0];
    return {
      total: parseInt(row?.total ?? "0", 10),
      last_7_days: parseInt(row?.last_7 ?? "0", 10),
      last_30_days: parseInt(row?.last_30 ?? "0", 10),
    };
  } finally {
    client.release();
  }
}

export function formatThoughtForOutput(t: ThoughtRow): string {
  const meta: string[] = [];
  if (t.people?.length) meta.push(`People: ${t.people.join(", ")}`);
  if (t.topics?.length) meta.push(`Topics: ${t.topics.join(", ")}`);
  if (t.type) meta.push(`Type: ${t.type}`);
  if (t.action_items?.length) meta.push(`Action items: ${t.action_items.join("; ")}`);
  const metaLine = meta.length ? `[${meta.join(" | ")}]\n` : "";
  return `${metaLine}${t.content}\n— ${t.created_at.toISOString().slice(0, 10)}${t.source ? ` (${t.source})` : ""} · id: ${t.id}`;
}
