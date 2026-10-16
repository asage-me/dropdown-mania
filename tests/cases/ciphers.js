/**
 * DD-013 — the ciphers, and the one promise the exhibit makes to the player:
 * that reading the source is not the same as solving it.
 *
 * The plaintexts are never written in this file. Each is recovered at run time
 * by applying the inverse cipher to the shipped payload, which is exactly what
 * the player is supposed to do — and it means the suite cannot become the
 * answer key it is testing against.
 */

import { assert, fetchText, freshModule, suite, test } from "../harness.js";

/** A decoded flag is used inside a RegExp, and a flag is full of regex syntax. */
function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** How to undo each flag, given only the exported ciphers. */function decoderFor({
	SHIFT, CREDENTIAL, rot13, caesar, toHex, fromHex, toB64, fromB64, reverse,
}) {
	return {
		credential: () => CREDENTIAL,
		base64: (payload) => fromB64(payload),
		caesar: (payload) => caesar(payload, -SHIFT),
		hex: (payload) => fromHex(payload),
		mirror: (payload) => rot13(reverse(payload)),
		deep: (payload) => rot13(fromB64(fromHex(payload))),
	};
}

async function ciphers() {
	const mod = await freshModule("js/games/hacker-flags.js");
	return { mod, decode: decoderFor(mod) };
}

suite("games/hacker-flags.js — ciphers", () => {
	test("rot13 is its own inverse, so peeling a layer twice returns the original", async () => {
		const { rot13 } = await freshModule("js/games/hacker-flags.js");
		assert.eq(rot13("flag{three_layers_deep}"), "synt{guerr_ynlref_qrrc}");
		assert.eq(rot13(rot13("Mixed Case 123!{}")), "Mixed Case 123!{}");
	});

	test("caesar round-trips for any shift, including negative and over-long ones", async () => {
		const { caesar } = await freshModule("js/games/hacker-flags.js");
		for (const shift of [-7, 0, 7, 13, 26, 33]) {
			assert.eq(caesar(caesar("AbZ xY9_{", shift), -shift), "AbZ xY9_{", `shift ${shift}`);
		}
	});

	test("caesar leaves non-letters alone, which is what keeps the braces readable", async () => {
		const { caesar } = await freshModule("js/games/hacker-flags.js");
		assert.eq(caesar("flag{a_b}", 7), "mshn{h_i}");
	});

	test("toHex/fromHex round-trip across the whole printable range", async () => {
		const { toHex, fromHex } = await freshModule("js/games/hacker-flags.js");
		const sample = String.fromCharCode(...Array.from({ length: 95 }, (_, i) => 32 + i));
		assert.eq(fromHex(toHex(sample)), sample);
		assert.match(toHex("f"), /^[0-9a-f]+$/, "hex must be lower case and unpadded");
	});

	test("fromHex refuses ragged input instead of throwing or inventing a character", async () => {
		const { fromHex } = await freshModule("js/games/hacker-flags.js");
		assert.eq(fromHex("6f6"), null, "an odd number of digits is not hex");
		assert.eq(fromHex("zz"), null, "non-hex digits are not hex");
		assert.eq(fromHex(""), "", "empty input is empty output, not null");
		assert.eq(fromHex("66 6c 61 67"), "flag", "spaces and colons are tolerated as separators");
	});

	test("base64 round-trips and reports failure as null", async () => {
		const { toB64, fromB64 } = await freshModule("js/games/hacker-flags.js");
		assert.eq(fromB64(toB64("flag{bytes_never_lie}")), "flag{bytes_never_lie}");
		assert.eq(fromB64("!!!not base64!!!"), null);
	});
});

suite("games/hacker-flags.js — the six flags", () => {
	test("there are six, each with a distinct code, achievement and payload", async () => {
		const { mod } = await ciphers();
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
		const { mod, decode } = await ciphers();
		for (const flag of mod.FLAGS) {
			const answer = decode[flag.id](flag.payload);
			assert.ok(typeof answer === "string" && answer.length, `${flag.code} must be decodable by the documented inverse`);
			assert.ok(flag.check(answer), `${flag.code} rejected its own decoded payload`);
		}
	});

	test("every flag rejects a near miss, so a record cannot be earned by luck", async () => {
		const { mod, decode } = await ciphers();
		for (const flag of mod.FLAGS) {
			const answer = decode[flag.id](flag.payload);
			assert.notOk(flag.check(`${answer}x`), `${flag.code} accepted a padded guess`);
			assert.notOk(flag.check(answer.slice(0, -1)), `${flag.code} accepted a truncated guess`);
			assert.notOk(flag.check(""), `${flag.code} accepted the empty string`);
		}
	});

	test("surrounding whitespace is forgiven, since a copied string usually carries some", async () => {
		const { mod, decode } = await ciphers();
		for (const flag of mod.FLAGS) {
			const answer = decode[flag.id](flag.payload);
			assert.ok(flag.check(`  ${answer}\n`), `${flag.code} rejected a guess with stray whitespace`);
		}
	});

	test("getFlag falls back to the first flag rather than undefined", async () => {
		const { mod } = await ciphers();
		assert.eq(mod.getFlag("no-such-flag").id, mod.FLAGS[0].id);
		assert.eq(mod.getFlag("hex").id, "hex");
	});

	test("the credential is exactly the four fragments, hyphenated, in page order", async () => {
		const { mod } = await ciphers();
		assert.eq(mod.FRAGMENTS.length, 4);
		assert.eq(mod.CREDENTIAL, mod.FRAGMENTS.map((f) => f.text).join("-"));
		assert.ok(mod.FRAGMENTS.every((f) => f.where.length > 10), "every fragment has to say where it hides");
	});

	/**
	 * The invariant the whole redesign rests on. If any of these strings ever
	 * reaches a shipped file, "view source" ends the exhibit and the six
	 * achievements become free.
	 */
	test("no plaintext answer appears in any shipped file", async () => {
		const { mod, decode } = await ciphers();
		const sources = await Promise.all([
			fetchText("js/games/hacker-flags.js"),
			fetchText("js/games/hacker.js"),
			fetchText("js/core/achievements.js"),
			fetchText("games.html"),
			fetchText("css/games.css"),
		]);
		for (const flag of mod.FLAGS) {
			const answer = decode[flag.id](flag.payload);
			sources.forEach((source, index) => {
				assert.notMatch(source, new RegExp(escapeRegExp(answer)), `flag ${flag.code} is readable in shipped file ${index}`);
			});
		}
	});

	test("the four fragment surfaces all still exist in the shipped files", async () => {
		const { mod } = await ciphers();
		const html = await fetchText("games.html");
		const css = await fetchText("css/games.css");
		const js = await fetchText("js/games/hacker.js");

		const [source, dom, consoleFragment, cssFragment] = mod.FRAGMENTS.map((f) => f.text);
		assert.includes(html, `<!-- fragment 1 of 4 :: ${source} -->`, "the source-comment fragment moved");
		assert.includes(html, `data-hk-dom-clue="fragment 2 of 4 :: -${dom}-"`, "the data-attribute fragment moved");
		assert.includes(js, `fragment 3 of 4 :: ${consoleFragment}`, "the console fragment moved");
		assert.includes(css, `--hk-fragment: "${cssFragment}"`, "the CSS custom property fragment moved");
	});
});
