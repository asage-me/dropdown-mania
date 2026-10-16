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
import { FLAGS, FLAG_COUNT, FRAGMENTS, SHIFT, getFlag } from "./hacker-flags.js";

const STORE_KEY = "hacker";

/** Last-resort hints, two rungs per flag: where to look, then the exact command. */
const HINTS = {
	credential: [
		"Four fragments, hyphenated, in the order the page numbers them. Start with the source: right-click → View source.",
		"Fragment 1 is an HTML comment in games.html. Fragment 2 is data-hk-dom-clue on the terminal panel.",
		"Two more: one is logged to the console the moment this exhibit mounts. Reload with the console open.",
		"The last never renders. Select the terminal panel and read --hk-fragment in the Styles pane.",
		`The fragments are ${FRAGMENTS.map((f) => f.text).join(", ")}. You still have to type them in order.`,
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

const state = {
	attempts: 0,
	found: new Set(),
	target: FLAGS[0].id,
	hintStep: 0,
	consoleShown: false,
};

// Which flags you have cleared outlives the page. Merged over the defaults, so
// adding this key needs no save-version bump — and bumping one would wipe
// everybody's Lazy Drop progress for an unrelated exhibit.
let record = loadMerged(STORE_KEY, { cleared: [] });

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
		const rain = createRain(root.querySelector("[data-hk-rain]"));
		// Read live rather than cached at mount: the exhibit stays mounted while you
		// move between wings, so a value sampled once would go stale — and would keep
		// painting if the OS setting changed with the tab still open.
		const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const syncRain = () => (motionQuery.matches ? rain.stop() : rain.start());

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
			payloadEl.textContent = flag.payload ? `${flag.cipher}: ${flag.payload}` : flag.key;
			payloadEl.hidden = false;
			clueList.hidden = flag.id !== "credential";
			input.placeholder = flag.id === "credential" ? "0P3N-…-51GN" : "flag{…}";
			form.querySelector(".auth__label").textContent = done
				? `Already recovered — ${flag.code}`
				: `Submit what ${flag.code} decodes to`;
			state.hintStep = 0;
		}

		function paintClues() {
			clueRows.forEach((row) => {
				const isFound = state.found.has(row.dataset.clue);
				row.classList.toggle("is-found", isFound);
				row.querySelector(".clue__state").textContent = isFound ? "Recovered" : "Not found";
			});
			foundEl.textContent = String(state.found.size);
		}

		/** FLAG-01 is the only flag with fragments, and credit is honest: a
		 *  fragment counts as found only once your guess actually contained it. */
		function credit(guess) {
			const upper = guess.toUpperCase();
			let changed = false;
			FRAGMENTS.forEach((fragment) => {
				if (upper.includes(fragment.text) && !state.found.has(fragment.id)) {
					state.found.add(fragment.id);
					changed = true;
				}
			});
			if (changed) paintClues();
		}

		function logLine(text, modifier = "") {
			const line = document.createElement("p");
			line.className = `terminal__line${modifier ? ` terminal__line--${modifier}` : ""}`;
			line.textContent = text;
			terminal.appendChild(line);
		}

		/* ---------- submitting ---------- */

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
			attemptsEl.textContent = String(state.attempts);
			credit(guess);

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

				if (flag.id === "credential") {
					terminal.classList.add("is-open");
					if (state.found.size === FRAGMENTS.length) api.unlock("hacker-all-clues");
				}
				if (done.size === FLAG_COUNT) {
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

			const matched = FRAGMENTS.filter((f) => guess.toUpperCase().includes(f.text));
			if (flag.id === "credential" && matched.length) {
				result.textContent = `Accepted ${matched.length} of ${FRAGMENTS.length} fragments from your guess. Keep assembling.`;
			} else {
				result.textContent = `${flag.code} denied. That is not what ${flag.cipher.toLowerCase()} yields.`;
			}
			result.className = "auth__result is-wrong";

			// Two failures on a target earns the first rung, then one more per failure.
			const ladder = HINTS[flag.id];
			if (state.attempts >= 2 && state.hintStep < ladder.length) {
				logLine(`$ ${ladder[state.hintStep]}`, "hint");
				state.hintStep += 1;
			}
		}

		function onHint() {
			const ladder = HINTS[state.target];
			const step = Math.min(state.hintStep, ladder.length - 1);
			result.textContent = ladder[step];
			result.className = "auth__result is-warn";
			state.hintStep += 1;
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
		root.querySelector("[data-hk-hint]").addEventListener("click", onHint);
		motionQuery.addEventListener("change", syncRain);

		paintFlags();
		paintTarget();
		paintClues();
		attemptsEl.textContent = String(state.attempts);

		return {
			unmount() {
				form.removeEventListener("submit", onSubmit);
				targetSelect.removeEventListener("change", onTargetChange);
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
