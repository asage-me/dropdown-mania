/**
 * DD-012 — Find the Path.
 *
 * Redesigned around a fair rule: every menu contains exactly one option that
 * breaks the pattern, and the pattern is always a real one. The original asked
 * for an arbitrary sequence ("Option A", "Alpha", "Red") that could only be
 * brute-forced, and a wrong pick wiped the board with no record of what you had
 * already learned — so field notes now survive a reset.
 *
 * Advanced mode is the "dropdowns move while you click" idea from ideas.md:
 * the rows leave the page entirely and drift around the viewport (js/ui/float.js).
 * It is disabled under prefers-reduced-motion rather than silently shown still.
 */

import { enhanceSelects } from "../ui/select.js";
import { createFloaters } from "../ui/float.js";
import { loadMerged, save } from "../lib/store.js";

const STORE_KEY = "find-path";
const LEVELS = [
	{
		prompt: "Which of these is not a shade of blue?",
		options: ["Cobalt", "Cerulean", "Ochre", "Indigo"],
		correct: "Ochre",
		rule: "Ochre is an earth yellow; the other three are blues.",
	},
	{
		prompt: "Which number does not belong?",
		options: ["16", "25", "32", "49"],
		correct: "32",
		rule: "16, 25 and 49 are perfect squares. 32 is a power of two.",
	},
	{
		prompt: "Which tag has never existed in HTML?",
		options: ["select", "menu", "dropdown", "datalist"],
		correct: "dropdown",
		rule: "<select>, <menu> and <datalist> are real elements. <dropdown> is a rumour.",
	},
	{
		prompt: "Which of these is not a data structure?",
		options: ["Stack", "Queue", "Carousel", "Heap"],
		correct: "Carousel",
		rule: "A carousel is a UI component. The rest are structures you would implement.",
	},
	{
		prompt: "Which prefix does this archive stamp on its exhibits?",
		options: ["DD", "AX", "MR", "TX"],
		correct: "DD",
		rule: "Dropdown Archive → DD. You have been reading them all along.",
	},
];

const state = {
	mode: "standard",
	solved: [],
	attempts: 0,
	hintsLeft: 2,
	startedAt: 0,
	elapsed: 0,
	won: false,
};

let record = loadMerged(STORE_KEY, { standard: null, advanced: null });

export default {
	id: "find-path",

	mount(root, api) {
		const board = root.querySelector("[data-fp-board]");
		const status = root.querySelector("[data-fp-status]");
		const result = root.querySelector("[data-fp-result]");
		const attemptsEl = root.querySelector("[data-fp-attempts]");
		const clockEl = root.querySelector("[data-fp-clock]");
		const bestEl = root.querySelector("[data-fp-best]");
		const hintBtn = root.querySelector("[data-fp-hint]");
		const hintCount = root.querySelector("[data-fp-hint-count]");
		const notes = document.createElement("p");
		notes.className = "path__notes";
		notes.dataset.fpNotes = "";

		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const timers = [];
		let ticker = 0;
		let selects = [];
		// A getter, not a snapshot: buildBoard() replaces every row on rebuild.
		const floaters = createFloaters({ elements: () => selects.map(({ step }) => step) });

		/* ---------- build ---------- */

		function buildBoard() {
			board.innerHTML = "";
			selects = [];

			LEVELS.forEach((level, index) => {
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
						<select id="${id}">
							<option value="">Choose…</option>
							${shuffled.map((option) => `<option value="${option}">${option}</option>`).join("")}
						</select>
					</div>
					<p class="path__verdict" data-verdict role="status" aria-live="polite"></p>`;
				step.querySelector(".path__prompt").textContent = level.prompt;
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
			const level = LEVELS[index];
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

				if (index === LEVELS.length - 1) {
					win();
				} else {
					selects[index + 1].step.hidden = false;
					status.textContent = `Level ${index + 2} of ${LEVELS.length}. ${LEVELS[index + 1].prompt}`;
					selects[index + 1].select.focus();
				}
			} else {
				verdict.textContent = "Wrong — the board resets. Your notes keep what you solved.";
				verdict.className = "path__verdict is-wrong";
				resetBoard();
			}
		}

		function resetBoard() {
			state.solved = [];
			state.startedAt = 0;
			state.elapsed = 0;
			stopClock();
			selects.forEach(({ select, step }, index) => {
				select.value = "";
				select.dispatchEvent(new Event("change", { bubbles: true }));
				step.classList.remove("is-solved");
				step.hidden = index > 0;
				const verdict = step.querySelector("[data-verdict]");
				verdict.textContent = "";
				verdict.className = "path__verdict";
			});
			paintNotes();
			status.textContent = `Level 1 of ${LEVELS.length}. ${LEVELS[0].prompt}`;
			clockEl.textContent = "0:00";
		}

		function paintNotes() {
			if (!state.solved.length) {
				notes.textContent = "";
				return;
			}
			const solvedList = state.solved
				.slice()
				.sort((a, b) => a - b)
				.map((i) => `${i + 1}. ${LEVELS[i].correct}`)
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
			const isBest = previous === null || state.elapsed < previous;
			if (isBest) {
				record[state.mode] = state.elapsed;
				save(STORE_KEY, record);
			}
			paintBest();
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
				state.mode === "advanced" ? "Advanced: menus were moving." : "Standard difficulty.";
			const rules = result.querySelector(".result__rules");
			LEVELS.forEach((level) => {
				const item = document.createElement("li");
				item.textContent = level.rule;
				rules.appendChild(item);
			});
			status.textContent = "Solved. Every rule above was in the labels the whole time.";
			api.unlock(state.mode === "advanced" ? "path-advanced" : "path-first");
		}

		function paintBest() {
			const value = record[state.mode];
			bestEl.textContent = value === null || value === undefined ? "—" : formatTime(value);
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
			const index = Math.min(state.solved.length, LEVELS.length - 1);
			state.hintsLeft -= 1;
			hintCount.textContent = `(${state.hintsLeft})`;
			status.textContent = `Hint — level ${index + 1}: ${LEVELS[index].rule}`;
		}

		/* ---------- wiring ---------- */

		const onModeClick = (event) => setMode(event.currentTarget.dataset.fpMode);
		root.querySelectorAll("[data-fp-mode]").forEach((button) => {
			button.addEventListener("click", onModeClick);
		});

		const onReset = () => {
			state.attempts = 0;
			state.won = false;
			state.hintsLeft = 2;
			hintCount.textContent = `(${state.hintsLeft})`;
			result.hidden = true;
			resetBoard();
		};
		root.querySelector("[data-fp-reset]").addEventListener("click", onReset);
		hintBtn.addEventListener("click", takeHint);

		buildBoard();
		setMode(state.mode);
		paintBest();
		attemptsEl.textContent = String(state.attempts);
		clockEl.textContent = formatTime(state.elapsed);
		if (state.won) result.hidden = false;

		return {
			unmount() {
				stopClock();
				floaters.stop();
				timers.forEach(window.clearTimeout);
				root.querySelectorAll("[data-fp-mode]").forEach((button) => {
					button.removeEventListener("click", onModeClick);
				});
			},
			onShow() {
				paintBest();
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
