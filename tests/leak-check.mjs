/**
 * Answer-key sweep for the whole tree, run from the shell: node tests/leak-check.mjs
 *
 * The browser suite carries the same guard (tests/cases/ciphers.js) and is the one
 * that runs on every push, but a page cannot list a directory: it can only fetch the
 * files its test thought to name. That is how an answer once sat inside the suite's
 * own source while the guard that was written to catch it stayed green. This script
 * closes the rest of the tree — education prose, a docs page, a stylesheet nobody
 * thought to fetch — because the shell can list the whole tree, committed and
 * work-in-progress alike, which is how a leak gets caught before its commit.
 *
 * It hunts only what has no legal home anywhere: the six decoded flags and the joined
 * FLAG-01 credential. The four FLAG-01 *fragments* are deliberately excluded; they
 * are the puzzle, and each one lives in plaintext on exactly one surface, which
 * FRAGMENT_SURFACES in the browser suite pins file by file. Decoding a fragment here
 * would mean writing down where answers are allowed, and two copies of that list
 * would drift.
 *
 * Both guards have to hunt the same strings, and both read them out of the one module,
 * `./answer-key.js`. A `package.json` in this directory says "type": "module", which is
 * what lets a `.js` file be an ES module for Node and stay a `.js` file for the browser —
 * see the header of tests/answer-key.js for the shape `.mjs` could not fit.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { answers } from "./answer-key.js";

/**
 * Everything Git can see, committed or not: `git ls-files -o` adds the work in progress that has
 * no commit yet, which is exactly when a leak gets written, and `--exclude-standard` keeps
 * `.gitignore`d paths out. So a run here covers the same ground CI will, one commit earlier.
 */
function sweptFiles() {
	const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
	return listed.split("\0").filter(Boolean);
}

const wanted = answers();
const files = process.argv[2] ? process.argv.slice(2) : sweptFiles();
const leaks = [];

for (const path of files) {
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		// Deleted from the index but not the worktree, or unreadable: not a leak.
		continue;
	}
	for (const [name, answer] of wanted) {
		const at = text.indexOf(answer);
		if (at >= 0) leaks.push(`${name} is readable in ${path} at offset ${at}`);
	}
}

if (leaks.length) {
	console.error(`leak check: ${leaks.length} answer${leaks.length === 1 ? "" : "s"} readable in the tree`);
	for (const leak of leaks) console.error(`  ${leak}`);
	console.error(`  scanned ${files.length} file${files.length === 1 ? "" : "s"} against ${wanted.length} answers`);
	process.exitCode = 1;
} else {
	console.log(`leak check: no decoded answer appears in ${files.length} files`);
}
