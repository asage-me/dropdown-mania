/**
 * DD-012 — Find the Path.
 *
 * Redesigned around a fair rule: every menu contains exactly one option that
 * breaks the pattern, and the pattern is always a real one. The original asked
 * for an arbitrary sequence ("Option A", "Alpha", "Red") that could only be
 * brute-forced, and a wrong pick wiped the board with no record of what you had
 * already learned — so field notes now survive a reset.
 *
 * The questions themselves live in path-sets.js: fifty themed sets of five
 * levels. The picker above the board offers the three ways in — a set dealt at
 * random, the journey through all fifty in order, or any one set by name — and
 * the count in the statline is the only progression the game needs.
 *
 * Advanced mode is the "dropdowns move while you click" idea from ideas.md:
 * the rows leave the page entirely and drift around the viewport (js/ui/float.js).
 * It is disabled under prefers-reduced-motion rather than silently shown still.
 */

import { destroySelectsIn, enhanceSelects, refreshSelect, syncSelect } from "../ui/select.js";
import { createFloaters } from "../ui/float.js";
import { loadMerged, save } from "../lib/store.js";
import {
	JOURNEY_PICK, PATH_SETS, PATH_THEMES, RANDOM_PICK, SET_COUNT, getSet, randomSetId,
} from "./path-sets.js";

const STORE_KEY = "find-path";

const state = {
	mode: "standard",
	setPick: RANDOM_PICK,
	setId: PATH_SETS[0].id,
	levels: PATH_SETS[0].levels,
	solved: [],
	attempts: 0,
	hintsLeft: 2,
	startedAt: 0,
	elapsed: 0,
	won: false,
};

// journey is how far through the ordered shelf the player has got, and
// completed is every set ever cleared, however it was reached. Both merge over
// an older save, so neither needs a version bump — and bumping one would wipe
// everybody's best times. localStorage is also the one input a visitor can edit
// by hand: a null `completed` used to throw on mount, and a string `journey`
// resolved the journey pick to an undefined set.
const VALID_SET_IDS = new Set(PATH_SETS.map((set) => set.id));

function readCompleted(stored) {
	return Array.isArray(stored?.completed) ? stored.completed.filter((id) => VALID_SET_IDS.has(id)) : [];
}

function readJourney(stored) {
	const value = Number(stored?.journey);
	return Number.isInteger(value) && value >= 0 && value <= SET_COUNT ? value : 0;
}

const saved = loadMerged(STORE_KEY, { standard: null, advanced: null, journey: 0, completed: [] });
let record = { ...saved, journey: readJourney(saved), completed: readCompleted(saved) };

/**
 * Fill the picker: two ways of letting the archive choose, then every set under
 * its theme. Options are built as nodes rather than markup so a name carrying
 * an ampersand survives the trip into a native select.
 */
function fillSetPicker(select) {
	select.innerHTML = "";
	select.append(
		new Option("Random — a fresh set every run", RANDOM_PICK),
		new Option(`Journey — all ${SET_COUNT} sets, in order`, JOURNEY_PICK),
		...PATH_THEMES.map((theme) => {
			const group = document.createElement("optgroup");
			group.label = theme;
			group.append(...PATH_SETS
				.filter((set) => set.theme === theme)
				.map((set) => new Option(set.name, set.id)));
			return group;
		}),
	);
}

/** Turn a picker value into the set to play right now. */
function resolveSetId(pick) {
	if (pick === RANDOM_PICK) return randomSetId(state.setId);
	if (pick === JOURNEY_PICK) return PATH_SETS[Math.min(record.journey, SET_COUNT - 1)].id;
	return pick;
}

export default {
	id: "find-path",

	mount(root, api) {
		const board = root.querySelector("[data-fp-board]");
		const status = root.querySelector("[data-fp-status]");
		const result = root.querySelector("[data-fp-result]");
		const attemptsEl = root.querySelector("[data-fp-attempts]");
		const clockEl = root.querySelector("[data-fp-clock]");
		const bestEl = root.querySelector("[data-fp-best]");
		const setsEl = root.querySelector("[data-fp-sets]");
		const setSelect = root.querySelector("[data-fp-set]");
		const blurbEl = root.querySelector("[data-fp-set-blurb]");
		const hintBtn = root.querySelector("[data-fp-hint]");
		const hintCount = root.querySelector("[data-fp-hint-count]");
		const resetBtn = root.querySelector("[data-fp-reset]");
		const notes = document.createElement("p");
		notes.className = "path__notes";
		notes.dataset.fpNotes = "";

		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let ticker = 0;
		let selects = [];
		// A getter, not a snapshot: buildBoard() replaces every row on rebuild.
		const floaters = createFloaters({ elements: () => selects.map(({ step }) => step) });

		const current = () => getSet(state.setId);

		/* ---------- build ---------- */

		function buildBoard() {
			destroySelectsIn(board);
			board.innerHTML = "";
			selects = [];

			state.levels.forEach((level, index) => {
				const step = document.createElement("div");
				step.className = "path__level";
				step.dataset.level = String(index);
				step.hidden = index > 0;

				const id = `fp-select-${index}`;
				const shuffled = [...level.options].sort(() => Math.random() - 0.5);

				step.innerHTML = `
					<p class="path__index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</p>
					<label class="path__prompt" for="${id}"></label>
					<div class="path__control">
						<select id="${id}"></select>
					</div>
					<p class="path__verdict" data-verdict role="status" aria-live="polite"></p>`;
				step.querySelector(".path__prompt").textContent = level.prompt;
				// Built as nodes, not interpolated into markup: an answer such as
				// "<=>" would otherwise be parsed as a tag and arrive mangled.
				step.querySelector("select").append(
					new Option("Choose…", ""),
					...shuffled.map((option) => new Option(option, option)),
				);
				board.appendChild(step);

				const select = step.querySelector("select");
				select.addEventListener("change", () => onPick(index, select));
				selects.push({ select, step });
			});

			board.appendChild(notes);
			enhanceSelects(board);
			paintNotes();
		}

		function onPick(index, select) {
			if (!select.value || state.won) return;
			const level = state.levels[index];
			const verdict = selects[index].step.querySelector("[data-verdict]");
			state.attempts += 1;
			attemptsEl.textContent = String(state.attempts);
			startClock();

			if (select.value === level.correct) {
				if (!state.solved.includes(index)) state.solved.push(index);
				verdict.textContent = "Correct.";
				verdict.className = "path__verdict is-right";
				selects[index].step.classList.add("is-solved");
				paintNotes();

				if (index === state.levels.length - 1) {
					win();
				} else {
					clearVerdict(index + 1);
					selects[index + 1].step.hidden = false;
					status.textContent = levelLine(index + 1);
					selects[index + 1].select.focus();
				}
			} else {
				verdict.textContent = "Wrong.";
				verdict.className = "path__verdict is-wrong";
				resetBoard({ keepVerdictOn: index, keepSolved: true });
				// Only level one is still on screen after a reset, so a verdict written on
				// the row that earned it goes unread for levels two to five. The status
				// line is where the "no" has to be said: it never hides, and it is the
				// live region, so it is announced too.
				status.textContent = `No — that is not the one. Back to level 1 of ${state.levels.length}. Your notes keep what you solved.`;
			}
		}

		/**
		 * Wipe one row's verdict. A row that was answered wrongly keeps its "no" for
		 * as long as it is on screen, then loses it the moment it is re-armed — by
		 * then it has been read, and showing it again reads as a verdict on the
		 * answer you are about to give rather than the one you already gave.
		 */
		function clearVerdict(index) {
			const verdict = selects[index].step.querySelector("[data-verdict]");
			verdict.textContent = "";
			verdict.className = "path__verdict";
		}

		/**
		 * Clear the run. The row that was just answered wrongly keeps its short "no"
		 * rather than being blanked in the same tick that wrote it; the explanation
		 * belongs to the status line, which survives the reset.
		 *
		 * A miss keeps `solved`, because the status line promises exactly that —
		 * "your notes keep what you solved" — and the notes are the only thing that
		 * makes a fifth attempt different from the first. A restart clears it.
		 */
		function resetBoard({ keepVerdictOn = -1, keepSolved = false } = {}) {
			if (!keepSolved) state.solved = [];
			state.startedAt = 0;
			state.elapsed = 0;
			stopClock();
			selects.forEach(({ select, step }, index) => {
				select.value = "";
				select.dispatchEvent(new Event("change", { bubbles: true }));
				step.classList.remove("is-solved");
				step.hidden = index > 0;
				if (index === keepVerdictOn) return;
				clearVerdict(index);
			});
			paintNotes();
			status.textContent = levelLine(0);
			clockEl.textContent = "0:00";
		}

		function levelLine(index) {
			return `${current().name} — level ${index + 1} of ${state.levels.length}. ${state.levels[index].prompt}`;
		}

		function paintNotes() {
			if (!state.solved.length) {
				notes.textContent = "";
				return;
			}
			const solvedList = state.solved
				.slice()
				.sort((a, b) => a - b)
				.map((i) => `${i + 1}. ${state.levels[i].correct}`)
				.join("   ");
			notes.textContent = `Field notes — already proven: ${solvedList}`;
		}

		/* ---------- clock ---------- */

		function startClock() {
			if (ticker || state.won) return;
			state.startedAt = Date.now() - state.elapsed * 1000;
			ticker = window.setInterval(() => {
				state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
				clockEl.textContent = formatTime(state.elapsed);
			}, 250);
		}

		function stopClock() {
			window.clearInterval(ticker);
			ticker = 0;
		}

		/* ---------- win ---------- */

		function win() {
			state.won = true;
			stopClock();
			const previous = record[state.mode];
			const isBest = typeof previous !== "number" || state.elapsed < previous;
			if (isBest) record[state.mode] = state.elapsed;
			if (!record.completed.includes(state.setId)) {
				record.completed = [...record.completed, state.setId];
			}
			if (state.setPick === JOURNEY_PICK) {
				record.journey = Math.min(record.journey + 1, SET_COUNT);
			}
			save(STORE_KEY, record);
			paintBest();
			paintProgress();

			result.hidden = false;
			result.className = "result is-win";
			result.innerHTML = `
				<p class="label label--accent">Path complete</p>
				<p class="result__time"></p>
				<p class="result__meta"></p>
				<ul class="result__rules"></ul>`;
			result.querySelector(".result__time").textContent =
				`${formatTime(state.elapsed)} in ${state.attempts} ${state.attempts === 1 ? "attempt" : "attempts"}` +
				(isBest ? " — a new best." : ` — best remains ${formatTime(previous)}.`);
			result.querySelector(".result__meta").textContent =
				`${current().name}. ${state.mode === "advanced" ? "Advanced: menus were moving." : "Standard difficulty."} ` +
				`${record.completed.length} of ${SET_COUNT} sets cleared.`;
			const rules = result.querySelector(".result__rules");
			state.levels.forEach((level) => {
				const item = document.createElement("li");
				item.textContent = level.rule;
				rules.appendChild(item);
			});
			const next = nextButton();
			if (next) result.appendChild(next);
			status.textContent = "Solved. Every rule above was in the labels the whole time.";
			api.unlock(state.mode === "advanced" ? "path-advanced" : "path-first");
			if (record.completed.length === SET_COUNT) api.unlock("path-catalogue");
		}

		/** The follow-up button, or null when there is nothing queued to play. */
		function nextButton() {
			if (state.setPick === RANDOM_PICK) return nextAction("Deal another set");
			if (state.setPick === JOURNEY_PICK && record.journey < SET_COUNT) {
				return nextAction(`On to set ${record.journey + 1} of ${SET_COUNT}`);
			}
			return null;
		}

		function nextAction(label) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "btn btn--sm result__next";
			button.dataset.fpNext = "";
			button.textContent = label;
			return button;
		}

		function paintBest() {
			const value = record[state.mode];
			bestEl.textContent = typeof value === "number" ? formatTime(value) : "—";
		}

		function paintProgress() {
			setsEl.textContent = `${record.completed.length} of ${SET_COUNT}`;
		}

		/* ---------- sets ---------- */

		/**
		 * Load whichever set the picker value points at and clear the run around
		 * it. Random resolves to a new set every time, so "Restart run" deals a
		 * fresh one while a named set replays itself.
		 */
		function loadSet(pick) {
			state.setPick = pick;
			state.setId = resolveSetId(pick);
			state.levels = current().levels;
			setSelect.value = pick;
			syncSelect(setSelect);
			blurbEl.textContent = current().blurb;
			buildBoard();
			resetBoard();
			restartFloaters();
		}

		function restartFloaters() {
			if (!board.classList.contains("is-floating")) return;
			// The loop holds the rows it measured when it started, so a rebuilt
			// board has to be handed over rather than left driving dead nodes.
			floaters.stop();
			floaters.start();
		}

		function newRun(pick = state.setPick) {
			state.won = false;
			state.attempts = 0;
			attemptsEl.textContent = "0";
			state.hintsLeft = 2;
			hintCount.textContent = `(${state.hintsLeft})`;
			result.hidden = true;
			loadSet(pick);
		}

		/* ---------- difficulty ---------- */

		function setMode(mode) {
			state.mode = mode;
			root.querySelectorAll("[data-fp-mode]").forEach((button) => {
				const on = button.dataset.fpMode === mode;
				button.classList.toggle("is-on", on);
				button.setAttribute("aria-pressed", String(on));
			});
			const moving = mode === "advanced" && !reduceMotion;
			board.classList.toggle("is-floating", moving);
			if (moving) floaters.start();
			else floaters.stop();
			paintBest();
			status.textContent = moving
				? "Advanced: the menus have left the page. Catch one."
				: (mode === "advanced"
					? "Advanced requested, but your system asks for reduced motion — the menus will stay still."
					: "Standard: the menus hold still.");
		}

		/* ---------- hints ---------- */

		function takeHint() {
			if (state.hintsLeft <= 0) {
				status.textContent = "No hints left this visit. The rules are in the labels.";
				return;
			}
			const index = Math.min(state.solved.length, state.levels.length - 1);
			state.hintsLeft -= 1;
			hintCount.textContent = `(${state.hintsLeft})`;
			status.textContent = `Hint — level ${index + 1}: ${state.levels[index].rule}`;
		}

		/* ---------- wiring ---------- */

		const onModeClick = (event) => setMode(event.currentTarget.dataset.fpMode);
		root.querySelectorAll("[data-fp-mode]").forEach((button) => {
			button.addEventListener("click", onModeClick);
		});

		const onSetChange = () => newRun(setSelect.value);
		setSelect.addEventListener("change", onSetChange);

		// The result panel is rewritten on every win, so its button is caught by
		// delegation rather than bound each time it appears.
		const onNext = (event) => {
			if (event.target instanceof HTMLElement && event.target.dataset.fpNext !== undefined) {
				newRun(state.setPick);
			}
		};
		result.addEventListener("click", onNext);

		const onReset = () => newRun(state.setPick);
		resetBtn.addEventListener("click", onReset);
		hintBtn.addEventListener("click", takeHint);

		fillSetPicker(setSelect);
		// The router upgrades every select in the outlet before a game mounts, so
		// this one was already upgraded while it was still empty. Filling the
		// native element is not enough on its own: the widget has to be told to
		// read it again.
		refreshSelect(setSelect);
		// Mounting is a new run, not a resumption. `state` is module scope, so it
		// outlives the wing; loadSet() below rebuilds the board from scratch
		// whatever survived in it. Restoring the old attempt count and re-showing
		// the win panel instead described a run that was no longer on the screen —
		// and left `won` true, which rejected every answer on the new board.
		newRun(state.setPick);
		setMode(state.mode);
		paintBest();
		paintProgress();

		return {
			unmount() {
				stopClock();
				floaters.stop();
				root.querySelectorAll("[data-fp-mode]").forEach((button) => {
					button.removeEventListener("click", onModeClick);
				});
				setSelect.removeEventListener("change", onSetChange);
				result.removeEventListener("click", onNext);
				resetBtn.removeEventListener("click", onReset);
				hintBtn.removeEventListener("click", takeHint);
			},
			onShow() {
				paintBest();
				paintProgress();
				attemptsEl.textContent = String(state.attempts);
				clockEl.textContent = formatTime(state.elapsed);
				// Switching games only hides this section, so the loop was
				// stopped with the rows measured at zero. Start again from a
				// fresh spread rather than resuming from a stale corner.
				if (state.mode === "advanced" && !reduceMotion) floaters.start();
			},
			onHide() {
				floaters.stop();
			},
		};
	},
};

function formatTime(totalSeconds) {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
