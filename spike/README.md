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
| `<server-name>` | The name of the home server in the tailnet (as `tailscale status` shows it) |

## Where each step runs

The home server is the Linux server that runs Docker. The PC is the computer with Claude Code and Claude Desktop.

| Step | Where |
|---|---|
| Local check | PC (optional) |
| Part 1, steps 1, 2 and 9: get the branch, start the spike, stop it | Home server |
| Part 1, steps 3 to 8: Claude Code and Claude Desktop | PC |
| Part 2, steps 1, 2, 10 and 12: start the spike, open and close the tunnel, stop the spike | Home server |
| Part 2, steps 3 and 11: open the `/healthz` URL | PC, in a browser |
| Part 2, steps 4 to 9: the custom connector | Claude web in a browser, then the phone app |
| Read the logs, then delete them | Home server |

## Node.js or Docker on the home server

The spike needs Node.js 22 or later. On the home server, run `node --version`.

- If the version is 22 or later, use the `npm ci` and `node` commands in Part 1 and Part 2.
- If Node.js is not installed or is older, use Docker. Run each command in the repository folder on the home server. The commands replace `npm ci` and the `node spike/reach-server.mjs` line.

Part 1 with Docker (tailnet address, port 8787):

```bash
TSIP=$(tailscale ip -4)
```

```bash
docker run --rm -i --init --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app -e SPIKE_HOST="$TSIP" -e SPIKE_PORT=8787 node:22 sh -c "npm ci --no-audit --no-fund >/dev/null && node spike/reach-server.mjs" 2> reach-tailnet.log
```

Part 2 with Docker (loopback, port 8788):

```bash
docker run --rm -i --init --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app -e SPIKE_HOST=127.0.0.1 -e SPIKE_PORT=8788 node:22 sh -c "npm ci --no-audit --no-fund >/dev/null && node spike/reach-server.mjs" 2> reach-funnel.log
```

Notes on these commands:

- `--network host` lets the container listen on the tailnet address and on loopback of the home server itself.
- Do not add `-t`. With `-t`, the error output goes to the terminal, and the log file stays empty.
- `--user` makes `npm ci` write `node_modules` as your user, not as root.
- Stop the spike with Ctrl+C. `--init` passes the stop signal to Node.js.

## Check on the PC first (optional)

1. Run `node spike/check-reach-server.mjs`.
2. Make sure that the output says `All 10 checks passed.`

## Part 1: Claude Code and Claude Desktop over the tailnet

Do these steps on the home server:

1. Clone the fork on the spike branch into a new folder, and go into it. The fork is public, so no sign-in is needed. If git is not installed, install it first (for example `sudo apt install git`).
   ```bash
   git clone --branch spike/phase-0-reach https://github.com/YomiOwoyomi/open_brain.git ~/open_brain-spike
   cd ~/open_brain-spike
   ```
   If you use Node (not Docker), also install the packages:
   ```bash
   npm ci
   ```
   Then read the tailnet address into a variable, so you do not type it:
   ```bash
   TSIP=$(tailscale ip -4)
   ```
   The server commands below use `"$TSIP"`.
2. Start the spike on the tailnet address, port 8787 (with Docker, use the Part 1 command above):
   ```bash
   SPIKE_HOST="$TSIP" SPIKE_PORT=8787 node spike/reach-server.mjs 2> reach-tailnet.log
   ```

Do these steps on the PC:

3. Add the spike to Claude Code. In PowerShell, read the address of the home server by its tailnet name first:
   ```powershell
   $ip = tailscale ip -4 <server-name>
   claude mcp add --transport http open-brain-spike "http://${ip}:8787/mcp"
   ```
4. Call the tool. The result shows `Total thoughts: 0`. If you get an auth error, the `claude` command is not signed in: start `claude`, type `/login`, then try again.
   ```powershell
   claude -p "Call the brain_stats tool of open-brain-spike and show the result." --allowedTools "mcp__open-brain-spike__brain_stats"
   ```
5. In the Claude Desktop configuration file, add this server under `mcpServers`. Claude Desktop starts the `mcp-remote` bridge locally, and the bridge connects over the tailnet.
   The file is not always in `%APPDATA%\Claude\`. A Claude Desktop from the newer Windows installer keeps it under `%LOCALAPPDATA%\Packages\Claude_...\LocalCache\Roaming\Claude\`. Open it with **Settings**, then **Developer**, then **Edit Config**, or find it with PowerShell:
   ```powershell
   Get-ChildItem "$env:LOCALAPPDATA\Packages", "$env:APPDATA\Claude" -Filter claude_desktop_config.json -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
   ```
   Version 6.28899.6 of the desktop app showed no Developer section. If you can not find the file, skip steps 5 and 6, and record "not tested".
   The block to add:
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

1. Start the spike on loopback, port 8788 (with Docker, use the Part 2 command above):
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

Result of the run on 2026-11-27 (the plan records it as "Phase 0a result", items G15 to G19):

| Check | Result |
|---|---|
| Claude Code over the tailnet (plain HTTP) | Yes |
| The Code tab of the desktop app over the tailnet | Yes |
| Claude Desktop chat over the tailnet with `mcp-remote` | Not tested (no Developer section in version 6.28899.6) |
| Claude web through Funnel | Yes |
| Phone app through Funnel | Yes |
| Other paths that the connector requested | None (the spike never answered `401`, so the connector did not look for OAuth) |
| Address header names behind Funnel (for G3) | `x-forwarded-for` on each request; `tailscale-user-login` and `tailscale-user-name` only from a tailnet device |
| Tunnel closed in the same hour | Yes |

Other observations:

- Each client first got `400` for a `POST /mcp` with an `mcp-method` header, then fell back to `initialize`, which worked.
- About ten seconds after the tunnel opened, automated scanners requested paths such as `/.env`, `/.git/config` and SSH key files. Each got `404`.
