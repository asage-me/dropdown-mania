/**
 * Theme: two fully-tuned themes, remembered, with the OS as the default.
 * The archive is "daylight" by default and "vault" at night.
 */

import { load, save } from "../lib/store.js";

const KEY = "theme";
const root = document.documentElement;
const media = window.matchMedia("(prefers-color-scheme: dark)");

let current = "light";

function apply(theme) {
	current = theme;
	root.setAttribute("data-theme", theme);
	syncButton();
}

function syncButton() {
	const btn = document.getElementById("theme-toggle");
	if (!btn) return;
	const isDark = current === "dark";
	btn.setAttribute("aria-pressed", String(isDark));
	btn.title = isDark ? "Switch to daylight" : "Switch to the vault";
	const label = btn.querySelector("[data-theme-label]");
	if (label) label.textContent = isDark ? "Vault" : "Daylight";
}

function setTheme(theme, { persist = true } = {}) {
	apply(theme);
	if (persist) save(KEY, theme);
}

export function toggleTheme() {
	setTheme(current === "dark" ? "light" : "dark");
}

export function initTheme() {
	const stored = load(KEY);
	apply(stored === "light" || stored === "dark" ? stored : (media.matches ? "dark" : "light"));

	// Follow the OS only while the visitor has not chosen for themselves.
	media.addEventListener("change", (event) => {
		if (load(KEY) === null) apply(event.matches ? "dark" : "light");
	});
}
