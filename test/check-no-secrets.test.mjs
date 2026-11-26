// Tests for the secret scan: scripts/secret-scan.mjs (the library) and
// scripts/check-no-secrets.mjs (the command).
//
// This file must never hold a literal private value, because the scan reads
// it too. Each test value is built at run time from harmless parts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanText,
  parseAllowList,
  formatFinding,
  scanRepository,
  decodeForScan,
} from "../scripts/secret-scan.mjs";

const SCRIPT = join(import.meta.dirname, "..", "scripts", "check-no-secrets.mjs");

/** Make a JWT-shaped string at run time. It starts with "eyJ" only after encoding. */
function makeJwt() {
  const part = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${part({ alg: "RS256", typ: "JWT" })}.${part({ sub: "test-user" })}.c2lnbmF0dXJl`;
}

/** Make a tailnet-style host name at run time. */
function makeTailnetName() {
  return ["host", "tail0000", "ts", "net"].join(".");
}

/** Make an address in 100.64/10 at run time. */
function makeTailnetAddress() {
  return [100, 100, 7, 9].join(".");
}

/** Make a Tailscale IPv6 address at run time. */
function makeTailnetV6() {
  return ["fd7a", "115c", "a1e0", "ab12", "", "1"].join(":");
}

/** Run a function in a new, empty git repository, then delete it. */
function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), "scan-test-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "commit.gpgsign", "false");
    return fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Run the scan command in a folder. */
function runScan(cwd, args = [], input = "") {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, input, encoding: "utf8" });
}

test("a JWT string is found, and the output does not contain it", () => {
  const jwt = makeJwt();
  const findings = scanText("notes.md", `line one\ntoken: ${jwt}\n`);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], { path: "notes.md", line: 2, pattern: "jwt" });
  // The finding and its printed form hold no part of the token.
  const printed = formatFinding(findings[0]);
  assert.equal(printed, "notes.md:2: jwt");
  assert.ok(!printed.includes(jwt.slice(0, 12)));
  assert.ok(!JSON.stringify(findings).includes(jwt.slice(0, 12)));
});

test("a tailnet name and IPv4 and IPv6 tailnet addresses are found", () => {
  const text = `a ${makeTailnetName()}\nb ${makeTailnetAddress()}\nc ${makeTailnetV6()}\n`;
  const classes = scanText("x.md", text).map((f) => f.pattern);
  assert.deepEqual(classes, ["tailnet-name", "tailnet-address", "tailnet-address-v6"]);
});

test("addresses outside 100.64/10 are not found", () => {
  const text = ["100.63.255.255", "100.128.0.1", "10.0.0.1", "192.168.1.10"].join("\n");
  assert.deepEqual(scanText("x.md", text), []);
});

test("short words that start with eyJ are not found", () => {
  assert.deepEqual(scanText("x.md", "eyJ is a prefix"), []);
});

test("a whole-file allow entry permits one class in one file only", () => {
  const allowed = parseAllowList("# comment\n\nx.md tailnet-address\n");
  const text = `${makeTailnetAddress()}\n${makeJwt()}\n`;
  // In x.md the address is allowed, but the JWT is still found.
  assert.deepEqual(scanText("x.md", text, allowed).map((f) => f.pattern), ["jwt"]);
  // In another file the address is still found.
  assert.equal(scanText("y.md", text, allowed).length, 2);
});

test("a commit-scoped allow entry does not permit the class in the current file", () => {
  const allowed = parseAllowList(`x.md tailnet-address ${"a".repeat(40)}\n`);
  assert.equal(scanText("x.md", makeTailnetAddress(), allowed).length, 1);
});

test("a commit field that is not a full 40-character SHA is ignored", () => {
  const allowed = parseAllowList("x.md jwt abc\nx.md jwt abcdef1234\n");
  assert.equal(allowed.files.size, 0);
  assert.equal(allowed.commits.length, 0);
});

test("decodeForScan decodes UTF-16 with a byte order mark, and returns null for binary bytes", () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`t ${makeJwt()}\n`, "utf16le")]);
  assert.match(decodeForScan(utf16), /^t eyJ/);
  assert.equal(decodeForScan(Buffer.from([0x89, 0x50, 0x00, 0x01])), null);
});

test("the repository scan reads only tracked files", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "tracked.md"), "nothing private here\n");
    // This file is not added to git, so the scan must not read it.
    writeFileSync(join(dir, "untracked.md"), `${makeJwt()}\n`);
    git("add", "tracked.md");
    const result = scanRepository(dir);
    assert.equal(result.fileCount, 1);
    assert.deepEqual(result.findings, []);
  });
});

test("the command exits 1, names the file and line, and does not print the token", () => {
  withRepo((dir, git) => {
    const jwt = makeJwt();
    writeFileSync(join(dir, "t.md"), `ok\n${jwt}\n`);
    git("add", "t.md");
    const r = runScan(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /t\.md:2: jwt/);
    assert.ok(!(r.stdout + r.stderr).includes(jwt.slice(0, 12)));
  });
});

test("the command exits 0 on a clean repository", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "t.md"), "ok\n");
    git("add", "t.md");
    const r = runScan(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Secret scan: OK/);
  });
});

test("the command exits 2 when it can not run", () => {
  withRepo((dir) => {
    const r = runScan(dir, ["--range", "no-such-ref..HEAD"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /could not run/);
  });
});

test("the range scan finds a value that a later commit removed", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "t.md"), "start\n");
    git("add", "t.md");
    git("commit", "-q", "-m", "start");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "t.md"), `start\n${makeTailnetAddress()}\n`);
    git("commit", "-q", "-am", "add");
    const added = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "t.md"), "start\n");
    git("commit", "-q", "-am", "remove");

    // The current files are clean, so the plain scan passes.
    assert.equal(runScan(dir).status, 0);
    // The range scan still finds the value in the history.
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(`t\\.md:2: tailnet-address \\(commit ${added.slice(0, 12)}\\)`));
  });
});

test("the pre-push mode scans the commits that the push sends", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "t.md"), "start\n");
    git("add", "t.md");
    git("commit", "-q", "-m", "start");
    const remote = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "t.md"), `start\n${makeTailnetName()}\n`);
    git("commit", "-q", "-am", "add");
    const local = git("rev-parse", "HEAD");

    const line = `refs/heads/x ${local} refs/heads/x ${remote}\n`;
    const r = runScan(dir, ["--pre-push"], line);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /t\.md:2: tailnet-name/);

    // A push that deletes a branch sends no commit.
    const del = `(delete) ${"0".repeat(40)} refs/heads/x ${remote}\n`;
    assert.equal(runScan(dir, ["--pre-push"], del).status, 0);
  });
});

test("a commit-scoped allow entry permits the value in that commit only", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "t.md"), "start\n");
    git("add", "t.md");
    git("commit", "-q", "-m", "start");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "t.md"), `start\n${makeTailnetAddress()}\n`);
    git("commit", "-q", "-am", "first");
    const first = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "t.md"), `start\n${makeTailnetAddress()}\n${makeTailnetAddress()}\n`);
    git("commit", "-q", "-am", "second");

    writeFileSync(join(dir, ".secret-scan-allow"), `t.md tailnet-address ${first}\n`);
    git("add", ".secret-scan-allow");
    git("commit", "-q", "-m", "allow");

    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    // The first commit is allowed. The second commit is still found.
    assert.equal(r.status, 1);
    assert.equal((r.stderr.match(/tailnet-address/g) ?? []).length, 1);
    assert.ok(!r.stderr.includes(first.slice(0, 12)));
  });
});

/** Write a file, commit it, and return the commit SHA. */
function commitFile(dir, git, name, content, message) {
  writeFileSync(join(dir, name), content);
  git("add", name);
  git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

test("the range scan is not blinded by diff.noprefix", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, "t.md", "start\n", "start");
    git("config", "diff.noprefix", "true");
    commitFile(dir, git, "t.md", `start\n${makeTailnetAddress()}\n`, "add");
    assert.equal(runScan(dir, ["--range", `${base}..HEAD`]).status, 1);
  });
});

test("the range scan reads a file that .gitattributes marks -diff", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, ".gitattributes", "* -diff\n", "attrs");
    commitFile(dir, git, "t.md", `${makeJwt()}\n`, "add");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /t\.md:1: jwt/);
  });
});

test("the range scan reads a UTF-16 file in a commit", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, "a.md", "start\n", "start");
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`log ${makeTailnetName()}\n`, "utf16le")]);
    writeFileSync(join(dir, "log.txt"), utf16);
    git("add", "log.txt");
    git("commit", "-q", "-m", "log");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /log\.txt:1: tailnet-name/);
  });
});

test("the range scan reads a value that only a merge commit adds", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, "t.md", "line\n", "start");
    const main = git("rev-parse", "--abbrev-ref", "HEAD");
    git("checkout", "-q", "-b", "side");
    commitFile(dir, git, "t.md", "side\n", "side");
    git("checkout", "-q", main);
    commitFile(dir, git, "t.md", "main\n", "main");
    // The merge conflicts. The resolution adds the value.
    spawnSync("git", ["merge", "-q", "side"], { cwd: dir });
    writeFileSync(join(dir, "t.md"), `${makeTailnetAddress()}\n`);
    git("add", "t.md");
    git("commit", "-q", "-m", "merge");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /tailnet-address/);
  });
});

test("the pre-push mode scans a commit that is only on another remote", () => {
  withRepo((dir, git) => {
    commitFile(dir, git, "t.md", "start\n", "start");
    const local = commitFile(dir, git, "t.md", `start\n${makeTailnetAddress()}\n`, "add");
    // The commit is on a private remote already, but not on the public one.
    git("update-ref", "refs/remotes/private/main", local);
    const line = `refs/heads/main ${local} refs/heads/main ${"0".repeat(40)}\n`;
    assert.equal(runScan(dir, ["--pre-push", "public"], line).status, 1);
    // With no remote name, the full history is scanned.
    assert.equal(runScan(dir, ["--pre-push"], line).status, 1);
  });
});

test("a single revision scans the full history", () => {
  withRepo((dir, git) => {
    commitFile(dir, git, "t.md", `${makeTailnetAddress()}\n`, "add");
    commitFile(dir, git, "t.md", "clean\n", "remove");
    assert.equal(runScan(dir, ["--range", "HEAD"]).status, 1);
  });
});

test("a .gitattributes rule that shows a UTF-16 file as text does not hide a value", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, "a.md", "start\n", "start");
    writeFileSync(join(dir, ".gitattributes"), "*.log diff\n");
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`x ${makeTailnetName()}\n`, "utf16le")]);
    writeFileSync(join(dir, "a.log"), utf16);
    git("add", ".gitattributes", "a.log");
    git("commit", "-q", "-m", "add");
    git("rm", "-q", "a.log");
    git("commit", "-q", "-m", "remove");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a\.log:\d+: tailnet-name/);
  });
});

test("a binary file whose name holds ' and b/' is read from its real path", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, ".gitattributes", "*.bin -diff\n", "attrs");
    commitFile(dir, git, "r.bin", "clean\n", "clean file");
    // The name holds " and b/", so the "Binary files ... differ" line is ambiguous.
    const odd = "q and b";
    mkdirSync(join(dir, odd), { recursive: true });
    // First a clean version, then a change: only a changed file gives the
    // ambiguous line "Binary files a/q and b/r.bin and b/q and b/r.bin differ".
    writeFileSync(join(dir, odd, "r.bin"), "clean\n");
    git("add", `${odd}/r.bin`);
    git("commit", "-q", "-m", "odd clean");
    writeFileSync(join(dir, odd, "r.bin"), `${makeJwt()}\n`);
    git("commit", "-q", "-am", "odd");
    git("rm", "-q", `${odd}/r.bin`);
    git("commit", "-q", "-m", "remove");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /q and b\/r\.bin:1: jwt/);
  });
});

test("the range scan reads the root commit even when log.showRoot is false", () => {
  withRepo((dir, git) => {
    git("config", "log.showRoot", "false");
    commitFile(dir, git, "t.md", `${makeTailnetAddress()}\n`, "root");
    commitFile(dir, git, "t.md", "clean\n", "remove");
    assert.equal(runScan(dir, ["--range", "HEAD"]).status, 1);
  });
});

test("a path with a space is reported without a trailing tab", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, "a.md", "start\n", "start");
    commitFile(dir, git, "my file.md", `${makeJwt()}\n`, "add");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /my file\.md:1: jwt \(commit/);
  });
});

/**
 * Commit a file whose name holds a double quote, so git shows the name quoted.
 * Git for Windows refuses that name unless core.protectNTFS is off, so the
 * setting is turned off for these commands only.
 */
function commitQuotedName(dir, content) {
  const git = (args, input) => execFileSync("git", ["-c", "core.protectNTFS=false", ...args], { cwd: dir, input });
  const blob = git(["hash-object", "-w", "--stdin"], content).toString().trim();
  git(["update-index", "--add", "--cacheinfo", `100644,${blob},a"b.md`]);
  git(["commit", "-q", "-m", "quoted"]);
}

test("a quoted file name stops the range scan with exit 2", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, "a.md", "x\n", "start");
    commitQuotedName(dir, "text\n");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /could not be read/);
  });
});

test("a quoted binary file name stops the range scan with exit 2", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, ".gitattributes", "*.md -diff\n", "attrs");
    commitQuotedName(dir, "text\n");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /could not be read/);
  });
});

test("bad arguments exit 2", () => {
  withRepo((dir) => {
    for (const args of [["--range"], ["--range", ""], ["--bogus"]]) {
      const r = runScan(dir, args);
      assert.equal(r.status, 2, args.join(" "));
      assert.match(r.stderr, /could not run/);
    }
  });
});

test("a run outside a git repository exits 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-nogit-"));
  try {
    // GIT_CEILING_DIRECTORIES stops git from finding a repository above the temp folder.
    const r = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() },
    });
    assert.equal(r.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the file scan reads a binary file and UTF-16 text with no byte order mark", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "b.bin"), Buffer.concat([Buffer.from([0, 1, 0, 10]), Buffer.from(makeJwt())]));
    writeFileSync(join(dir, "u.txt"), Buffer.from(makeTailnetName(), "utf16le"));
    git("add", ".");
    const classes = scanRepository(dir).findings.map((f) => `${f.path} ${f.pattern}`).sort();
    assert.deepEqual(classes, ["b.bin jwt", "u.txt tailnet-name"]);
  });
});

test("a symbolic link is scanned as its target text, not followed", { skip: process.platform === "win32" && "git symbolic links need extra setup on Windows" }, () => {
  withRepo((dir, git) => {
    // The link target text holds the value. The target file does not exist.
    symlinkSync(makeTailnetName(), join(dir, "link"));
    git("add", "link");
    const findings = scanRepository(dir).findings;
    assert.deepEqual(findings.map((f) => `${f.path} ${f.pattern}`), ["link tailnet-name"]);
  });
});

test("an added line that starts with '++ ' is scanned at the right line", () => {
  withRepo((dir, git) => {
    const base = commitFile(dir, git, "a.md", "x\n", "start");
    commitFile(dir, git, "t.md", `first\n++ ${makeTailnetName()}\n`, "add");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /t\.md:2: tailnet-name/);
  });
});

test("line numbers stay right across two hunks", () => {
  withRepo((dir, git) => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const base = commitFile(dir, git, "t.md", `${lines.join("\n")}\n`, "start");
    lines[0] = "changed";
    lines[8] = makeTailnetName();
    commitFile(dir, git, "t.md", `${lines.join("\n")}\n`, "two hunks");
    const r = runScan(dir, ["--range", `${base}..HEAD`]);
    assert.match(r.stderr, /t\.md:9: tailnet-name/);
  });
});

test("a stale allow entry gives a warning and exit 0", () => {
  withRepo((dir, git) => {
    commitFile(dir, git, ".secret-scan-allow", "gone.md jwt\n", "allow");
    const r = runScan(dir);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /entry "gone\.md jwt" names a file that git does not track/);
  });
});

test("the scan passes on the current tree", () => {
  const root = join(import.meta.dirname, "..");
  assert.deepEqual(scanRepository(root).findings.map(formatFinding), []);
});
