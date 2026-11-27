# Phase 0a reach spike (task S0a)

This folder is throwaway code on the branch `spike/phase-0-reach`. The branch never merges into `main`.

The spike answers four questions before the door code is written:

1. Can the Claude connector (Claude web and the phone app) reach a server on the home server through Tailscale Funnel?
2. Can Claude Code reach the server over the tailnet with plain HTTP?
3. Can Claude Desktop reach the server over the tailnet, and does it need a bridge?
4. Which paths and header names does each client send? The header names tell Gate 1 item G3 which header carries the client address.

The server has one tool, `brain_stats`, which returns fixed zero counts. It has no database and no data.

**CAUTION: Do not commit a host name, a tailnet address, a Funnel URL or a log file.** This repository is public. Use the placeholders below in each note.

| Placeholder | Meaning |
|---|---|
| `<tailnet-ip>` | The Tailscale IPv4 address of the home server (`tailscale ip -4`) |
| `<funnel-host>` | The Funnel host name of the home server (it ends in `.ts.net`) |

## Check on this PC first

1. Run `node spike/check-reach-server.mjs`.
2. Make sure that the output says `All 10 checks passed.`

## Part 1: Claude Code and Claude Desktop over the tailnet

Do these steps on the home server:

1. Get the spike branch:
   ```bash
   git fetch origin
   git switch spike/phase-0-reach
   npm ci
   ```
2. Start the spike on the tailnet address, port 8787:
   ```bash
   SPIKE_HOST=<tailnet-ip> SPIKE_PORT=8787 node spike/reach-server.mjs 2> reach-tailnet.log
   ```

Do these steps on the PC:

3. Add the spike to Claude Code:
   ```bash
   claude mcp add --transport http open-brain-spike http://<tailnet-ip>:8787/mcp
   ```
4. In Claude Code, ask: "Call the brain_stats tool of open-brain-spike." The result shows `Total thoughts: 0`.
5. In the Claude Desktop configuration file, add this server under `mcpServers`. Claude Desktop starts the `mcp-remote` bridge locally, and the bridge connects over the tailnet:
   ```json
   "open-brain-spike": {
     "command": "npx",
     "args": ["mcp-remote", "http://<tailnet-ip>:8787/mcp", "--allow-http"]
   }
   ```
6. Restart Claude Desktop. Ask the same question as in step 4.
7. Record the result of steps 4 and 6 in the results table below.
8. Remove the spike from both clients: `claude mcp remove open-brain-spike`, and delete the block from the Claude Desktop file.
9. On the home server, stop the spike with Ctrl+C.

## Part 2: the Claude connector through Tailscale Funnel

**CAUTION: Close the tunnel in the same hour.** While the tunnel is open, the spike is on the public internet with no sign-in. It has no data, but do not leave it open.

Do these steps on the home server:

1. Start the spike on loopback, port 8788:
   ```bash
   node spike/reach-server.mjs 2> reach-funnel.log
   ```
2. In a second terminal, open the tunnel to port 8788:
   ```bash
   tailscale funnel --bg 8788
   ```
   If Tailscale asks you to turn on Funnel for the tailnet, follow the link that it shows. The command prints the public URL, `https://<funnel-host>/`.
3. Check the tunnel from the PC: open `https://<funnel-host>/healthz`. The page shows `{"status":"ok","spike":"phase-0a"}`.

Do these steps in Claude:

4. On Claude web, open **Settings**, then **Connectors**, then **Add custom connector**.
5. Enter the name `open-brain-spike` and the URL `https://<funnel-host>/mcp`. Do not add OAuth values.
6. In a new chat on Claude web, ask: "Call the brain_stats tool of open-brain-spike."
7. On the phone app, start a new chat and ask the same question. The connector that you added on the web is also on the phone.
8. Record the results of steps 6 and 7 in the results table below.

Close everything:

9. Remove the connector on Claude web.
10. On the home server, close the tunnel:
    ```bash
    tailscale funnel reset
    ```
11. Check that the tunnel is closed: `https://<funnel-host>/healthz` does not open.
12. Stop the spike with Ctrl+C.

## Read the logs

Each log line is JSON. It holds the method, the path, the status, the header names and the user-agent, and never a header value. On the home server, show the paths and header names that each client sent:

```bash
grep -h '"method"' reach-tailnet.log reach-funnel.log | cut -c1-400
```

Record in the results table:

- each path that is not `/mcp` or `/healthz` (for example an OAuth metadata path), because Phase 0b must serve it
- the names in `address_headers`, because G3 needs the header that carries the client address

Then delete the two log files on the home server. Do not copy them into the repository.

## Results

Fill this table with yes, no, or a short note. Do not write a host name, an address or a URL.

| Check | Result |
|---|---|
| Claude Code over the tailnet (plain HTTP) | |
| Claude Desktop over the tailnet with `mcp-remote` | |
| Claude web through Funnel | |
| Phone app through Funnel | |
| Other paths that the connector requested | |
| Address header names behind Funnel (for G3) | |
| Tunnel closed in the same hour | |
