/**
 * WING II — Games shell.
 *
 * Owns the exhibit switcher and the game lifecycles. A game is mounted the
 * first time its tab is opened and stays mounted while the wing is open, so
 * switching tabs never resets a run. Leaving the wing unmounts everything and
 * removes every listener — the original re-ran init() on every tab click and
 * stacked duplicate handlers.
 */

import findPath from "../games/find-path.js";
import hacker from "../games/hacker.js";
import lazyDrop from "../games/lazy-drop.js";

const GAMES = {
	"find-path": findPath,
	hacker,
	"lazy-drop": lazyDrop,
};

const ORDER = ["find-path", "hacker", "lazy-drop"];

/** Live shell, so the router can hand it sub-route changes. */
let shell = null;

export default {
	id: "games",
	label: "Games",
	title: "Games — The Dropdown Archive",
	template: "games.html",

	mount(root, route, api) {
		const instances = new Map();
		const tabs = new Map();
		root.querySelectorAll("[data-game-tab]").forEach((tab) => tabs.set(tab.dataset.gameTab, tab));

		function setTabState(activeId) {
			tabs.forEach((tab, id) => {
				const on = id === activeId;
				tab.classList.toggle("is-on", on);
				if (on) tab.setAttribute("aria-current", "true");
				else tab.removeAttribute("aria-current");
			});
		}

		function activate(id) {
			const gameId = GAMES[id] ? id : ORDER[0];
			const section = root.querySelector(`[data-game="${gameId}"]`);

			ORDER.forEach((other) => {
				const node = root.querySelector(`[data-game="${other}"]`);
				if (node) node.hidden = other !== gameId;
			});
			setTabState(gameId);

			if (!instances.has(gameId)) {
				const definition = GAMES[gameId];
				const handle = definition.mount(section, api) || {};
				instances.set(gameId, typeof handle === "function" ? { unmount: handle } : handle);
			}
			instances.get(gameId)?.onShow?.();
			return gameId;
		}

		shell = { activate };
		const started = activate(route.sub);
		if (!route.sub) {
			// Keep the URL honest without adding a history entry.
			history.replaceState(null, "", `#/games/${started}`);
		}

		return () => {
			instances.forEach((instance) => {
				try {
					instance.unmount?.();
				} catch (error) {
					console.error("Game unmount failed:", error);
				}
			});
			instances.clear();
			shell = null;
		};
	},

	onSub(root, route) {
		shell?.activate(route.sub);
		root.querySelector(`[data-game="${route.sub}"]`)?.scrollIntoView({ block: "nearest" });
	},
};
