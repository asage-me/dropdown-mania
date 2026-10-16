/**
 * The record book. Worth testing because it is the only place the three wings
 * share state, and because a record that cannot be earned is worse than no
 * record at all — the games reference these ids as bare strings.
 */

import { assert, freshModule, suite, test } from "../harness.js";

suite("core/achievements.js", () => {
	test("every accession is unique and runs AC-01 upward with no gaps", async () => {
		const { list } = await freshModule("js/core/achievements.js");
		const accessions = list().map((record) => record.accession);
		assert.eq(new Set(accessions).size, accessions.length, "two records share an accession");
		accessions.forEach((accession, index) => {
			assert.eq(accession, `AC-${String(index + 1).padStart(2, "0")}`, "accessions must be dense, in order");
		});
	});

	test("every record has a title and a note a player can read", async () => {
		const { list } = await freshModule("js/core/achievements.js");
		for (const record of list()) {
			assert.ok(record.title.length > 2, `${record.id} has no title`);
			assert.ok(record.note.length > 12, `${record.id} has no usable note`);
			assert.notOk(record.unlocked, "a fresh run starts with nothing earned");
		}
	});

	test("unlocking is one-way: the second call reports nothing new", async () => {
		const { unlock, unlockedCount } = await freshModule("js/core/achievements.js");
		assert.eq(unlock("path-first"), true);
		assert.eq(unlock("path-first"), false, "a repeat unlock would re-toast the same record");
		assert.eq(unlockedCount(), 1);
	});

	test("an unknown id is ignored rather than invented", async () => {
		const { unlock, unlockedCount } = await freshModule("js/core/achievements.js");
		assert.eq(unlock("no-such-record"), false);
		assert.eq(unlockedCount(), 0);
	});

	test("progress survives a reload, which is what a fresh module instance reads", async () => {
		const first = await freshModule("js/core/achievements.js");
		first.unlock("hacker-hex");
		const second = await freshModule("js/core/achievements.js");
		assert.eq(second.unlockedCount(), 1, "a re-import reads storage, exactly as a page reload does");
		assert.ok(second.list().find((record) => record.id === "hacker-hex").unlocked);
	});

	test("unlocking announces itself on the document so other UI can react", async () => {
		const { unlock } = await freshModule("js/core/achievements.js");
		const seen = [];
		const listener = (event) => seen.push(event.detail.id);
		document.addEventListener("archive:achievement", listener);
		try {
			unlock("wing-visitor");
		} finally {
			document.removeEventListener("archive:achievement", listener);
		}
		assert.deepEq(seen, ["wing-visitor"]);
	});

	/**
	 * The games name these ids as plain strings, so a typo is invisible until
	 * somebody earns it. Pinning the set catches a rename on either side.
	 */
	test("every id the games ask for actually exists", async () => {
		const { list } = await freshModule("js/core/achievements.js");
		const { FLAGS } = await freshModule("js/games/hacker-flags.js");
		const known = new Set(list().map((record) => record.id));
		for (const id of [
			"path-first", "path-advanced", "path-catalogue",
			"lazy-1k", "lazy-tier-5", "lazy-jackpot",
			"edu-complete", "wing-visitor", "retro-signed",
			"hacker-all-clues", "hacker-all",
			...FLAGS.map((flag) => flag.achievement),
		]) {
			assert.ok(known.has(id), `no record is registered under "${id}"`);
		}
	});
});
