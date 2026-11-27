#!/usr/bin/env node
/**
 * Phase 0a reach spike (task S0a). Throwaway code: this branch never merges.
 *
 * Purpose: prove which MCP clients can reach a server on the home server,
 * and record what each client sends. The spike answers these questions:
 *   - Can the Claude connector (Claude web and the phone app, which connect
 *     from the Anthropic cloud) reach the server through Tailscale Funnel?
 *   - Can Claude Code and Claude Desktop reach the server over the tailnet
 *     with plain HTTP?
 *   - Which paths does each client request (for example OAuth metadata)?
 *   - Which header names carry the client address behind the tunnel
 *     (Gate 1 item G3)?
 *
 * Safety: the server has one tool, brain_stats, which returns fixed zero
 * counts. It has no database and no data, so an open tunnel shows nothing.
 *
 * Log rule: each request writes one JSON line to stderr with the method, the
 * path (no query string, because a query can hold a token), the status, the
 * duration, the header NAMES and the user-agent value. It never writes other
 * header values or the request body, because they can hold a token or an
 * address. Keep the log on the home server: do not commit it.
 *
 * Configuration (environment variables):
 *   SPIKE_HOST  the address to listen on (default 127.0.0.1)
 *   SPIKE_PORT  the port to listen on (default 8788)
 *
 * Usage: node spike/reach-server.mjs
 */
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const HOST = process.env.SPIKE_HOST || "127.0.0.1";
const PORT = Number(process.env.SPIKE_PORT || 8788);
const MAX_BODY_BYTES = 100 * 1024;

/** Header names that can carry the client address behind a proxy or tunnel (G3). */
const ADDRESS_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "true-client-ip",
  "tailscale-user-login",
  "tailscale-user-name",
];

/** Make a new MCP server with one tool. The spike makes one for each request (stateless). */
function makeMcpServer() {
  const server = new McpServer({ name: "open-brain-reach-spike", version: "0.0.0" });
  server.registerTool(
    "brain_stats",
    {
      title: "Brain stats",
      description:
        "Reach spike: returns fixed zero counts. There is no database behind this server.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: "Total thoughts: 0\nLast 7 days: 0\nLast 30 days: 0" }],
    }),
  );
  return server;
}

/** Write one log line for a finished request. It never holds a header value except user-agent. */
function logRequest(req, res, started) {
  const names = Object.keys(req.headers).sort();
  const line = {
    time: new Date().toISOString(),
    method: req.method,
    path: (req.url || "").split("?")[0],
    status: res.statusCode,
    duration_ms: Date.now() - started,
    user_agent: req.headers["user-agent"] ?? null,
    address_headers: ADDRESS_HEADERS.filter((h) => h in req.headers),
    has_authorization: "authorization" in req.headers,
    header_names: names,
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

/** Read the request body, up to MAX_BODY_BYTES. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Send a small JSON error. */
function sendError(res, status, message) {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

const httpServer = createServer(async (req, res) => {
  const started = Date.now();
  res.on("finish", () => logRequest(req, res, started));

  const path = (req.url || "").split("?")[0];

  // A liveness check for the owner, with no MCP.
  if (path === "/healthz" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", spike: "phase-0a" }));
    return;
  }

  // Each other path (for example an OAuth metadata path) gets 404. The log
  // line records the path, which tells Phase 0b what the connector asks for.
  if (path !== "/mcp") {
    sendError(res, 404, "not found");
    return;
  }

  // The stateless transport has no session, so GET (a stream) and DELETE
  // (end a session) have no meaning here.
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    sendError(res, 405, "method not allowed");
    return;
  }

  let body;
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : undefined;
  } catch (err) {
    sendError(res, err.status || 400, err.status ? err.message : "the body is not valid JSON");
    return;
  }

  // One server and one transport for each request (stateless mode).
  const server = makeMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), error: err.message })}\n`);
    sendError(res, 500, "internal error");
  }
});

httpServer.listen(PORT, HOST, () => {
  process.stderr.write(
    `${JSON.stringify({ time: new Date().toISOString(), listening: `${HOST}:${PORT}`, path: "/mcp" })}\n`,
  );
});

// Stop cleanly on Ctrl+C or a service stop.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
