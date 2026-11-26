/**
 * What counts as an answer, for both guards that look for one.
 *
 * Two guards look for a flag answer lying around in the open: the browser suite reads
 * whatever a page can reach (tests/cases/ciphers.js), and `node tests/leak-check.mjs`
 * reads everything git can see. They have to agree on what they are hunting, so the
 * recipes live in this module, which each of them imports rather than copies.
 *
 * One module, imported twice, which took one file to unlock: this directory now holds a
 * `package.json` saying `"type": "module"`, and Node scopes `"type"` to the folder it
 * lives in (docs: "the nearest parent package.json",
 * nodejs.org/docs/latest-v24.x/api/packages.html), so `tests/*.js` are ES modules while
 * every other directory keeps Node's default CommonJS treatment.
 *
 * Before that, this file had to be `.mjs` for Node: a `.js` with no package.json to
 * declare its type loads as CommonJS and refuses its own `import`. And a `.mjs` cannot be
 * imported by a browser as this site is served, because `python -m http.server` answers
 * `.mjs` with the platform's registered type, which on Windows is `text/plain`
 * (HKCR\.mjs\Content Type, which overrides the map CPython ships with, and no http.server
 * flag overrides a single extension). A module script whose Content-Type is not a
 * JavaScript MIME type is dropped by the HTML spec, so `.js` works on both sides and
 * `.mjs` only on one.
 *
 * What remains CI-visible: `.github/workflows/ci.yml` syntax-checks each file by copying
 * it to a `.mjs` name first. Keep doing that. `node --check` on an *ambiguous* `.js` (ESM
 * syntax, no controlling type) is a weaker gate than it looks — nodejs/node#65202 reports
 * it exiting 0 on a file that does not parse — and Node's syntax detection, the thing that
 * lets a `.js` carrying `import` load with no package.json anywhere, is documented as
 * "1.2 - Release candidate" and only became default in v20.19.0 and v22.7.0. That is why
 * `"type": "module"` is spelled out here: explicit, no detection needed, and true since
 * Node 12.
 *
 * The plaintexts are computed rather than written down, from the shipped payloads and
 * the shipped ciphers, which is what lets either guard run without the repo containing
 * a file that is the answer key.
 *
 * js/games/hacker-flags.js is DOM-free by design (see its header), which is what lets
 * Node decode with the game's own transforms instead of a second copy of the ciphers
 * that could disagree with it.
 */

import {
	FLAGS, FRAGMENTS, SHIFT, caesar, decodeFragment, fromB64, fromHex, getFlag, reverse, rot13,
} from "../js/games/hacker-flags.js";

/**
 * One decoder per cipher. The game deliberately ships no solver — `flag.check` is a
 * predicate, not an answer, because a shipped answer key is the thing DD-013 is about
 * — so a checker that wants the plaintext has to run the ciphers itself. If a transform
 * is added to the game, this map needs it; `answers()` fails loudly rather than letting
 * a flag drop out of the hunt unnoticed.
 */
export const DECODE = {
	credential: () => FRAGMENTS.map((fragment) => decodeFragment(fragment)).join("-"),
	base64: (payload) => fromB64(payload),
	caesar: (payload) => caesar(payload, -SHIFT),
	hex: (payload) => fromHex(payload),
	mirror: (payload) => rot13(reverse(payload)),
	deep: (payload) => rot13(fromB64(fromHex(payload))),
};

/**
 * Everything a solved board would print, as `[flag code, plaintext]` pairs.
 *
 * Both guards branch on this list, so an empty or short entry would not weaken a
 * check, it would cancel one: a sweep that hunts nothing reports "clean". Hence the
 * two throws — a missing decoder and a decoder the game disagrees with are both
 * failures of the guard, not of the site.
 */
export function answers() {
	return FLAGS.map((flag) => {
		const decode = DECODE[flag.id];
		const answer = decode ? decode(getFlag(flag.id).payload) : null;
		if (typeof answer !== "string" || answer.length < 8) {
			throw new Error(`${flag.code}: DECODE has no working decoder for ${flag.id} (got ${typeof answer})`);
		}
		if (!flag.check(answer)) throw new Error(`${flag.code}: DECODE disagrees with the game's own check`);
		return [flag.code, answer];
	});
}
