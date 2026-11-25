/**
 * Hash router.
 *
 * Routes are shareable and survive reload — the original build had no routing
 * at all, so "go back to the Hacker puzzle" was impossible.
 *
 *   #/                     home
 *   #/education            wing I
 *   #/games[/find-path|hacker|lazy-drop]   wing II (+ exhibit)
 *   #/retro                wing III
 *
 * A hash that does not start with `#/` is an in-page anchor, not a route, and is
 * left to the browser (see isRoute).
 *
 * Each mount may return a cleanup function; the router guarantees exactly one
 * mount is live at a time, which is what kills the duplicate-listener class of
 * bugs the original had (init() ran on every tab click and re-bound handlers).
 */

import { destroySelectsIn, enhanceSelects } from "../ui/select.js";
import { loadTemplate } from "./templates.js";

export function createRouter({ outlet, modes, onRendered, api }) {
	let generation = 0;
	let cleanup = null;
	let currentPath = null;
	let currentRoute = null;

	function parse(hash) {
		const raw = String(hash || "").replace(/^#\/?/, "");
		const [mode, sub] = raw.split("/").filter(Boolean);
		const id = mode && modes[mode] ? mode : "home";
		return { id, sub: sub || null, path: `/${[id, sub].filter(Boolean).join("/")}` };
	}

	/**
	 * Only `#/…` addresses a wing. A bare fragment — the skip link's
	 * `#main-content`, or an in-page `#section` — names an id inside whatever is
	 * already mounted, and belongs to the browser's own scrolling. Reading one
	 * as a route sent the visitor to home (the fragment matched no mode) and
	 * rewrote the URL they were reading, so a reload landed in the wrong wing.
	 */
	function isRoute(hash) {
		return !hash || hash === "#" || hash.startsWith("#/");
	}

	/**
	 * The route actually on screen. `location.hash` can legitimately hold a bare
	 * fragment (see isRoute), so it is not always the truth about what is mounted.
	 */
	function liveRoute() {
		return currentRoute ?? parse(window.location.hash);
	}

	function teardown() {
		if (typeof cleanup === "function") {
			try {
				cleanup();
			} catch (error) {
				console.error("Mode cleanup failed:", error);
			}
		}
		cleanup = null;
	}

	async function render(route, { scroll = true } = {}) {
		const token = ++generation;
		const mode = modes[route.id];

		teardown();
		document.body.dataset.mode = route.id;

		let html;
		try {
			html = await loadTemplate(mode.template);
		} catch (error) {
			console.error(error);
			outlet.innerHTML = "";
			const panel = document.createElement("div");
			panel.className = "load-error";
			panel.innerHTML = `
				<h2>Wing unavailable</h2>
				<p>The archive could not load <code>${mode.template}</code>.</p>
				<p class="load-error__hint">This site loads its wings as separate files, so it needs to be
				served over HTTP rather than opened straight from disk. From the project folder run
				<code>python -m http.server 8000</code> and open
				<code>http://localhost:8000</code>.</p>`;
			outlet.appendChild(panel);
			return;
		}
		if (token !== generation) return; // a newer navigation won

		// The outgoing widgets live inside the outlet, which is about to be
		// overwritten. Each one holds a document-level focusout listener, so
		// replacing the DOM without destroying them leaves every listener — and
		// the detached subtree it closes over — reachable forever.
		destroySelectsIn(outlet);
		outlet.innerHTML = html;
		enhanceSelects(outlet);

		// Scroll before mounting so a wing that handles its own sub-route
		// (deep link to an exhibit) wins over the default "back to the top".
		if (scroll) window.scrollTo({ top: 0, behavior: "auto" });

		try {
			cleanup = mode.mount(outlet, route, api) || null;
		} catch (error) {
			console.error(`Mount failed for ${route.id}:`, error);
			cleanup = null;
		}
		if (token !== generation) return;

		currentPath = route.path;
		currentRoute = route;
		document.title = mode.title;
		onRendered?.(route, outlet);
	}

	function handle() {
		if (!isRoute(window.location.hash)) return;
		const route = parse(window.location.hash);
		if (route.path === currentPath) return;

		// Changing exhibit inside a live wing is a sub-route, not a navigation:
		// rebuilding the wing would throw away the game in progress.
		if (currentRoute && currentRoute.id === route.id) {
			const mode = modes[route.id];
			if (typeof mode.onSub === "function") {
				currentPath = route.path;
				currentRoute = route;
				mode.onSub(outlet, route);
				onRendered?.(route, outlet);
				return;
			}
		}

		render(route);
	}

	return {
		start() {
			window.addEventListener("hashchange", handle);
			handle();
		},
		/** The router owns exactly this one document listener, so it removes it. */
		stop() {
			window.removeEventListener("hashchange", handle);
		},
		navigate(path) {
			const target = `#${path}`;
			if (window.location.hash === target) {
				render(parse(window.location.hash));
			} else {
				window.location.hash = target;
			}
		},
		current() {
			return liveRoute();
		},
		rerender() {
			render(liveRoute(), { scroll: false });
		},
	};
}
