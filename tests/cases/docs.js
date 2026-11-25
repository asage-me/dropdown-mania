/**
 * The prose that describes the code.
 *
 * Every count in this project is derived from data except the ones in the
 * README, and the README went stale twice: the record book announced nine
 * records while listing seventeen. These tests exist so it can only ever be
 * stale in a way that fails something.
 */

import { assert, fetchText, freshModule, suite, test } from "../harness.js";

/** Rows of a markdown table under the heading that contains `needle`. */
function tableRows(markdown, needle, column = 0) {
	const lines = markdown.split(/\r?\n/);
	const start = lines.findIndex((line) => /^#{2,3}\s/.test(line) && line.includes(needle));
	if (start === -1) throw new Error(`no heading containing "${needle}"`);
	const rows = [];
	for (let i = start + 1; i < lines.length; i += 1) {
		const line = lines[i].trim();
		if (/^#{2,3}\s/.test(line)) break;
		if (!line.startsWith("|")) continue;
		const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
		if (cells.length < 2 || /^[-\s|]+$/.test(line)) continue;
		if (/^Accession$/.test(cells[0])) continue;
		rows.push(cells[column]);
	}
	return rows;
}

suite("documentation stays true to the code", () => {
	test("the README lists exactly the records that exist, and no longer claims a number it spelled out", async () => {
		const readme = await fetchText("README.md");
		const { list } = await freshModule("js/core/achievements.js");
		const documented = tableRows(readme, "## Records");
		const real = list().map((record) => record.accession);

		assert.eq(documented.length, real.length, `README documents ${documented.length} records, the catalogue has ${real.length}`);
		for (const accession of real) assert.includes(documented.join(","), accession);
		for (const id of list().map((record) => record.id)) {
			assert.notMatch(readme, new RegExp(`\\b${id}\\b`), "the README should name accessions, not internal ids");
		}
	});

	test("the record book counts itself rather than hard-coding a word", async () => {
		const palette = await fetchText("js/ui/palette.js");
		assert.includes(palette, "records.length", "the lead must be counted, not spelled");
		assert.notMatch(palette, /records__lead">[A-Za-z0-9]+ records/, "a literal count came back");
	});

	test("the headline exhibit count matches the catalogue the palette actually builds", async () => {
		const readme = await fetchText("README.md");
		const index = await (await freshModule("js/core/catalogue.js")).getCatalogue();
		const claimed = Number(readme.match(/\*\*(\d+) exhibits/)?.[1]);
		assert.ok(claimed, "the README no longer states an exhibit count");
		assert.eq(claimed, index.length, `README claims ${claimed} exhibits, the markup holds ${index.length}`);
	});

	test("every accession in the catalogue is unique and every route is addressable", async () => {
		const index = await (await freshModule("js/core/catalogue.js")).getCatalogue();
		assert.eq(new Set(index.map((entry) => entry.accession)).size, index.length, "two exhibits share an accession");
		for (const entry of index) {
			assert.match(entry.route, /^\//, `${entry.accession} has no route`);
			assert.ok(entry.title.length > 1, `${entry.accession} has no title`);
		}
	});

	test("the README documents every game and every wing the catalogue reports", async () => {
		const readme = await fetchText("README.md");
		const index = await (await freshModule("js/core/catalogue.js")).getCatalogue();
		for (const entry of index) {
			assert.includes(readme, entry.accession, `${entry.accession} (${entry.title}) is missing from the README`);
		}
	});

	/**
	 * DD-013's row spells two counts out in prose, which makes them the last hand
	 * -maintained game facts in this file: how many flags there are, and how many
	 * surfaces the first flag's credential is split across. Both are data in
	 * js/games/hacker-flags.js, and a fifth surface quietly added there would leave
	 * the README describing a game with one fewer hiding place than it has.
	 */
	test("the README's hacker row still counts the flags and the surfaces right", async () => {
		const readme = await fetchText("README.md");
		const { FLAG_COUNT, FRAGMENTS } = await freshModule("js/games/hacker-flags.js");
		const row = readme.split(/\r?\n/).find((line) => line.includes("| DD-013 |"));
		assert.ok(row, "README.md no longer has a DD-013 row to read the counts from");
		const spelled = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
		assert.ok(Math.max(FLAG_COUNT, FRAGMENTS.length) < spelled.length, "this test needs more number words");
		assert.match(row, new RegExp(`${spelled[FLAG_COUNT]} flags\\b`, "i"), `the board holds ${FLAG_COUNT} flags and the README spells a different number`);
		assert.includes(row, `${spelled[FRAGMENTS.length]} devtools surfaces`, `the credential is split across ${FRAGMENTS.length} surfaces, and the README says otherwise`);
	});

	test("the wing blurbs on the home page still describe three wings", async () => {
		const home = await fetchText("home.html");
		const { WINGS } = await freshModule("js/core/catalogue.js");
		for (const wing of WINGS) {
			assert.includes(home, `data-wing="${wing.id}"`, `home.html dropped the ${wing.name} card`);
		}
		assert.eq(home.match(/class="wing"/g)?.length ?? home.match(/<a class="wing"/g)?.length, WINGS.length);
	});

	test("no shipped file still advertises the single-password version of the hacker puzzle", async () => {
		const files = ["README.md", "home.html", "games.html", "js/games/hacker.js", "js/core/achievements.js"];
		for (const file of files) {
			const source = await fetchText(file);
			assert.notMatch(source, /hidden password/i, `${file} still describes one password, not six flags`);
		}
	});

	/**
	 * A hash is either a route or an in-page anchor, and both halves have to be
	 * true in the markup: `#/…` must be a route the router knows, and a bare
	 * fragment must name an id in the same file, or the click does nothing at all.
	 * The exhibit index used to be entirely the second kind and read as broken.
	 */
	test("every fragment link is either a real route or a real anchor", async () => {
		const files = ["index.html", "home.html", "education.html", "games.html", "retro-1999.html"];
		const catalogue = await freshModule("js/core/catalogue.js");
		const index = await catalogue.getCatalogue();
		// The router's own vocabulary: `#/` is home, every registered mode owns
		// `#/<id>`, and every exhibit owns the route written in its markup.
		const { modes } = await freshModule("js/core/modes.js");
		const knownRoutes = new Set([
			"#/",
			...Object.keys(modes).map((id) => `#/${id}`),
			...index.map((entry) => `#${entry.route}`),
		]);

		for (const file of files) {
			const html = await fetchText(file);
			for (const [, fragment] of html.matchAll(/href="#([^"]*)"/g)) {
				if (fragment.startsWith("/")) {
					const href = `#${fragment}`;
					assert.ok(knownRoutes.has(href), `${file} links to ${href}, which no mode or exhibit registers`);
					continue;
				}
				assert.ok(html.includes(`id="${fragment}"`), `${file} links to #${fragment}, which no element in that file is named`);
			}
		}
	});

	test("the exhibit index links are routes, so reading a wing survives using them", async () => {
		const education = await fetchText("education.html");
		const index = await (await freshModule("js/core/catalogue.js")).getCatalogue();
		const exhibits = index.filter((entry) => entry.wingId === "education");
		const links = [...education.matchAll(/class="index__link" href="([^"]+)"/g)].map((match) => match[1]);

		assert.eq(links.length, exhibits.length, "the exhibit index and the catalogue disagree about how many exhibits there are");
		for (const entry of exhibits) {
			assert.includes(links.join(","), `#${entry.route}`, `${entry.accession} is missing from the index`);
		}
	});
});
