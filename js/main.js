/**
 * THE DROPDOWN ARCHIVE — entry point.
 *
 * Replaces the original app.js, which fetched a page, dumped it into
 * innerHTML, hand-executed its inline <script> tags, swapped stylesheets, and
 * re-attached listeners on every navigation. Here: one router, one mount per
 * wing, one cleanup per wing, all stylesheets loaded once.
 */

import { modes } from "./core/modes.js";
import { createRouter } from "./core/router.js";
import { initTheme, toggleTheme } from "./core/theme.js";
import { unlock } from "./core/achievements.js";
import { createPalette, openRecords } from "./ui/palette.js";
import { enhanceSelects, syncSelect } from "./ui/select.js";

const outlet = document.getElementById("main-content");
const modeSelect = document.getElementById("mode-select");
const visitedWings = new Set();

const api = {
	navigate: (path) => router.navigate(path),
	unlock,
	openPalette: () => palette.open(),
	openRecords,
};

const router = createRouter({
	outlet,
	modes,
	api,
	onRendered(route) {
		// Keep the nav control honest — this is the bug that left the dropdown
		// reading "Education" while the retro wing was on screen.
		if (modeSelect && modeSelect.value !== route.id) {
			modeSelect.value = modes[route.id] ? route.id : "home";
			syncSelect(modeSelect);
		}
		document.querySelectorAll("[data-nav-link]").forEach((link) => {
			const on = link.dataset.navLink === route.id;
			link.classList.toggle("is-on", on);
			if (on) link.setAttribute("aria-current", "page");
			else link.removeAttribute("aria-current");
		});

		if (route.id !== "home") visitedWings.add(route.id);
		if (visitedWings.size === 3) unlock("wing-visitor");
	},
});

const palette = createPalette({ navigate: (path) => router.navigate(path) });

/* ---------- navigation control ---------- */
if (modeSelect) {
	enhanceSelects(document.getElementById("site-nav"));
	modeSelect.addEventListener("change", () => {
		const value = modeSelect.value;
		router.navigate(value === "home" ? "/" : `/${value}`);
	});
}

/* ---------- theme ---------- */
initTheme();
document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);

/* ---------- palette keys ---------- */
document.addEventListener("keydown", (event) => {
	const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
		event.preventDefault();
		palette.open();
	} else if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
		event.preventDefault();
		palette.open();
	} else if (event.key.toLowerCase() === "r" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
		event.preventDefault();
		openRecords();
	}
});

document.addEventListener("click", (event) => {
	if (event.target.closest("[data-open-palette]")) {
		event.preventDefault();
		palette.open();
	}
	if (event.target.closest("[data-open-records]")) {
		event.preventDefault();
		openRecords();
	}
});

/* ---------- go ---------- */
router.start();
