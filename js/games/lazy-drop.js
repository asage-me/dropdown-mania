/**
 * DD-014 — Lazy Drop.
 *
 * Rebuilt: the original painted its menus with inline styles and hardcoded
 * light-mode hex values (so the dark theme was ignored), and its tier 4 menu
 * rendered at 60px wide with a 5px font — unreadable, and a keyboard trap.
 * Tiers are now native <select> elements upgraded by ArchiveSelect, sized with
 * a legible scale, and every colour comes from the token system.
 *
 * Six tiers follow the "smaller and richer" ladder, each with one starred option
 * that pays five times its own listing. Tier 7, the Long Menu, abandons the
 * ladder for a lottery: 500 rows, one of which pays 5,000.
 */

import { destroySelectsIn, enhanceSelects, refreshSelect } from "../ui/select.js";
import { load, save } from "../lib/store.js";

const STORE_KEY = "lazy-drop";
const SAVE_VERSION = 2;
const MAX_TIERS = 7;

/* Tier 7 deliberately breaks the "smaller and richer" ladder: it is not
   narrower, it is longer. Scale 1 keeps it full width. */
const TIER_SCALE = [1, 0.86, 0.74, 0.64, 0.56, 0.5, 1];
const TIER_BASE = [10, 25, 60, 140, 320, 700, 1200];
const LONG_MENU_TIER = 7;
const LONG_MENU_ROWS = 500;
const LONG_MENU_PRIZE = 5000;
const LONG_MENU_MISS = 5;

/** Listed value of each option, as a multiple of the tier base. */
const OPTION_STEPS = [1, 2, 3];
/** The starred option pays this multiple of its own listed value. */
const STAR_PAYOUT = 5;

const DEFAULTS = {
	version: SAVE_VERSION,
	points: 0,
	power: 1,
	multiplier: 1,
	autoRate: 0,
	tiers: 1,
	powerCost: 100,
	autoCost: 500,
	tierCost: 1000,
	multiplierCost: 5000,
	selections: 0,
	jackpots: 0,
	log: [],
	lastSeen: Date.now(),
};

const UPGRADES = [
	{
		id: "power",
		name: "Steadier hands",
		note: "+1 point per selection",
		costOf: (s) => s.powerCost,
		apply(s) {
			s.power += 1;
			s.powerCost = Math.round(s.powerCost * 1.6);
		},
	},
	{
		id: "auto",
		name: "Auto-selector",
		note: "+1 selection every second",
		costOf: (s) => s.autoCost,
		apply(s) {
			s.autoRate += 1;
			s.autoCost = Math.round(s.autoCost * 1.7);
		},
	},
	{
		id: "tier",
		name: "New tier",
		note: "One more menu, smaller and richer — the last is 500 rows long",
		costOf: (s) => s.tierCost,
		apply(s) {
			s.tiers = Math.min(MAX_TIERS, s.tiers + 1);
			s.tierCost = Math.round(s.tierCost * 2.3);
		},
	},
	{
		id: "multiplier",
		name: "Gilded menus",
		note: "Doubles everything you bank",
		costOf: (s) => s.multiplierCost,
		apply(s) {
			s.multiplier *= 2;
			s.multiplierCost = Math.round(s.multiplierCost * 3);
		},
	},
];

const number = new Intl.NumberFormat("en-US");

function freshState() {
	return { ...DEFAULTS, log: [] };
}

function restore() {
	const stored = load(STORE_KEY);
	if (!stored || stored.version !== SAVE_VERSION) return freshState();
	return { ...freshState(), ...stored };
}

const state = restore();
let autoTimer = 0;
let saveTimer = 0;

export default {
	id: "lazy-drop",

	mount(root, api) {
		const tiersEl = root.querySelector("[data-ld-tiers]");
		const upgradesEl = root.querySelector("[data-ld-upgrades]");
		const logEl = root.querySelector("[data-ld-log]");
		const scoreEl = root.querySelector("[data-ld-score]");
		const powerEl = root.querySelector("[data-ld-power]");
		const rateEl = root.querySelector("[data-ld-rate]");
		const clicksEl = root.querySelector("[data-ld-clicks]");

		/* ---------- away time ---------- */
		const awaySeconds = Math.max(0, Math.min(3600, Math.floor((Date.now() - state.lastSeen) / 1000)));
		if (state.autoRate > 0 && awaySeconds > 30) {
			const earned = Math.round(awaySeconds * state.autoRate * perSelection() * 0.25);
			if (earned > 0) {
				state.points += earned;
				log(`Auto-selectors banked ${number.format(earned)} while you were away (${Math.round(awaySeconds / 60)} min).`);
			}
		}

		function perSelection() {
			return state.power * state.multiplier;
		}

		function renderLog() {
			logEl.innerHTML = "";
			(Array.isArray(state.log) ? state.log : []).forEach((entry) => {
				const item = document.createElement("li");
				item.className = "ledger-log__item";
				item.textContent = entry;
				logEl.appendChild(item);
			});
		}

		function log(message) {
			state.log = [message, ...(Array.isArray(state.log) ? state.log : [])].slice(0, 5);
			renderLog();
			scheduleSave();
		}

		/* ---------- tiers ---------- */

		function tierShell(tier, { long = false } = {}) {
			const wrapper = document.createElement("div");
			wrapper.className = long ? "tier tier--long" : "tier";
			wrapper.style.setProperty("--tier-scale", String(TIER_SCALE[tier - 1] ?? 0.5));
			wrapper.style.setProperty("--tier-index", String(tier));
			return wrapper;
		}

		/**
		 * One option in every menu carries the star and pays five times its own
		 * listed value. The star used to be painted onto a random option while the
		 * five-fold was baked into the third choice's number, so the hint lied
		 * about two thirds of the time and the star was pure decoration. The payout
		 * is now derived from whichever option is starred, and the star is re-drawn
		 * after every commit so the menu has to be opened again to be read again.
		 */
		function rollChoices(tier) {
			const base = TIER_BASE[tier - 1] ?? TIER_BASE[TIER_BASE.length - 1];
			const starred = Math.floor(Math.random() * OPTION_STEPS.length);
			return OPTION_STEPS.map((step, index) => {
				const listed = Math.round(base * step);
				if (index !== starred) return { label: `Option ${index + 1} · +${number.format(listed)}`, payout: listed };
				const payout = listed * STAR_PAYOUT;
				return {
					label: `Option ${index + 1} · +${number.format(listed)} ✦ ×${STAR_PAYOUT} = ${number.format(payout)}`,
					payout,
				};
			});
		}

		function paintChoices(select, choices) {
			select.innerHTML = "";
			select.append(new Option("Commit…", ""));
			choices.forEach((choice) => select.append(new Option(choice.label, String(choice.payout))));
			// The widget mirrors the native element, so it has to be told the
			// choices themselves changed — repainting the label would not be enough.
			refreshSelect(select);
		}

		function buildShortMenu(tier) {
			const wrapper = tierShell(tier);
			const id = `ld-tier-${tier}`;
			wrapper.innerHTML = `
				<label class="tier__label" for="${id}">Tier ${tier}</label>
				<select id="${id}" class="tier__select" data-select-variant="sel--game"></select>
				<p class="tier__hint" aria-hidden="true">One option carries ✦ — it pays ${STAR_PAYOUT}× its own listing, and it moves after every commit.</p>`;

			const select = wrapper.querySelector("select");
			paintChoices(select, rollChoices(tier));
			select.addEventListener("change", () => {
				const points = Number(select.value);
				if (!points) return;
				bank(points * perSelection(), `Tier ${tier} selection`);
				paintChoices(select, rollChoices(tier));
				select.dispatchEvent(new Event("change", { bubbles: true }));
			});
			return wrapper;
		}

		/**
		 * Tier 7 — the Long Menu. Five hundred rows, exactly one of which pays.
		 *
		 * The winning row lives only in this closure. Writing it into an option's
		 * value or a data attribute would hand it straight to anyone who opens
		 * devtools, on a site whose other game is literally about reading the page
		 * source — so every row carries its own number as its value and the
		 * comparison happens here.
		 *
		 * It is a lottery, not a puzzle: one row in five hundred, and a miss pays a
		 * token. The prize stays put for the life of a ticket and a miss says only
		 * whether it lies above or below, which is the smallest clue that turns 500
		 * rows into a hunt you can actually work at — enough effort guarantees the
		 * prize, while a single hopeful click still almost never gets it. Re-drawn
		 * on a hit, so the next ticket is a fresh draw.
		 */
		function buildLongMenu() {
			const wrapper = tierShell(LONG_MENU_TIER, { long: true });
			const id = `ld-tier-${LONG_MENU_TIER}`;
			wrapper.innerHTML = `
				<label class="tier__label" for="${id}">Tier ${LONG_MENU_TIER} — The Long Menu</label>
				<select id="${id}" class="tier__select" data-select-variant="sel--game"></select>
				<p class="tier__hint" aria-hidden="true">${LONG_MENU_ROWS} rows, one prize of ${number.format(LONG_MENU_PRIZE)}. A miss only says whether the prize sits above or below — find it and the next ticket is drawn fresh.</p>`;

			const select = wrapper.querySelector("select");
			select.append(new Option("Draw…", ""));
			for (let row = 1; row <= LONG_MENU_ROWS; row += 1) {
				select.append(new Option(`Row ${String(row).padStart(3, "0")}`, String(row)));
			}

			const draw = () => 1 + Math.floor(Math.random() * LONG_MENU_ROWS);
			let prize = draw();

			select.addEventListener("change", () => {
				const picked = Number(select.value);
				if (!picked) return;
				if (picked === prize) {
					state.jackpots = (state.jackpots || 0) + 1;
					bank(LONG_MENU_PRIZE * perSelection(), `The Long Menu — row ${picked} was the prize`);
					api.unlock("lazy-jackpot");
					prize = draw();
				} else {
					const where = prize > picked ? "below" : "above";
					bank(LONG_MENU_MISS * perSelection(),
						`The Long Menu — row ${picked} was empty, and the prize is somewhere ${where} from it`);
				}
				select.value = "";
				select.dispatchEvent(new Event("change", { bubbles: true }));
			});
			return wrapper;
		}

		function buildTiers() {
			// Rebuilding throws away the upgraded selects, so tear their widgets
			// down first — otherwise each "New tier" purchase leaks a listener.
			destroySelectsIn(tiersEl);
			tiersEl.innerHTML = "";
			for (let tier = 1; tier <= state.tiers; tier += 1) {
				tiersEl.appendChild(tier === LONG_MENU_TIER ? buildLongMenu() : buildShortMenu(tier));
			}
			enhanceSelects(tiersEl);
		}

		function bank(points, label) {
			state.points += points;
			state.selections += 1;
			paint();
			log(`${label}: banked ${number.format(points)}. Total ${number.format(state.points)}.`);
			if (state.points >= 1000) api.unlock("lazy-1k");
			if (state.tiers >= 5) api.unlock("lazy-tier-5");
		}

		/* ---------- upgrades ---------- */

		function buildUpgrades() {
			upgradesEl.innerHTML = "";
			UPGRADES.forEach((upgrade) => {
				const button = document.createElement("button");
				button.type = "button";
				button.className = "upgrade";
				button.dataset.upgrade = upgrade.id;
				button.innerHTML = `
					<span class="upgrade__name"></span>
					<span class="upgrade__note"></span>
					<span class="upgrade__cost"></span>`;
				button.querySelector(".upgrade__name").textContent = upgrade.name;
				button.querySelector(".upgrade__note").textContent = upgrade.note;
				button.addEventListener("click", () => buy(upgrade));
				upgradesEl.appendChild(button);
			});
		}

		function buy(upgrade) {
			const cost = upgrade.costOf(state);
			if (upgrade.id === "tier" && state.tiers >= MAX_TIERS) {
				log("Every tier is already open. There is no smaller print.");
				return;
			}
			if (state.points < cost) {
				log(`${upgrade.name} costs ${number.format(cost)}. You have ${number.format(state.points)}.`);
				return;
			}
			state.points -= cost;
			upgrade.apply(state);
			log(`Bought ${upgrade.name} for ${number.format(cost)}.`);
			if (upgrade.id === "tier") buildTiers();
			startAuto();
			paint();
			scheduleSave();
		}

		/* ---------- auto ---------- */

		function startAuto() {
			window.clearInterval(autoTimer);
			autoTimer = 0;
			if (state.autoRate <= 0) return;
			autoTimer = window.setInterval(() => {
				state.points += state.autoRate * perSelection();
				paint();
				scheduleSave();
				if (state.points >= 1000) api.unlock("lazy-1k");
			}, 1000);
		}

		/* ---------- paint ---------- */

		function paint() {
			scoreEl.textContent = number.format(Math.floor(state.points));
			powerEl.textContent = number.format(perSelection());
			rateEl.textContent = number.format(state.autoRate * perSelection());
			clicksEl.textContent = number.format(state.selections);

			upgradesEl.querySelectorAll("[data-upgrade]").forEach((button) => {
				const upgrade = UPGRADES.find((u) => u.id === button.dataset.upgrade);
				const cost = upgrade.costOf(state);
				const maxed = upgrade.id === "tier" && state.tiers >= MAX_TIERS;
				button.querySelector(".upgrade__cost").textContent = maxed ? "Maxed" : `${number.format(cost)} pts`;
				button.disabled = maxed || state.points < cost;
			});
		}

		function scheduleSave() {
			window.clearTimeout(saveTimer);
			saveTimer = window.setTimeout(() => {
				state.lastSeen = Date.now();
				save(STORE_KEY, state);
			}, 500);
		}

		/* ---------- reset ---------- */

		function reset() {
			Object.assign(state, freshState());
			save(STORE_KEY, state);
			window.clearInterval(autoTimer);
			autoTimer = 0;
			state.log = [];
			buildTiers();
			paint();
			log("Save wiped. Tier 1, nothing banked.");
		}

		root.querySelector("[data-ld-reset]").addEventListener("click", reset);
		document.addEventListener("visibilitychange", flush, { passive: true });

		function flush() {
			state.lastSeen = Date.now();
			save(STORE_KEY, state);
		}

		buildTiers();
		buildUpgrades();
		renderLog();
		startAuto();
		paint();

		return {
			unmount() {
				flush();
				window.clearInterval(autoTimer);
				window.clearTimeout(saveTimer);
				autoTimer = 0;
				document.removeEventListener("visibilitychange", flush);
			},
			onShow() {
				paint();
				startAuto();
			},
		};
	},
};
