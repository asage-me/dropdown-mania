/**
 * DD-013 — Hacker Puzzle.
 *
 * Six flags, six ways of hiding a string: devtools archaeology, base64, a Caesar
 * shift whose key is left in the page, raw hex, ROT13 reversed, and all three
 * stacked. The data and the ciphers live in hacker-flags.js; nothing there holds
 * a plaintext answer, so the source is a puzzle rather than an answer key.
 *
 * Two things the original got wrong and this file fixes. It stored the whole
 * password in one JS constant — now only ciphertexts exist — and it re-attached
 * its submit listener on every tab click, so the first tab switch doubled the
 * handlers. Listeners are bound once here and removed in unmount().
 *
 * The rain is the exhibit's identity, not a decoration on the whole site: it runs
 * only while this exhibit is on screen, and never under prefers-reduced-motion.
 */

import { enhanceSelects, refreshSelect } from "../ui/select.js";
import { createRain } from "../ui/rain.js";
import { loadMerged, save } from "../lib/store.js";
import { FLAGS, FLAG_COUNT, FRAGMENTS, SHIFT, decodeFragment, getFlag } from "./hacker-flags.js";

const STORE_KEY = "hacker";

/** Last-resort hints, a few rungs per flag: where to look, then the exact command.
 *  Every rung but the deepest names a surface without reciting what the surface
 *  holds, and the deepest rung unlocks only after two misses on that flag.
 *
 *  FLAG-01's last rung recites the four fragments, on purpose and by the author's
 *  call: fragments 3 and 4 live in a console line and a CSS custom property, so a
 *  visitor with no way to open devtools has no other route through the capstone —
 *  and the flag is required to finish the exhibit. The other five ladders already
 *  end the same way, in the console line that decodes the flag. Deleting this rung
 *  is what CR-01 did and it broke the game; tests/cases/hacker.js now pins both
 *  halves, that no earlier rung says a fragment and that this one still does. */
const HINTS = {
	credential: [
		"Four fragments, hyphenated, in the order the page numbers them. Start with the source: right-click → View source.",
		"Fragment 1 is an HTML comment in games.html. Fragment 2 is data-hk-dom-clue on the terminal panel.",
		"Two more: one is logged to the console the moment this exhibit mounts. Reload with the console open.",
		"The last never renders. Select the terminal panel and read --hk-fragment in the Styles pane.",
		// Joined when the rung is built, not written down, so the shipped file keeps
		// the fragments exactly as encoded as the five ciphertexts are.
		`The fragments are ${FRAGMENTS.map((fragment) => decodeFragment(fragment)).join(", ")}. It is still your job to type them in order.`,
	],
	base64: [
		"Base64 uses A–Z, a–z, 0–9, + and / with = padding. This payload is all of those.",
		"Open the console and run: atob(\"ZmxhZ3tiYXNlNjRfaXNfbm90X2VuY3J5cHRpb259\")",
	],
	caesar: [
		"Every letter moved by one fixed amount. Find the amount and shift back.",
		"The amount is on the terminal panel: data-hk-shift. Try each letter of the payload shifted by it.",
		`Console: "mshn{rlf_pz_vu_aol_dpyl}".replace(/[a-z]/g, c => String.fromCharCode(((c.charCodeAt(0)-97-${SHIFT}+26)%26)+97))`,
	],
	hex: [
		"Two hex digits per character. Split the payload into pairs.",
		"0x66 = 102 = f. Console: \"666c61677b62797465735f6e657665725f6c69657d\".match(/../g).map(h => String.fromCharCode(parseInt(h, 16))).join(\"\")",
	],
	mirror: [
		"Two transforms, and the order you undo them in matters.",
		"It was rotated, then reversed — so reverse first, then ROT13. Reversing the payload starts with the closing brace, which is where a flag ends.",
		"Console: reverse it, then rot13 the result.",
	],
	deep: [
		"Three layers. The outside is hex — pairs of [0-9a-f] and nothing else.",
		"Peel hex first. What comes out is base64 (it ends in =). Peel that too.",
		"What survives base64 is readable English with the letters scrambled — that is ROT13. Peel it last.",
	],
};

/* Which FLAG-01 rung hands over which fragment, by index. Values are fragment ids
   and nothing else — a rung that recites a fragment still keeps its content out of
   this table, where it would be an answer key. Rung 1 only says where to start, so
   it gives nothing; rungs 2, 3 and 4 each name the surface holding the fragment
   they credit; the bottom rung recites all four, so it hands over all four.
   Every other ladder gives nothing here, because no other flag has fragments.
   tests/cases/hacker.js walks the real ladder and asserts the clues in hand after
   each rung, so this table and the prose above cannot drift apart quietly. */
const RUNG_HANDOUTS = {
	credential: {
		1: ["source", "dom"],
		2: ["console"],
		3: ["css"],
		4: FRAGMENTS.map((fragment) => fragment.id),
	},
};

// Module scope, not mount scope: the console banner is once-per-page and the hint
// ladder survives moving between exhibits in the wing. `cleared` below persists;
// none of this does, so a reload always puts the ladder back at the first rung.
const state = {
	attempts: 0,
	// Per flag, because the ladder is a property of the flag you are failing. One
	// shared counter used to hand out hints on every other flag the moment a
	// visitor had struggled twice on any one of them.
	attemptsByFlag: {},
	// How deep into each flag's own ladder the visitor has been taken, for the same
	// reason. A single step meant the second flag you failed opened at its second
	// rung, and re-painting the target — which a solve does — reset the first flag
	// back to its first rung, so a stuck visitor could never reach the last one.
	rungsByFlag: {},
	found: new Set(),
	target: FLAGS[0].id,
	consoleShown: false,
};

/**
 * Put the run back the way a fresh page leaves it.
 *
 * Module scope is deliberate — the console banner is once per page and the hint ladder
 * has to survive walking out of the wing and back in — but it also means a second
 * mount of an already-imported module inherits the first mount's game. That is right
 * for a visitor and wrong for a case that means to start over, and until now the only
 * thing keeping cases independent was the harness's cache-busting import: luck rather
 * than design. This is the seam that makes it a decision. Mutated in place rather than
 * reassigned, because every closure in `mount` holds this object.
 *
 * Nothing on the site calls it: no UI path is a reset, and the cleared record in
 * storage is a different thing entirely, so it stays where it is. Its one consumer is
 * `tests/cases/hacker.js`, which reaches this module through the computed `import()` in
 * `tests/harness.js`, so there is no static edge for a dependency graph to find. The
 * suppression below is deliberate: graph-based Fallow cannot see that one call.
 */
// fallow-ignore-next-line unused-export
export function resetRunState() {
	Object.assign(state, {
		attempts: 0,
		attemptsByFlag: {},
		rungsByFlag: {},
		found: new Set(),
		target: FLAGS[0].id,
		consoleShown: false,
	});
	// The cleared record is read once at import, so a copy that has been around long
	// enough to solve a flag remembers it even after the storage behind it is gone. A
	// fresh page rereads storage, so this does too — which makes "which start do you
	// mean" answerable at all: clear `dropdown-archive:hacker`, then reset.
	const stored = loadMerged(STORE_KEY, { cleared: [] });
	record = { ...stored, cleared: readCleared(stored) };
}

// Which flags you have cleared outlives the page. Merged over the defaults, so
// adding this key needs no save-version bump — and bumping one would wipe
// everybody's Lazy Drop progress for an unrelated exhibit.
//
// The ids come back filtered against FLAGS. Storage is the one input this game
// cannot validate at a border, and an id the game no longer ships (a renamed flag,
// a hand-edited key) would leave `cleared` bigger than the six flags: the all-clear
// branch would stop matching and the line looking for the next unsolved flag would
// throw inside the submit handler.
const VALID_IDS = new Set(FLAGS.map((flag) => flag.id));

function readCleared(stored) {
	return Array.isArray(stored?.cleared) ? stored.cleared.filter((id) => VALID_IDS.has(id)) : [];
}

const saved = loadMerged(STORE_KEY, { cleared: [] });
let record = { ...saved, cleared: readCleared(saved) };

const cleared = () => new Set(record.cleared);

export default {
	id: "hacker",

	mount(root, api) {
		const terminal = root.querySelector("[data-hk-terminal]");
		const form = root.querySelector("[data-hk-form]");
		const input = root.querySelector("#hk-password");
		const result = root.querySelector("[data-hk-result]");
		const attemptsEl = root.querySelector("[data-hk-attempts]");
		const foundEl = root.querySelector("[data-hk-found]");
		const flagsEl = root.querySelector("[data-hk-flags]");
		const targetSelect = root.querySelector("[data-hk-flag]");
		const briefEl = root.querySelector("[data-hk-brief]");
		const payloadEl = root.querySelector("[data-hk-payload]");
		const clueList = root.querySelector("[data-hk-clues]");
		const clueRows = root.querySelectorAll("[data-clue]");
		const hintBtn = root.querySelector("[data-hk-hint]");
		// Once per visit, not once per page: the ladder itself outlives the mount, so
		// a visitor who comes back and climbs further hears it again.
		let noticeGiven = false;
		const rain = createRain(root.querySelector("[data-hk-rain]"));
		// Read live rather than cached at mount: the exhibit stays mounted while you
		// move between wings, so a value sampled once would go stale — and would keep
		// painting if the OS setting changed with the tab still open.
		const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const syncRain = () => (motionQuery.matches ? rain.stop() : rain.start());

		// The Caesar key, as a live attribute. FLAG-03's `key` text points players
		// here, and games.html deliberately does not carry it — an attribute that
		// survives "View source" would solve the flag — which is why the comment on
		// `SHIFT` points at this line and tests/cases/ciphers.js asserts it stays.
		terminal.dataset.hkShift = String(SHIFT);

		/* The console fragment: logged once per mount, never stacked. */
		if (!state.consoleShown) {
			console.log(
				"%c DD-013 · fragment 3 of 4 :: _3D ",
				"background:#14171a;color:#7fb4e5;font-family:monospace;padding:4px 8px;",
			);
			console.log(
				"%c Six flags are buried in this document. This is a fragment of one of them. ",
				"background:#14171a;color:#838c92;font-family:monospace;padding:2px 8px;",
			);
			state.consoleShown = true;
		}

		/* ---------- painting ---------- */

		function fillTargets() {
			targetSelect.innerHTML = "";
			const done = cleared();
			targetSelect.append(
				...FLAGS.map((flag) => new Option(`${flag.code} · ${flag.name}${done.has(flag.id) ? " ✓" : ""}`, flag.id)),
			);
			targetSelect.value = state.target;
		}

		function paintFlags() {
			const done = cleared();
			flagsEl.innerHTML = "";
			FLAGS.forEach((flag) => {
				const li = document.createElement("li");
				li.className = `flag${done.has(flag.id) ? " is-cleared" : ""}`;
				const mark = document.createElement("span");
				mark.className = "flag__mark";
				mark.setAttribute("aria-hidden", "true");
				const code = document.createElement("span");
				code.className = "flag__code";
				code.textContent = flag.code;
				const name = document.createElement("span");
				name.className = "flag__name";
				name.textContent = flag.name;
				const status = document.createElement("span");
				status.className = "flag__state";
				status.textContent = done.has(flag.id) ? "Recovered" : flag.cipher;
				li.append(mark, code, name, status);
				flagsEl.appendChild(li);
			});
			const countEl = root.querySelector("[data-hk-flags-cleared]");
			if (countEl) countEl.textContent = String(done.size);
		}

		function paintTarget() {
			const flag = getFlag(state.target);
			const done = cleared().has(flag.id);
			briefEl.textContent = flag.brief;
			// The payload line is terminal output, so it stays in character for the
			// one flag with nothing to print: FLAG-01 names its cipher rather than
			// giving the player browser instructions. The brief below already says
			// which four surfaces to search, and the hint ladder is where a
			// "right-click → View source" instruction belongs.
			payloadEl.textContent = flag.payload ? `${flag.cipher}: ${flag.payload}` : flag.cipher;
			payloadEl.hidden = false;
			clueList.hidden = flag.id !== "credential";
			input.placeholder = flag.id === "credential" ? "0P3N-…-51GN" : "flag{…}";
			form.querySelector(".auth__label").textContent = done
				? `Already recovered — ${flag.code}`
				: `Submit what ${flag.code} decodes to`;
			// The rung is deliberately not reset here. It belongs to the flag
			// (state.rungsByFlag), so switching targets to compare payloads cannot
			// quietly put a visitor back at rung 1 of the flag they were working on.
		}

		function paintClues() {
			clueRows.forEach((row) => {
				const isFound = state.found.has(row.dataset.clue);
				row.classList.toggle("is-found", isFound);
				row.querySelector(".clue__state").textContent = isFound ? "Recovered" : "Not found";
			});
			foundEl.textContent = String(state.found.size);
		}

		/** The fragments this guess contains — the one place that decodes them, so an
		 *  unreadable entry cannot match every guess the way an empty string would. */
		function matchedFragments(guess) {
			const upper = guess.toUpperCase();
			return FRAGMENTS.filter((fragment) => {
				const text = decodeFragment(fragment);
				return Boolean(text) && upper.includes(text);
			});
		}

		/** FLAG-01 is the only flag with fragments, and credit is honest: a fragment
		 *  counts as found once your guess actually contained it, or once a rung
		 *  named the surface hiding it (`handOver`, below). Call both for FLAG-01
		 *  alone — this board is FLAG-01's progress, so a guess aimed at another flag
		 *  must not light its rows or satisfy `hacker-all-clues` further down. */
		function credit(guess) {
			takeFragments(matchedFragments(guess).map((fragment) => fragment.id));
		}

		/**
		 * The one way a fragment gets onto the board, by id. Repainting and re-checking
		 * the clue record happen here rather than at each call site on purpose: a
		 * caller that added a fragment and forgot to paint left the rung handouts
		 * crediting clues the visitor could not see.
		 */
		function takeFragments(ids) {
			ids.forEach((id) => state.found.add(id));
			paintClues();
			checkAllClues();
		}

		/**
		 * AC-04 is about the clue set, so it follows the clues rather than the win:
		 * whoever has all four in hand — guessed, handed over by a rung, or carried in
		 * from a visit that already unlocked it — has what the badge is for. It used to
		 * be checked on one line inside the winning submit, which made it impossible
		 * for it to mean anything AC-03 had not already meant.
		 */
		function checkAllClues() {
			if (state.found.size >= FRAGMENTS.length) api.unlock("hacker-all-clues");
		}

		/**
		 * Take a rung's effect, which is inseparable from displaying it: the fragments
		 * it names go on the board, and the first time the ladder gives anything away
		 * the terminal says so in plain words. Two of the four surfaces only exist in
		 * devtools, so a visitor who cannot open one needs to know the rungs are a way
		 * through on purpose, not a mistake they are exploiting.
		 */
		function handOver(flagId, index) {
			const ids = RUNG_HANDOUTS[flagId]?.[index];
			if (!ids || !ids.length) return;
			takeFragments(ids);
			if (noticeGiven) return;
			noticeGiven = true;
			logLine("$ these rungs hand clues over on purpose: a rung that names a surface hands that clue over, and the bottom rung hands over all four. two of the four surfaces only open in devtools — if you cannot open one, this is the way through.", "hint");
		}

		function logLine(text, modifier = "") {
			const line = document.createElement("p");
			line.className = `terminal__line${modifier ? ` terminal__line--${modifier}` : ""}`;
			line.textContent = text;
			terminal.appendChild(line);
		}

		/* ---------- submitting ---------- */

		/**
		 * A rung, labelled with the flag it belongs to and how deep it is. The
		 * Attempts readout counts every guess made in this visit; the ladder counts
		 * misses on the one flag in front of the visitor (see the note on state), so a
		 * bare rung could leave someone staring at "Attempts 5" with no hint and
		 * nothing to explain the gap.
		 */
		function rungText(flagId, index) {
			const ladder = HINTS[flagId];
			return `${getFlag(flagId).code} · rung ${index + 1} of ${ladder.length} · ${ladder[index]}`;
		}

		function onSubmit(event) {
			event.preventDefault();
			const flag = getFlag(state.target);
			const done = cleared();
			const guess = input.value.trim();

			if (!guess) {
				result.textContent = "Nothing to check — type what you found.";
				result.className = "auth__result is-warn";
				return;
			}

			state.attempts += 1;
			state.attemptsByFlag[flag.id] = (state.attemptsByFlag[flag.id] ?? 0) + 1;
			attemptsEl.textContent = String(state.attempts);
			// Credit before judging: a guess that names fragments proves they were
			// read. FLAG-01 only — see credit().
			if (flag.id === "credential") credit(guess);

			if (done.has(flag.id)) {
				result.textContent = `${flag.code} is already yours. Pick another target.`;
				result.className = "auth__result is-warn";
				return;
			}

			if (flag.check(guess)) {
				done.add(flag.id);
				record = { ...record, cleared: [...done] };
				save(STORE_KEY, record);
				api.unlock(flag.achievement);
				paintFlags();
				fillTargets();
				paintTarget();

				result.textContent = `${flag.code} recovered. ${FLAG_COUNT - done.size} left on this machine.`;
				result.className = "auth__result is-right";
				logLine(`$ ${flag.code} :: ${flag.name} — recovered.`);

				// No AC-04 check here: it belongs to the clue board, and credit()
				// above already checked it on the way in.
				if (flag.id === "credential") terminal.classList.add("is-open");
				// `>=` rather than `===`: `done` is a Set built from storage, so an id
				// the game does not ship would make the count overshoot and this branch
				// unreachable. readCleared() filters them out on load; this is the
				// cheaper half of not crashing on the next line's `next.code`.
				if (done.size >= FLAG_COUNT) {
					api.unlock("hacker-all");
					terminal.classList.add("is-open");
					logLine("$ all six flags recovered. root acquired. you did that by hand.", "hint");
				} else {
					const next = FLAGS.find((f) => !done.has(f.id));
					logLine(`$ ${FLAG_COUNT - done.size} flag(s) remain. next: ${next.code}.`, "dim");
				}
				input.value = "";
				return;
			}

			const matched = matchedFragments(guess);
			if (flag.id === "credential" && matched.length) {
				result.textContent = `Accepted ${matched.length} of ${FRAGMENTS.length} fragments from your guess. Keep assembling.`;
			} else {
				result.textContent = `${flag.code} denied. That is not what ${flag.cipher.toLowerCase()} yields.`;
			}
			result.className = "auth__result is-wrong";

			// Two failures on a target earns its first rung, then one more per failure.
			// Both the misses and the rung are counted per flag: one shared pair of
			// counters used to hand out hints on every other flag the moment a visitor
			// struggled twice on any one of them, and to start the second flag at its
			// second hint because a different flag had already spent its first.
			const ladder = HINTS[flag.id];
			const rung = state.rungsByFlag[flag.id] ?? 0;
			if (state.attemptsByFlag[flag.id] >= 2 && rung < ladder.length) {
				logLine(`$ ${rungText(flag.id, rung)}`, "hint");
				handOver(flag.id, rung);
				state.rungsByFlag[flag.id] = rung + 1;
			}
		}

		function onHint() {
			// The bottom rung of every ladder hands over the answer, so it waits for
			// two misses on the flag in front of the visitor. Clicking "Stuck?" from a
			// cold start walks the nudges; once the misses are earned the same clicks
			// carry on down to the reveal, and nothing repeats past the end.
			const ladder = HINTS[state.target];
			const earned = (state.attemptsByFlag[state.target] || 0) >= 2;
			const reachable = earned ? ladder.length : ladder.length - 1;
			const rung = state.rungsByFlag[state.target] ?? 0;
			const step = Math.min(rung, reachable - 1);
			result.textContent = rungText(state.target, step);
			result.className = "auth__result is-warn";
			handOver(state.target, step);
			if (rung < ladder.length) state.rungsByFlag[state.target] = rung + 1;
		}

		function onTargetChange() {
			state.target = targetSelect.value || FLAGS[0].id;
			paintTarget();
			result.textContent = "";
			result.className = "auth__result";
		}

		/* ---------- wiring ---------- */

		// The router upgrades every select in the outlet before a game mounts, so
		// this one was already enhanced while it was still empty. Fill it, then
		// push the new options into the widget by hand.
		fillTargets();
		enhanceSelects(targetSelect.parentElement);
		refreshSelect(targetSelect);

		targetSelect.addEventListener("change", onTargetChange);
		form.addEventListener("submit", onSubmit);
		hintBtn.addEventListener("click", onHint);
		motionQuery.addEventListener("change", syncRain);

		paintFlags();
		paintTarget();
		paintClues();
		attemptsEl.textContent = String(state.attempts);

		return {
			unmount() {
				form.removeEventListener("submit", onSubmit);
				targetSelect.removeEventListener("change", onTargetChange);
				hintBtn.removeEventListener("click", onHint);
				motionQuery.removeEventListener("change", syncRain);
				rain.stop();
			},
			onShow() {
				paintClues();
				attemptsEl.textContent = String(state.attempts);
				syncRain();
			},
			onHide() {
				rain.stop();
			},
		};
	},
};
