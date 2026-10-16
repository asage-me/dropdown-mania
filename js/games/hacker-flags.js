/**
 * DD-013 — the flags, and the ciphers that hide them.
 *
 * No plaintext answer is stored anywhere in this file. Every flag keeps only its
 * obfuscated form plus a `check` that applies the *same* transform to whatever
 * you typed and compares the result. "View source" therefore never hands over a
 * credential: the page holds the puzzle, not the solution. Decoding is the whole
 * game, and it has to be done by hand or with a console.
 *
 * The ciphers are exported pure and total so the test harness can pin them —
 * they are the one part of this exhibit worth testing in isolation, because a
 * wrong cipher would make a flag unsolvable rather than merely hard.
 */

/* ---------- ciphers ---------- */

/** Letter-only ROT13; punctuation and braces pass through. */
export function rot13(text) {
	return shiftAlpha(text, 13);
}

/** Letter-only Caesar shift. Negative shifts and shifts past 26 are fine. */
export function caesar(text, shift) {
	return shiftAlpha(text, shift);
}

function shiftAlpha(text, shift) {
	return text.replace(/[a-z]/gi, (char) => {
		const base = char <= "Z" ? 65 : 97;
		const offset = ((char.charCodeAt(0) - base + shift) % 26 + 26) % 26;
		return String.fromCharCode(offset + base);
	});
}

/** Lower-case hex, two digits per character, no separators. */
export function toHex(text) {
	return Array.from(text, (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

/** Inverse of toHex. Returns null rather than throwing on ragged input. */
export function fromHex(text) {
	const clean = text.replace(/[\s:]/g, "");
	if (!/^[\da-f]*$/i.test(clean) || clean.length % 2) return null;
	let out = "";
	for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
	return out;
}

/** Base64 of a latin-1 string, or null if the platform refuses it. */
export function toB64(text) {
	try {
		return btoa(text);
	} catch {
		return null;
	}
}

export function fromB64(text) {
	try {
		return atob(text.replace(/\s/g, ""));
	} catch {
		return null;
	}
}

export function reverse(text) {
	return Array.from(text).reverse().join("");
}

/* ---------- flag 01: the fragments, hidden in four devtools surfaces ---------- */

export const FRAGMENTS = [
	{ id: "source", text: "0P3N", where: "a comment in the HTML source" },
	{ id: "dom", text: "M4N", where: "the data-hk-dom-clue attribute on the terminal panel" },
	{ id: "console", text: "_3D", where: "the banner logged to the console when this exhibit loads" },
	{ id: "css", text: "51GN", where: "the --hk-fragment custom property in css/games.css" },
];

export const CREDENTIAL = FRAGMENTS.map((fragment) => fragment.text).join("-");

/* ---------- the flags ---------- */

/* Each ciphertext is named once and used twice — printed as the payload and
   compared by check — so the two can never drift apart and strand a flag. */
const B64_PACKET = "ZmxhZ3tiYXNlNjRfaXNfbm90X2VuY3J5cHRpb259";
const CAESAR_INTERCEPT = "mshn{rlf_pz_vu_aol_dpyl}";
const HEX_BYTES = "666c61677b62797465735f6e657665725f6c69657d";
const MIRRORED_NOTE = "}fqenjxpno_gv_qnre{tnys";
const DEEP_WRAP = "63336c756448746e64575679636c3935626d78795a575a6663584a795933303d";

/** The shift FLAG-03 needs. Mirrored by data-hk-shift in games.html — the trail. */
export const SHIFT = 7;

/**
 * `payload` is what the terminal prints — always the obfuscated form.
 * `check` normalises the guess the same way the payload was produced.
 * `key` is the trail: where the page leaves what the cipher needs.
 */
export const FLAGS = [
	{
		id: "credential",
		code: "FLAG-01",
		name: "The assembled credential",
		cipher: "Nothing encoded — four fragments, four surfaces",
		achievement: "hacker-granted",
		payload: null,
		brief: "One fragment in the HTML source, one in a data attribute on this panel, one logged to the console at load, one in a CSS custom property. Recover all four, then submit them in order, hyphenated.",
		key: "Right-click → View source, then inspect Elements, Console and Styles.",
		// Trimmed like every other flag: this answer is assembled by hand from four
		// places, so a stray space on the end is the normal way to get it wrong.
		normalise: (guess) => guess.trim().toUpperCase(),
		check: (guess) => guess.trim().toUpperCase() === CREDENTIAL,
	},
	{
		id: "base64",
		code: "FLAG-02",
		name: "The captured packet",
		cipher: "Base64",
		achievement: "hacker-base64",
		payload: B64_PACKET,
		brief: "A packet was lifted off the wire. It is only encoded, not encrypted — anyone who knows the alphabet can read it. Decode it and submit what you find.",
		key: "Base64 output is [A-Za-z0-9+/] with = padding. In a console: atob(\"…\").",
		normalise: (guess) => guess.trim(),
		check: (guess) => toB64(guess.trim()) === B64_PACKET,
	},
	{
		id: "caesar",
		code: "FLAG-03",
		name: "The shifted intercept",
		cipher: "Caesar, shift left in the page",
		achievement: "hacker-caesar",
		payload: CAESAR_INTERCEPT,
		brief: "A substitution this old is not a cipher, it is a habit. Every letter moved by the same amount; the amount is written somewhere in this document. Find it, shift back, submit.",
		key: "The shift is the data-hk-shift attribute on this panel. Read it, do not guess it.",
		normalise: (guess) => guess.trim(),
		check: (guess) => caesar(guess.trim(), SHIFT) === CAESAR_INTERCEPT,
	},
	{
		id: "hex",
		code: "FLAG-04",
		name: "The raw bytes",
		cipher: "Hexadecimal, one byte per pair",
		achievement: "hacker-hex",
		payload: HEX_BYTES,
		brief: "No alphabet here, just bytes spelled out in base 16. Pair them up, read each pair as a number, look that number up. Bytes do not lie and they do not hide.",
		key: "0x66 is f and 0x6c is l. The first pair already gives the game away.",
		normalise: (guess) => guess.trim(),
		check: (guess) => toHex(guess.trim()) === HEX_BYTES,
	},
	{
		id: "mirror",
		code: "FLAG-05",
		name: "The mirrored note",
		cipher: "ROT13, then reversed",
		achievement: "hacker-mirror",
		payload: MIRRORED_NOTE,
		brief: "Two cheap tricks stacked to look like one expensive one. The order matters: it was rotated first and only then turned around, so you undo them in the opposite order.",
		key: "Reverse the string, then ROT13 it. Rotating first would not open the braces.",
		normalise: (guess) => guess.trim(),
		check: (guess) => reverse(rot13(guess.trim())) === MIRRORED_NOTE,
	},
	{
		id: "deep",
		code: "FLAG-06",
		name: "Three layers deep",
		cipher: "ROT13 inside Base64 inside hex",
		achievement: "hacker-deep",
		payload: DEEP_WRAP,
		brief: "The last one is wrapped three times, and the wrapping order is the whole puzzle. Peel it hex, then base64, then ROT13 — inside out, the way it was put on.",
		key: "Hex decodes to base64 text; that base64 decodes to ROT13 text; that ROT13 is the flag.",
		normalise: (guess) => guess.trim(),
		check: (guess) => toHex(toB64(rot13(guess.trim())) ?? "") === DEEP_WRAP,
	},
];

export const FLAG_COUNT = FLAGS.length;

const BY_ID = new Map(FLAGS.map((flag) => [flag.id, flag]));

export function getFlag(id) {
	return BY_ID.get(id) || FLAGS[0];
}
