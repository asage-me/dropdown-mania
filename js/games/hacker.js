/**
 * DD-013 — Hacker Puzzle.
 *
 * Four fragments, one per devtools surface: source comment, data attribute,
 * console banner, CSS custom property. The original stored the whole password
 * in one JS constant, re-attached its submit listener on every tab click, and
 * appended a new HTML comment each time it initialised.
 *
 * Clue credit is honest: a fragment is marked found when your guess actually
 * contains it, or when a hint hands it over.
 */

const FRAGMENTS = [
	{ id: "source", text: "0P3N", where: "a comment in the HTML source" },
	{ id: "dom", text: "M4N", where: "the data-hk-dom-clue attribute on the terminal panel" },
	{ id: "console", text: "_3D", where: "the banner logged to the console when this exhibit loads" },
	{ id: "css", text: "51GN", where: "the --hk-fragment custom property in css/games.css" },
];

const ANSWER = FRAGMENTS.map((f) => f.text).join("-");

const LADDER = [
	"Four fragments, joined by hyphens, in the order the page numbers them. Start with the source: right-click → View source.",
	"Fragment 1 is an HTML comment in games.html. Fragment 2 is a data attribute on the terminal panel — inspect it.",
	"Two more: one is logged to the console the moment this exhibit mounts. Reload the page with the console open.",
	"The last one never renders on screen. Select the terminal panel and read --hk-fragment in the Styles pane.",
	"Fine. The fragments are 0P3N, M4N, _3D, 51GN. You still have to type them in order.",
];

const state = {
	attempts: 0,
	found: new Set(),
	solved: false,
	hintStep: 0,
};

export default {
	id: "hacker",

	mount(root, api) {
		const terminal = root.querySelector("[data-hk-terminal]");
		const form = root.querySelector("[data-hk-form]");
		const input = root.querySelector("#hk-password");
		const result = root.querySelector("[data-hk-result]");
		const attemptsEl = root.querySelector("[data-hk-attempts]");
		const foundEl = root.querySelector("[data-hk-found]");
		const clueRows = root.querySelectorAll("[data-clue]");

		/* The console fragment: logged once per mount, never stacked. */
		if (!state.consoleShown) {
			console.log(
				"%c DD-013 · fragment 3 of 4 :: _3D ",
				"background:#14171a;color:#7fb4e5;font-family:monospace;padding:4px 8px;",
			);
			console.log(
				"%c Four fragments make one credential. This is one of them. ",
				"background:#14171a;color:#838c92;font-family:monospace;padding:2px 8px;",
			);
			state.consoleShown = true;
		}

		function paintClues() {
			clueRows.forEach((row) => {
				const isFound = state.found.has(row.dataset.clue);
				row.classList.toggle("is-found", isFound);
				row.querySelector(".clue__state").textContent = isFound ? "Recovered" : "Not found";
			});
			foundEl.textContent = String(state.found.size);
		}

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
			return changed;
		}

		function onSubmit(event) {
			event.preventDefault();
			if (state.solved) return;
			const guess = input.value.trim();
			if (!guess) {
				result.textContent = "Nothing to check — type what you found.";
				result.className = "auth__result is-warn";
				return;
			}

			state.attempts += 1;
			attemptsEl.textContent = String(state.attempts);
			credit(guess);

			if (guess.toUpperCase() === ANSWER) {
				state.solved = true;
				result.textContent = "Access granted. Credential accepted.";
				result.className = "auth__result is-right";
				terminal.classList.add("is-open");
				terminal.querySelector(".terminal__line--dim").textContent =
					"$ access granted. operator acknowledged. welcome back.";
				api.unlock("hacker-granted");
				if (state.found.size === FRAGMENTS.length) api.unlock("hacker-all-clues");
				return;
			}

			const matched = FRAGMENTS.filter((f) => guess.toUpperCase().includes(f.text)).map((f) => f.text);
			if (matched.length) {
				result.textContent = `Accepted ${matched.length} of 4 fragments from your guess. Keep assembling.`;
				result.className = "auth__result is-warn";
			} else {
				result.textContent = "Denied. That string appears nowhere in this document.";
				result.className = "auth__result is-wrong";
			}

			if (state.attempts >= 2 && state.hintStep < LADDER.length) {
				const line = document.createElement("p");
				line.className = "terminal__line terminal__line--hint";
				line.textContent = `$ ${LADDER[Math.min(state.hintStep, LADDER.length - 1)]}`;
				terminal.appendChild(line);
				state.hintStep += 1;
			}
		}

		function onHint() {
			const step = Math.min(state.hintStep, LADDER.length - 1);
			result.textContent = LADDER[step];
			result.className = "auth__result is-warn";
			state.hintStep += 1;
			// A hint also credits the fragment it names, so the checklist stays truthful.
			const named = FRAGMENTS[step];
			if (named && step < FRAGMENTS.length) {
				state.found.add(named.id);
				paintClues();
			}
		}

		form.addEventListener("submit", onSubmit);
		root.querySelector("[data-hk-hint]").addEventListener("click", onHint);
		paintClues();
		result.textContent = state.solved ? "Access granted. Credential accepted." : "";
		if (state.solved) result.className = "auth__result is-right";

		return {
			unmount() {
				form.removeEventListener("submit", onSubmit);
			},
			onShow() {
				paintClues();
				attemptsEl.textContent = String(state.attempts);
			},
		};
	},
};
