#!/usr/bin/env node
/**
 * Local check of the reach spike (task S0a). Throwaway code: this branch never merges.
 *
 * It starts spike/reach-server.mjs on a free local port, then:
 *   1. connects a real MCP client (the SDK HTTP client), lists the tools and calls brain_stats
 *   2. checks /healthz, a 404 path, and GET /mcp (405)
 *   3. checks that the log lines hold header names but not a header value
 * Exit code 0 when each check passes, 1 when a check fails.
 *
 * Usage: node spike/check-reach-server.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** Ask the OS for a free port. */
function freePort() {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const serverPath = fileURLToPath(new URL("./reach-server.mjs", import.meta.url));
const child = spawn(process.execPath, [serverPath], {
  env: { ...process.env, SPIKE_HOST: "127.0.0.1", SPIKE_PORT: String(port) },
  stdio: ["ignore", "ignore", "pipe"],
});
let log = "";
child.stderr.on("data", (d) => (log += d));

// Wait for the "listening" line.
for (let i = 0; i < 50 && !log.includes("listening"); i++) await new Promise((r) => setTimeout(r, 100));

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });
// A fake secret header value. The check fails if it appears in the log.
const SECRET = "spike-check-secret-value";

try {
  // 1. A real MCP client.
  const client = new Client({ name: "spike-check", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { "x-check-secret": SECRET } },
  });
  await client.connect(transport);
  const tools = await client.listTools();
  check("lists exactly one tool, brain_stats", tools.tools.length === 1 && tools.tools[0].name === "brain_stats");
  const result = await client.callTool({ name: "brain_stats", arguments: {} });
  const text = result.content?.[0]?.text ?? "";
  check("brain_stats returns zero counts", text.includes("Total thoughts: 0") && !result.isError, text);
  await client.close();

  // 2. The other paths.
  const health = await fetch(`${base}/healthz`);
  check("GET /healthz gives 200", health.status === 200);
  const missing = await fetch(`${base}/.well-known/oauth-protected-resource?token=${SECRET}`);
  check("an unknown path gives 404", missing.status === 404);
  const get = await fetch(`${base}/mcp`);
  check("GET /mcp gives 405", get.status === 405);
  const bad = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
  check("a body that is not JSON gives 400", bad.status === 400);

  // 3. The log rule.
  await new Promise((r) => setTimeout(r, 200));
  const lines = log.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
  const requestLines = lines.filter((l) => l.method);
  check("each request wrote a log line", requestLines.length >= 6, `${requestLines.length} lines`);
  check("the log holds the header name", requestLines.some((l) => l.header_names.includes("x-check-secret")));
  check("the log holds no header value and no query string", !log.includes(SECRET));
  check("the log records the 404 path", requestLines.some((l) => l.path === "/.well-known/oauth-protected-resource"));
} catch (err) {
  check("no unexpected error", false, err.message);
} finally {
  child.kill();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? ` (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? `All ${results.length} checks passed.` : `${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
