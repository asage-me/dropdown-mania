/**
 * DD-013 — the ciphers, and the one promise the exhibit makes to the player:
 * that reading the source is not the same as solving it.
 *
 * The plaintexts are never written in this file. Each is recovered at run time
 * by applying the inverse cipher to the shipped payload, which is exactly what
 * the player is supposed to do — and it means the suite cannot become the
 * answer key it is testing against.
 */

import * as mod from "../../js/games/hacker-flags.js";
import { assert, fetchText, suite, test } from "../harness.js";
import { DECODE as decode } from "../answer-key.js";

/** A decoded flag is used inside a RegExp, and a flag is full of regex syntax. */
function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/**
 * hacker-flags.js is pure — ciphers over constants, nothing to reset — so it is
 * imported once, statically. A fresh instance per test would buy nothing, and a
 * computed dynamic import hides the dependency from everyone reading the file,
 * including the tooling that reports these ciphers as having no consumers.
 */
/**
 * How to undo each flag, given only the exported ciphers — which is the same table the shell
 * sweep hunts with, imported from tests/answer-key.js rather than copied into this file. The
 * copy was never harmless: two tables are two guards that can quietly hunt different strings,
 * and the one thing standing between that and a clean report was a test reading both files as
 * text. One `.js` file answers both runtimes now, because `tests/package.json` says
 * `"type": "module"`; its own header records the shape `.mjs` could not fit.
 */

/**
 * Every file the site serves for this exhibit, plus the suite's own files.
 *
 * The suite's files are in scope on purpose: under the deployment in
 * `.github/workflows/ci.yml` the whole tree is published and `/tests/` is served,
 * so an answer written into a test case is exactly as public as one written into
 * `games.html`. A browser has no directory listing, so the test-case list is read
 * out of the suite's own loader rather than maintained a second time here — the
 * loader is the thing that would go stale, and this way it fails the sweep
 * instead of quietly narrowing it.
 */
let sweptSources = null;

/**
 * Where a specifier found inside `from` points, relative to the repo root. A query
 * is a cache-buster (`?test=7`) and carries no meaning here, so `URL` drops it into
 * `search` and only the pathname is kept.
 */
function resolvePath(from, spec) {
	if (/^(https?:)?\/\//.test(spec) || spec.startsWith("data:") || spec.startsWith("#")) return null;
	const base = `http://repo.test/${from}`;
	const resolved = new URL(spec.startsWith("./") || spec.startsWith("/") ? spec : `./${spec}`, base);
	if (resolved.origin !== "http://repo.test") return null;
	return decodeURIComponent(resolved.pathname.replace(/^\//, ""));
}

/** Import specifiers written as plain strings: `from "…"`, `import "…"`, `import("…")`. */
function moduleSpecs(text) {
	const specs = [];
	for (const pattern of [/\bfrom\s+"([^"]+)"/g, /\bimport\s+"([^"]+)"/g, /\bimport\(\s*"([^"]+)"\s*\)/g]) {
		for (const match of text.matchAll(pattern)) specs.push(match[1]);
	}
	return specs;
}

/**
 * Every file one file pulls in. In markup that is a stylesheet `href`, a module
 * `src`, the `modulepreload` links that declare the exhibits loaded by `import()`
 * — a crawl following only `src` never reaches a single game module — and the
 * imports written inside an inline `<script type="module">`, which is how this
 * suite's own loader names its case files. In a module it is its imports.
 */
function dependenciesOf(path, text) {
	const specs = [];
	if (path.endsWith(".html")) {
		for (const match of text.matchAll(/<(?:link|script)\b[^>]+(?:href|src)="([^"]+\.js(?:\?[^"]*)?)"[^>]*>/gi)) specs.push(match[1]);
		for (const match of text.matchAll(/<link\b[^>]+href="([^"]+\.css(?:\?[^"]*)?)"[^>]*>/gi)) specs.push(match[1]);
		for (const match of text.matchAll(/<script\b[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/gi)) specs.push(...moduleSpecs(match[1]));
	}
	specs.push(...moduleSpecs(text));
	return specs.map((spec) => resolvePath(path, spec)).filter(Boolean);
}

/**
 * Crawl the tree outward from the files the app starts with, rather than trusting a
 * hand-typed list of names: the whole file list was once the guard's weak point, and
 * an answer parked in a stylesheet nobody thought to fetch stayed invisible to a
 * sweep that listed exactly eleven files.
 *
 * A page cannot list a directory, so the crawl follows what the files themselves
 * reference — link/script tags out of the markup, imports out of the modules, and the
 * suite's own loader out of `tests/index.html`. Everything the site actually loads is
 * therefore swept by construction: adding a stylesheet or a test case adds it here.
 * Files nothing imports (a stray notes file) are outside a browser's reach, which is
 * what `node tests/leak-check.mjs` covers from the shell instead.
 */
const SWEEP_SEEDS = [
	"index.html",
	"home.html",
	"games.html",
	"education.html",
	"retro-1999.html",
	"js/main.js",
	"tests/index.html",
	"README.md",
];

async function crawlServedTree() {
	const texts = new Map();
	const missing = [];
	const queue = [...SWEEP_SEEDS];
	while (queue.length) {
		const path = queue.shift();
		if (texts.has(path)) continue;
		try {
			texts.set(path, await fetchText(path));
		} catch {
			// A seed that 404s is the sweep losing coverage, so it fails the test
			// below; a dependency that 404s is the app's own broken link, which the
			// route smoke already reports.
			if (SWEEP_SEEDS.includes(path)) missing.push(path);
			continue;
		}
		queue.push(...dependenciesOf(path, texts.get(path)));
	}
	if (missing.length) throw new Error(`the leak sweep cannot read its own seeds: ${missing.join(", ")}`);
	return [...texts];
}

function shippedSources() {
	if (!sweptSources) sweptSources = crawlServedTree();
	return sweptSources;
}

/**
 * The fragments a player is meant to be able to read in each file, in the order
 * `FRAGMENTS` lists them. A fragment is a quarter of FLAG-01's answer, so this is
 * the answer key for the leak sweep: `games.html` legitimately carries two of the
 * four surfaces (the source comment and the data attribute), and the input
 * placeholder in `hacker.js` deliberately shows the credential's shape, which
 * names two more. Anything outside this table is a leak, and no single file may
 * hold all four however good its reasons.
 */
const FRAGMENT_SURFACES = new Map([
	["games.html", ["source", "dom"]],
	["css/games.css", ["css"]],
	["js/games/hacker.js", ["source", "console", "css"]],
]);

suite("games/hacker-flags.js — ciphers", () => {
	test("rot13 is its own inverse, so peeling a layer twice returns the original", async () => {
		// The shipped FLAG-06 plaintext is derived here rather than written down,
		// so this file stays out of the answer key it is testing against.
		const deep = decode.deep(mod.getFlag("deep").payload);
		assert.eq(mod.rot13(mod.rot13(deep)), deep);
		assert.notEq(mod.rot13(deep), deep, "ROT13 would not be a layer if it left the flag alone");
		assert.eq(mod.rot13(mod.rot13("Mixed Case 123!{}")), "Mixed Case 123!{}");
	});

	test("caesar round-trips for any shift, including negative and over-long ones", async () => {
		for (const shift of [-7, 0, 7, 13, 26, 33]) {
			assert.eq(mod.caesar(mod.caesar("AbZ xY9_{", shift), -shift), "AbZ xY9_{", `shift ${shift}`);
		}
	});

	test("caesar leaves non-letters alone, which is what keeps the braces readable", async () => {
		assert.eq(mod.caesar("flag{a_b}", 7), "mshn{h_i}");
	});

	test("toHex/fromHex round-trip across the whole printable range", async () => {
		const sample = String.fromCharCode(...Array.from({ length: 95 }, (_, i) => 32 + i));
		assert.eq(mod.fromHex(mod.toHex(sample)), sample);
		assert.match(mod.toHex("f"), /^[0-9a-f]+$/, "hex must be lower case and unpadded");
	});

	test("fromHex refuses ragged input instead of throwing or inventing a character", async () => {
		assert.eq(mod.fromHex("6f6"), null, "an odd number of digits is not hex");
		assert.eq(mod.fromHex("zz"), null, "non-hex digits are not hex");
		assert.eq(mod.fromHex(""), "", "empty input is empty output, not null");
		assert.eq(mod.fromHex("66 6c 61 67"), "flag", "spaces and colons are tolerated as separators");
	});

	test("base64 round-trips and reports failure as null", async () => {
		assert.eq(mod.fromB64(mod.toB64("flag{not_a_shipped_answer}")), "flag{not_a_shipped_answer}");
		assert.eq(mod.fromB64("!!!not base64!!!"), null);
	});
});

suite("games/hacker-flags.js — the six flags", () => {
	test("there are six, each with a distinct code, achievement and payload", async () => {
		assert.eq(mod.FLAG_COUNT, 6);
		assert.eq(new Set(mod.FLAGS.map((flag) => flag.id)).size, 6);
		assert.eq(new Set(mod.FLAGS.map((flag) => flag.code)).size, 6);
		assert.eq(new Set(mod.FLAGS.map((flag) => flag.achievement)).size, 6, "two flags sharing a record would make one unreachable");
		for (const flag of mod.FLAGS) {
			assert.ok(flag.brief.length > 40, `${flag.code} needs a brief a player can act on`);
			assert.ok(flag.key.length > 20, `${flag.code} needs a trail`);
		}
	});

	test("every flag accepts what its own cipher produces", async () => {
		for (const flag of mod.FLAGS) {
			const answer = decode[flag.id](flag.payload);
			assert.ok(typeof answer === "string" && answer.length, `${flag.code} must be decodable by the documented inverse`);
			assert.ok(flag.check(answer), `${flag.code} rejected its own decoded payload`);
		}
	});

	test("every flag rejects a near miss, so a record cannot be earned by luck", async () => {
		for (const flag of mod.FLAGS) {
			const answer = decode[flag.id](flag.payload);
			assert.notOk(flag.check(`${answer}x`), `${flag.code} accepted a padded guess`);
			assert.notOk(flag.check(answer.slice(0, -1)), `${flag.code} accepted a truncated guess`);
			assert.notOk(flag.check(""), `${flag.code} accepted the empty string`);
		}
	});

	test("surrounding whitespace is forgiven, since a copied string usually carries some", async () => {
		for (const flag of mod.FLAGS) {
			const answer = decode[flag.id](flag.payload);
			assert.ok(flag.check(`  ${answer}\n`), `${flag.code} rejected a guess with stray whitespace`);
		}
	});

	test("getFlag falls back to the first flag rather than undefined", async () => {
		assert.eq(mod.getFlag("no-such-flag").id, mod.FLAGS[0].id);
		assert.eq(mod.getFlag("hex").id, "hex");
	});

	test("the credential is exactly the four fragments, hyphenated, in page order", async () => {
		assert.eq(mod.FRAGMENTS.length, 4);
		const texts = mod.FRAGMENTS.map((fragment) => mod.decodeFragment(fragment));
		const readable = texts.every((text) => typeof text === "string" && text.length >= 3);
		assert.ok(readable, "a fragment that does not decode would put \"null\" in the credential");
		assert.eq(texts.join("-"), decode.credential());
		assert.eq(mod.CREDENTIAL, texts.join("-"), "the exported credential is not the four fragments");
		assert.ok(mod.FRAGMENTS.every((fragment) => fragment.where.length > 10), "every fragment has to say where it hides");
	});

	/**
	 * `guess.includes("")` is true of every guess, so a fragment that fails to
	 * decode has to stay unreadable rather than become empty: the js/ caller drops a
	 * fragment whose decode is not a string, and an empty one would credit all four
	 * on any submission.
	 */
	test("a fragment whose encoding is unreadable is reported as such, not as empty", async () => {
		const undecodable = mod.decodeFragment({ id: "broken", enc: "!!!" });
		assert.eq(undecodable, null, "junk decodes to null, like every other payload here");
		for (const fragment of mod.FRAGMENTS) {
			assert.ok(mod.decodeFragment(fragment), `${fragment.id} does not decode at all`);
		}
	});

	/**
	 * FLAG-01 is the flag with no cipher, which makes this module its own answer
	 * key unless the fragments are stored the way the other five are. An earlier
	 * build kept them in the clear as `text`, and a visitor who opened the file the
	 * brief tells them to open read the credential off the screen.
	 */
	test("the module that hides the credential never holds it in the clear", async () => {
		const source = await fetchText("js/games/hacker-flags.js");
		const texts = mod.FRAGMENTS.map((fragment) => mod.decodeFragment(fragment));
		for (const fragment of mod.FRAGMENTS) {
			assert.notOk("text" in fragment, `${fragment.id} stores its fragment as plaintext`);
			assert.notMatch(source, new RegExp(escapeRegExp(mod.decodeFragment(fragment))), `${fragment.id} is readable in the source`);
		}
		assert.ok(!source.includes(texts.join("-")), "the assembled credential is readable in the source");
	});

	/**
	 * The invariant the whole redesign rests on. If any of these strings ever
	 * reaches a shipped file, "view source" ends the exhibit and the six
	 * achievements become free.
	 *
	 * The joined credential is not enough to test for: `hacker.js`'s hint ladder
	 * once printed the four fragments comma-separated, which spells the same answer
	 * to a player and matches nothing here. So the sweep asks about material —
	 * every flag's plaintext and every fragment — file by file.
	 */
	test("no plaintext answer appears in any shipped file", async () => {
		const sources = await shippedSources();
		const answers = mod.FLAGS.map((flag) => decode[flag.id](flag.payload));
		const fragments = mod.FRAGMENTS.map((fragment) => mod.decodeFragment(fragment));

		for (const [path, source] of sources) {
			for (const answer of answers) {
				assert.notMatch(source, new RegExp(escapeRegExp(answer)), `a flag answer is readable in ${path}`);
			}
			// Four quarters on one page is the answer, however they are punctuated.
			const held = fragments.filter((text) => source.includes(text));
			assert.ok(held.length < fragments.length, `${path} spells out the whole credential`);
		}
	});

	/**
	 * The sweep's own coverage, pinned, because a guard that quietly reads less than
	 * it used to is worse than none. The list used to be eleven hand-typed names, and
	 * a flag answer pasted into `css/select.css` — a stylesheet the site really does
	 * serve — sat there with the suite reporting every test passing. A file only a
	 * crawl would think to fetch is therefore asserted by name: if the crawl narrows
	 * back to a list, this fails.
	 */
	test("the leak sweep crawls the files nobody thought to name", async () => {
		const sources = new Map(await shippedSources());
		// select.css and tokens.css: stylesheets a hand-list kept forgetting.
		// js/games/hacker.js: the exhibit the answer key is about, reached only through
		// the chain main.js → modes → games. tests/*: the suite's own source, which is
		// served under this deployment and once held the very answer the sweep hunts.
		for (const path of ["css/select.css", "css/tokens.css", "js/modes/education.js", "js/ui/scrollbar.js", "js/games/hacker.js", "tests/harness.js", "tests/cases/ciphers.js"]) {
			assert.ok(sources.has(path), `the sweep never reached ${path}; an answer parked there would be invisible`);
		}
		assert.ok(sources.size >= 30, `the sweep read only ${sources.size} files; it has narrowed away from the served tree`);
	});

	/**
	 * One answer list rather than two, so the two guards cannot hunt different strings by
 * construction. What can still go wrong is the import being dodged — a table re-inlined
 * here, or a `DECODE` grown inside the shell sweep — and the shared file losing the shape
 * that makes it readable to both runtimes. Neither is something `node --check` would
 * notice, so this reads the sources a browser can reach and says so out loud.
	 */
	test("both guards read one answer list", async () => {
		const [here, sweep, shared, typing] = await Promise.all([
			fetchText("tests/cases/ciphers.js"), fetchText("tests/leak-check.mjs"),
			fetchText("tests/answer-key.js"), fetchText("tests/package.json"),
		]);
		assert.includes(here, 'from "../answer-key.js"', "this file stopped importing the shared answer list");
		assert.includes(sweep, 'from "./answer-key.js"', "the shell sweep stopped reading the shared answer list");
		assert.includes(shared, "export const DECODE", "tests/answer-key.js no longer exports the list both guards hunt with");
		// `\w*` and `\s*` sit inside the words being hunted on purpose: spelled plainly, this
		// assertion's own line would match the pattern and the guard could never pass again.
		assert.notMatch(here, /decoder\w*For|DECODE\s*=\s*\{/, "a decoder table came back into the browser suite");
		assert.notMatch(sweep, /DECODE\s*=\s*\{/, "the shell sweep grew a decoder table of its own again");
		assert.eq(JSON.parse(typing).type, "module", "tests/package.json no longer says \"type\": \"module\", so Node reads this directory as CommonJS");

		// And the shared list has to cover the flags: a sweep that hunts nothing reports "clean".
		assert.eq(Object.keys(decode).sort().join(), mod.FLAGS.map((flag) => flag.id).sort().join(),
			"the shared answer list and the shipped flags no longer cover each other");
	});

	test("the four fragment surfaces all still exist, and are still the only ones", async () => {
		const sources = new Map(await shippedSources());
		const [source, dom, consoleFragment, cssFragment] = mod.FRAGMENTS.map((fragment) => mod.decodeFragment(fragment));
		assert.includes(sources.get("games.html"), `<!-- fragment 1 of 4 :: ${source} -->`, "the source-comment fragment moved");
		assert.includes(sources.get("games.html"), `data-hk-dom-clue="fragment 2 of 4 :: -${dom}-"`, "the data-attribute fragment moved");
		assert.includes(sources.get("js/games/hacker.js"), `fragment 3 of 4 :: ${consoleFragment}`, "the console fragment moved");
		assert.includes(sources.get("css/games.css"), `--hk-fragment: "${cssFragment}"`, "the CSS custom property fragment moved");

		for (const [path, text] of sources) {
			const found = mod.FRAGMENTS
				.filter((fragment) => text.includes(mod.decodeFragment(fragment)))
				.map((fragment) => fragment.id);
			assert.deepEq(found, FRAGMENT_SURFACES.get(path) ?? [], `${path} holds the wrong fragments`);
		}
	});

	/**
	 * The other half of the trail: what makes FLAG-03 solvable is written into the
	 * live DOM by the exhibit, not shipped in the markup, so the comment on `SHIFT`
	 * points at js/. Pinning it here means the surface can move as long as the
	 * comment moves with it.
	 */
	test("the Caesar shift is still handed to the player from the file that says so", async () => {
		const exhibit = await fetchText("js/games/hacker.js");
		const markup = await fetchText("games.html");
		assert.includes(exhibit, "dataset.hkShift", "the exhibit no longer writes the trail this module's comment points at");
		assert.notMatch(markup, /data-hk-shift/, "games.html now ships the key, so the comment about hacker.js is the stale half");
	});
});
