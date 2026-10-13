/**
 * HOME — the desk at the entrance.
 *
 * The hero drawer is a working dropdown, not a decoration: it navigates.
 * Its intro plays once and gives up the moment the visitor touches anything
 * (the original looped forever and fought the user).
 */

import { createMenu } from "../ui/menu.js";
import { getCatalogue, pickOfDay, WINGS } from "../core/catalogue.js";
import { list, unlockedCount } from "../core/achievements.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export default {
	id: "home",
	label: "Reading room",
	title: "The Dropdown Archive — everything you choose passes through here",
	template: "home.html",

	mount(root, route, api) {
		const timers = [];
		const abort = new AbortController();
		const { signal } = abort;

		/* ---------- the signature drawer ---------- */
		const drawer = root.querySelector("#hero-drawer");
		const trigger = root.querySelector("#hero-drawer-trigger");
		const listEl = root.querySelector("#hero-drawer-list");
		const valueEl = trigger.querySelector(".drawer__value");
		const codeEl = trigger.querySelector(".drawer__code");
		const items = Array.from(listEl.querySelectorAll(".drawer__item"));
		const idleLabel = "Choose a wing…";

		let touched = false;
		let menu = null;

		menu = createMenu({
			trigger,
			panel: listEl,
			onSelect(item) {
				touched = true;
				const code = item.querySelector(".drawer__code").textContent;
				const name = item.querySelector(".drawer__name").textContent;
				codeEl.textContent = code;
				valueEl.textContent = name;
				api.navigate(item.dataset.route);
			},
		});

		["pointerdown", "keydown"].forEach((type) => {
			document.addEventListener(type, () => { touched = true; }, { once: true, signal });
		});

		function playIntro() {
			if (reduceMotion.matches) return;
			timers.push(window.setTimeout(() => {
				if (touched) return;
				menu.open();
				items.forEach((item, index) => {
					timers.push(window.setTimeout(() => {
						if (touched) return;
						valueEl.textContent = item.querySelector(".drawer__name").textContent;
						codeEl.textContent = item.querySelector(".drawer__code").textContent;
					}, 420 + index * 520));
				});
				timers.push(window.setTimeout(() => {
					if (touched) return;
					menu.close();
					valueEl.textContent = idleLabel;
					codeEl.textContent = "I—III";
				}, 420 + items.length * 520 + 900));
			}, 620));
		}
		playIntro();

		/* ---------- counts, pick of the day, record book ---------- */
		getCatalogue().then((entries) => {
			WINGS.forEach((wing) => {
				const slot = root.querySelector(`[data-wing-count="${wing.id}"]`);
				if (!slot) return;
				const count = entries.filter((entry) => entry.wingId === wing.id).length;
				slot.textContent = `${count} ${count === 1 ? "entry" : "entries"}`;
			});

			pickOfDay().then((pick) => {
				const slot = root.querySelector("#pick-of-day");
				if (!slot) return;
				if (!pick) {
					slot.innerHTML = '<p class="pick__loading">The index is unavailable.</p>';
					return;
				}
				slot.innerHTML = `
					<a class="pick__link" href="#${pick.route}">
						<span class="accession">${pick.accession}</span>
						<span class="pick__title"></span>
					</a>
					<p class="pick__meta"></p>`;
				slot.querySelector(".pick__title").textContent = pick.title;
				slot.querySelector(".pick__meta").textContent =
					`${pick.wing} · ${pick.kind} · chosen by date, changes at midnight`;
			});
		});

		const records = list();
		const countEl = root.querySelector("#record-count");
		const totalEl = root.querySelector("#record-total");
		if (countEl) countEl.textContent = String(unlockedCount());
		if (totalEl) totalEl.textContent = String(records.length);

		root.querySelector("[data-open-records]")?.addEventListener("click", () => api.openRecords(), { signal });
		root.querySelector("[data-open-palette]")?.addEventListener("click", () => api.openPalette(), { signal });

		/* ---------- route deep link, e.g. #/home ---------- */
		if (route.sub) {
			const target = root.querySelector(`#${CSS.escape(route.sub)}`);
			target?.scrollIntoView({ block: "center" });
		}

		return () => {
			abort.abort();
			timers.forEach((id) => window.clearTimeout(id));
			menu?.destroy();
		};
	},
};
