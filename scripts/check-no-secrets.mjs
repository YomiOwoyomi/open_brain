#!/usr/bin/env node
/**
 * Secret scan: command line entry point.
 * The scan logic and its rules are in scripts/secret-scan.mjs.
 *
 * The scan runs on the git repository that holds the current directory.
 * It prints the file, the line number and the pattern class of each
 * finding, never the matched text.
 *
 * Modes:
 *   node scripts/check-no-secrets.mjs
 *       Scan the current content of each tracked file.
 *   node scripts/check-no-secrets.mjs --range <from>..<to>
 *       Scan the added lines of each commit in the range (CI uses this).
 *   node scripts/check-no-secrets.mjs --pre-push <remote-name>
 *       Read the ref lines that git gives a pre-push hook on stdin, and scan
 *       the added lines of each commit that the push sends to that remote.
 *   node scripts/check-no-secrets.mjs --range <revision>
 *       A single revision (for example HEAD) scans its full history.
 *
 * Exit codes: 0 when nothing is found, 1 when the scan finds a value,
 * 2 when the scan can not run (for example, git is not available or a
 * range is not valid).
 *
 * This file has no import guard: it always runs the scan. A guard that
 * compares paths can fail on Windows or through a symbolic link, and then
 * the process exits 0 with no scan.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  ALLOW_FILE,
  formatFinding,
  readAllowList,
  scanCommits,
  scanRepository,
} from "./secret-scan.mjs";

/** A SHA of only zeros means "no commit" in the pre-push input. */
const ZERO_SHA = /^0+$/;

/**
 * Turn the pre-push stdin text into a list of git revision argument lists.
 * Each input line is: <local ref> <local sha> <remote ref> <remote sha>.
 */
function prePushRanges(stdinText, remoteName) {
  const ranges = [];
  for (const line of stdinText.split(/\r?\n/)) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/);
    if (!localSha || ZERO_SHA.test(localSha)) continue; // a deleted branch sends no commit
    if (!remoteSha || ZERO_SHA.test(remoteSha)) {
      // A new branch: scan each commit that this remote does not have yet.
      // Only this remote counts: a commit on another remote (for example a
      // private one) is still new to this remote. With no remote name, scan
      // the full history of the branch.
      ranges.push(remoteName ? [localSha, `--not`, `--remotes=${remoteName}`] : [localSha]);
    } else {
      ranges.push([`${remoteSha}..${localSha}`]);
    }
  }
  return ranges;
}

function main() {
  const args = process.argv.slice(2);
  // The repository root is the top folder of the git repository that holds the current directory.
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

  let findings;
  let summary;
  if (args[0] === "--range" && args[1]) {
    const result = scanCommits(root, [args[1]], readAllowList(root));
    findings = result.findings;
    summary = `${result.commitCount} commit(s) in ${args[1]}`;
  } else if (args[0] === "--pre-push") {
    const allowed = readAllowList(root);
    findings = [];
    let commits = 0;
    for (const revArgs of prePushRanges(readFileSync(0, "utf8"), args[1])) {
      const result = scanCommits(root, revArgs, allowed);
      findings.push(...result.findings);
      commits += result.commitCount;
    }
    summary = `${commits} pushed commit(s)`;
  } else if (args.length === 0) {
    const result = scanRepository(root);
    findings = result.findings;
    summary = `${result.fileCount} tracked files`;
    // A stale allow entry is a warning only: it permits nothing today.
    for (const entry of result.staleAllowEntries) {
      console.error(`Warning: ${ALLOW_FILE} entry "${entry}" names a file that git does not track.`);
    }
  } else {
    throw new Error(`unknown arguments: ${args.join(" ")}. Use no argument, --range <from>..<to>, or --pre-push.`);
  }

  if (findings.length === 0) {
    console.log(`Secret scan: OK (${summary}).`);
    return 0;
  }
  console.error(`Secret scan: ${findings.length} finding(s) in ${summary}. The matched text is not printed.`);
  for (const f of findings) console.error(`  ${formatFinding(f)}`);
  console.error(`If a finding is a false positive, add an entry to ${ALLOW_FILE} (see the comment in scripts/secret-scan.mjs).`);
  return 1;
}

let code;
try {
  code = main();
} catch (err) {
  console.error(`Secret scan could not run: ${err.message}`);
  code = 2;
}
process.exit(code);
