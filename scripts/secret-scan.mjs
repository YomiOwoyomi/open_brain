/**
 * Secret scan library for this public repository.
 * The command line entry point is scripts/check-no-secrets.mjs.
 *
 * The scan reads each file that `git ls-files` lists. It looks for these
 * classes of private value:
 *   - tailnet-name: a Tailscale MagicDNS name (ends in .ts.net)
 *   - tailnet-address: a Tailscale IPv4 address (the 100.64/10 range)
 *   - tailnet-address-v6: a Tailscale IPv6 address (the fd7a:115c:a1e0 prefix)
 *   - jwt: a string that starts with "eyJ" (a JSON Web Token or a part of one)
 *
 * Output rule: a finding holds the file, the line number and the pattern
 * class only. It never holds the matched text, so a CI log does not leak
 * the value that the scan found.
 *
 * Two modes:
 *   - scanRepository: the current content of each tracked file.
 *   - scanCommits: the added lines of each commit in a range. This catches a
 *     value that one commit adds and a later commit removes, because the
 *     public history still holds it.
 *
 * Allow file: `.secret-scan-allow` at the repository root. Each line that is
 * not empty and not a comment has two or three fields, separated by spaces:
 *   <path> <pattern-class>            permits the class in that file
 *   <path> <pattern-class> <commit>   permits the class in that file, only in
 *                                     the added lines of that one commit
 * The commit must be the full 40-character SHA; a shorter value is ignored.
 * A commit-scoped entry does not cover a merge commit that brings the same
 * line in again, so use it only for a line that a later commit removes.
 * An entry holds no matched text, so the allow file itself never holds a
 * private value.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync, readlinkSync } from "node:fs";
import { join } from "node:path";

/** The pattern classes. Each regex has the "g" flag, so one line can give more than one match. */
export const PATTERNS = [
  // A MagicDNS name: one or more labels, then ".ts.net".
  { name: "tailnet-name", regex: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.ts\.net\b/gi },
  // 100.64/10 covers the second octet 64 to 127.
  {
    name: "tailnet-address",
    regex: /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/g,
  },
  // Tailscale gives each node an IPv6 address with this fixed prefix.
  { name: "tailnet-address-v6", regex: /\bfd7a:115c:a1e0:/gi },
  // A base64url JSON object that starts with '{"' encodes to "eyJ".
  // Eight more characters keep short words (for example a variable name) out.
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]{8,}/g },
];

/** The name of the allow file, at the repository root. */
export const ALLOW_FILE = ".secret-scan-allow";

/**
 * Read the allow file text.
 * Returns { files, commits }:
 *   - files: a Set of "<path> <class>" keys (whole-file entries)
 *   - commits: a list of { path, pattern, commit } (commit-scoped entries)
 * Blank lines and lines that start with "#" are ignored. A commit field that
 * is not a full 40-character SHA is ignored, so a typo can not permit too much.
 */
export function parseAllowList(text) {
  const files = new Set();
  const commits = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [path, patternClass, commit] = line.split(/\s+/);
    if (!path || !patternClass) continue;
    if (commit === undefined) files.add(`${path} ${patternClass}`);
    // Only a full 40-character SHA counts. A short prefix is easy to match by chance.
    else if (/^[0-9a-f]{40}$/i.test(commit)) {
      commits.push({ path, pattern: patternClass, commit: commit.toLowerCase() });
    }
  }
  return { files, commits };
}

/** True when an allow entry permits this class in this file (and commit, if given). */
function isAllowed(allowed, path, pattern, commit) {
  if (allowed.files.has(`${path} ${pattern}`)) return true;
  if (!commit) return false;
  return allowed.commits.some(
    (e) => e.path === path && e.pattern === pattern && commit.toLowerCase() === e.commit,
  );
}

/** An allow list that permits nothing. */
const EMPTY_ALLOW = { files: new Set(), commits: [] };

/**
 * Scan a list of lines. `lineNumbers[i]` is the line number to report for
 * `lines[i]` (for a whole file it is i + 1).
 * Returns findings: { path, line, pattern } plus `commit` when one is given.
 * A finding never holds the matched text, so a caller can not print it by mistake.
 */
function scanLines(path, lines, lineNumbers, allowed, commit) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    // Remove NUL characters first. UTF-16 text that git or the latin1 read
    // shows byte by byte has a NUL between letters, which hides each pattern.
    const text = lines[i].replace(/\0/g, "");
    for (const { name, regex } of PATTERNS) {
      // Skip a class that the allow file permits here.
      if (isAllowed(allowed, path, name, commit)) continue;
      // Reset the regex, because a "g" regex keeps its position between calls.
      regex.lastIndex = 0;
      if (regex.test(text)) {
        const finding = { path, line: lineNumbers[i], pattern: name };
        if (commit) finding.commit = commit;
        findings.push(finding);
      }
    }
  }
  return findings;
}

/** Scan the full text of one file. */
export function scanText(path, text, allowed = EMPTY_ALLOW) {
  const lines = text.split(/\r?\n/);
  return scanLines(path, lines, lines.map((_, i) => i + 1), allowed);
}

/** Format one finding for output. It has no matched text. */
export function formatFinding(f) {
  const where = `${f.path}:${f.line}: ${f.pattern}`;
  return f.commit ? `${where} (commit ${f.commit.slice(0, 12)})` : where;
}

/**
 * Decode a file for the scan. A true binary file is read as latin1, so the
 * ASCII patterns can still match a value that sits inside it.
 */
function textForScan(buffer) {
  return decodeForScan(buffer) ?? buffer.toString("latin1");
}

/**
 * Scan the added lines of each commit that `git log <revArgs>` selects.
 * `revArgs` is a list of git revision arguments, for example
 * ["abc123..def456"] or [sha, "--not", "--remotes=origin"].
 *
 * The scan must not depend on settings that a user or a commit controls:
 *   - The diff options are fixed (prefixes, no external diff, no textconv),
 *     so a global git setting can not change the output format.
 *   - A file that git shows as binary (by content, or by a .gitattributes
 *     rule such as -diff) is read from the commit with `git cat-file` and
 *     scanned in full. This also covers UTF-16 files.
 *   - A merge commit is compared with its first parent, so a value that only
 *     the merge adds (a conflict resolution) is also scanned.
 *   - A file header that the parser can not read stops the scan with an
 *     error. The scan never skips a file without a message.
 */
export function scanCommits(root, revArgs, allowed = EMPTY_ALLOW) {
  const git = (args) =>
    execFileSync("git", args, { cwd: root, maxBuffer: 256 * 1024 * 1024 });

  // %x01 marks the start of each commit, so the parser can find its SHA.
  // -U0 gives only the changed lines. quotePath=false keeps paths readable.
  const log = git([
    "-c", "core.quotePath=false", "-c", "diff.noprefix=false",
    // --root: also show the diff of the first commit (log.showRoot can turn it off).
    // --no-renames: a renamed file shows as delete + add, so both diff paths are equal.
    // --inter-hunk-context=0: no context lines between hunks, so line numbers stay right.
    "log", "-p", "-U0", "--root", "--no-renames", "--inter-hunk-context=0",
    "--no-color", "--no-ext-diff", "--no-textconv",
    "--src-prefix=a/", "--dst-prefix=b/", "--diff-merges=first-parent",
    "--format=%x01%H", ...revArgs, "--",
  ]).toString("utf8");

  const findings = [];
  let commit = null;
  let commitCount = 0;
  let path = null; // null while the current file is deleted or has no text change
  let next = 0; // the line number of the next added line in the new file
  // True between "diff --git" and the first "@@" of a file. Only there is a
  // "+++ " line a file header; in a hunk it is an added line that starts with "++".
  let inHeader = false;
  // The path from the "diff --git a/<p> b/<p>" line, or null when it can not
  // be read with certainty (a quoted path). With --no-renames both halves are equal.
  let diffPath = null;

  for (const raw of log.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("\x01")) {
      commit = line.slice(1).trim();
      commitCount++;
      path = null;
      inHeader = false;
    } else if (line.startsWith("diff --git ")) {
      inHeader = true;
      path = null;
      diffPath = pathFromDiffLine(line.slice("diff --git ".length));
    } else if (inHeader && line.startsWith("+++ ")) {
      // "+++ b/<path>" names the new file. "+++ /dev/null" is a deleted file.
      // Git adds a TAB after a path that holds a space, so remove it.
      if (line === "+++ /dev/null") path = null;
      else if (line.startsWith("+++ b/")) path = line.slice(6).replace(/\t$/, "");
      // A quoted path ("+++ \"b/...\"") or another form: fail closed.
      else throw new Error(`commit ${commit}: a file header could not be read. Rename the file to a plain name.`);
    } else if (inHeader && line.startsWith("Binary files ")) {
      // A binary file: read the new version in full. The path comes from the
      // "diff --git" line, because a path that holds " and b/" makes the
      // "Binary files ... differ" line ambiguous.
      if (/ and \/dev\/null differ$/.test(line)) continue; // the file was deleted
      if (diffPath === null) {
        throw new Error(`commit ${commit}: the path of a binary file could not be read. Rename the file to a plain name.`);
      }
      const blob = git(["cat-file", "blob", `${commit}:${diffPath}`]);
      findings.push(...scanLinesOf(diffPath, textForScan(blob), allowed, commit));
    } else if (line.startsWith("@@")) {
      inHeader = false;
      // "@@ -a,b +c,d @@": the added lines start at line c of the new file.
      const m = /\+(\d+)/.exec(line);
      next = m ? Number(m[1]) : 0;
    } else if (!inHeader && line.startsWith("+") && path) {
      findings.push(...scanLines(path, [line.slice(1)], [next], allowed, commit));
      next++;
    }
  }
  return { findings, commitCount };
}

/**
 * Read the path from the text after "diff --git ": "a/<p> b/<p>".
 * Returns null when the two halves are not the same path (for example a
 * quoted path), so the caller can fail closed.
 */
function pathFromDiffLine(rest) {
  if (!rest.startsWith("a/") || (rest.length - 5) % 2 !== 0) return null;
  const length = (rest.length - 5) / 2;
  const p = rest.slice(2, 2 + length);
  return rest === `a/${p} b/${p}` ? p : null;
}

/** Scan the full text of one file version from a commit. */
function scanLinesOf(path, text, allowed, commit) {
  const lines = text.split(/\r?\n/);
  return scanLines(path, lines, lines.map((_, i) => i + 1), allowed, commit);
}

/** Read the allow file of the repository, or return an allow list that permits nothing. */
export function readAllowList(root) {
  try {
    return parseAllowList(readFileSync(join(root, ALLOW_FILE), "utf8"));
  } catch {
    return EMPTY_ALLOW;
  }
}

/**
 * Decode file bytes to text for the scan, or return null for a binary file.
 *
 * A UTF-16 file (for example a log that Windows PowerShell wrote with ">")
 * has NUL bytes, so a plain NUL check would skip it as binary. The function
 * reads the byte order mark first and decodes UTF-16 text, so the scan
 * still reads it.
 */
export function decodeForScan(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    // Big-endian UTF-16: swap each byte pair, then decode as little-endian.
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  // A file with a NUL byte in its first 8 kB and no UTF-16 mark is binary.
  if (buffer.subarray(0, 8192).includes(0)) return null;
  return buffer.toString("utf8");
}

/**
 * Run the scan on each tracked file of the repository at `root`.
 * Returns the findings, the count of tracked files, and the allow entries
 * that name no tracked file (stale entries, which the caller reports).
 */
export function scanRepository(root) {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root });
  const paths = output.toString("utf8").split("\0").filter(Boolean);

  const allowed = readAllowList(root);

  const findings = [];
  for (const path of paths) {
    const fullPath = join(root, path);
    let stat;
    try {
      stat = lstatSync(fullPath);
    } catch {
      // A tracked file can be deleted in the work tree. Skip it.
      continue;
    }
    // Git stores a symbolic link as its target text. Scan that text, and do
    // not follow the link to a file outside the repository.
    // A binary file is read as latin1, so the ASCII patterns still match inside it.
    const text = stat.isSymbolicLink()
      ? readlinkSync(fullPath)
      : textForScan(readFileSync(fullPath));
    findings.push(...scanText(path, text, allowed));
  }

  // A whole-file allow entry for a path that git does not track is stale.
  // Commit-scoped entries are about history, so they are not checked here.
  const tracked = new Set(paths);
  const staleAllowEntries = [...allowed.files].filter((entry) => !tracked.has(entry.split(" ")[0]));

  return { findings, fileCount: paths.length, staleAllowEntries };
}
