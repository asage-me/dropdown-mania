/**
 * The hash router — the module every page depends on and no test used to reach.
 *
 * The contract worth pinning is which hashes are routes. Reading a bare
 * fragment as a route is how the skip link and the exhibit index ejected people
 * out of the wing they were reading: the fragment matched no mode, so the
 * router fell back to home and rewrote the URL as a side effect.
 *
 * These tests drive a real router over the real wing templates, because
 * render() does more than swap markup: it destroys the outgoing widgets,
 * repaints the body's data-mode, and decides between a re-render and a
 * sub-route callback.
 */

import {
	assert, freshModule, host, release, suite, test, tick,
} from "../harness.js";

/** The wing files are the router's own inputs, so the tests use the real ones. */
const WING_TEMPLATES = {
	home: "home.html",
	education: "education.html",
	games: "games.html",
};

async function routerHarness() {
	const { createRouter } = await freshModule("js/core/router.js");
	// Not freshModule: the router imports the plain path, and the widget keeps
	// its registry in module scope. A second copy would build widgets that the
	// cleanup here cannot see or destroy. Two levels up because this file sits in
	// tests/cases/, where the harness's own `../js/...` no longer resolves.
	const { destroySelectsIn } = await import("../../js/ui/select.js");

	const outlet = host("");
	const mounts = [];
	const subs = [];
	const rendered = [];

	const mode = (id) => ({
		id,
		template: WING_TEMPLATES[id],
		title: `${id} — router test`,
		mount(root, route) {
			mounts.push(`${id}${route.sub ? `/${route.sub}` : ""}`);
			return () => {};
		},
		onSub(root, route) {
			subs.push(route.sub);
		},
	});

	const modes = Object.fromEntries(Object.keys(WING_TEMPLATES).map((id) => [id, mode(id)]));
	const router = createRouter({ outlet, modes, onRendered: (route) => rendered.push(route.path) });

	return {
		outlet, mounts, subs, rendered, router,

		/**
		 * render() fetches a template, so a render can land several frames after
		 * the hash change. Wait for the render queue to go quiet instead of
		 * guessing a duration: 200ms of nothing new, capped at about 3s. Catching
		 * a render that should not have happened needs the wait to outlast it.
		 */
		async settle() {
			let last = rendered.length;
			let quiet = 0;
			for (let i = 0; i < 150 && quiet < 10; i += 1) {
				await tick(20);
				if (rendered.length === last) quiet += 1;
				else {
					quiet = 0;
					last = rendered.length;
				}
			}
		},
		/** start() renders the hash already in the URL, so set it first. */
		async start(hash) {
			window.location.hash = hash;
			router.start();
			await this.settle();
		},
		async go(hash) {
			window.location.hash = hash;
			await this.settle();
		},
		modeAttr: () => document.body.dataset.mode,
		cleanup() {
			router.stop();
			destroySelectsIn(outlet);
			release(outlet);
			delete document.body.dataset.mode;
			window.location.hash = "";
		},
	};
}

suite("core/router.js — hashes are routes or they are anchors", () => {
	test("a wing hash mounts that wing, and an unknown one falls back to home", async () => {
		const h = await routerHarness();
		try {
			await h.start("#/");
			assert.eq(h.mounts.join(","), "home");
			assert.eq(h.modeAttr(), "home");

			await h.go("#/education");
			await h.go("#/games/find-path");
			assert.eq(h.mounts.join(","), "home,education,games/find-path", "a wing or its sub-route failed to resolve");
			assert.eq(h.modeAttr(), "games");
			// `#/` and `#/home` are the same place: the path is built from the
			// resolved mode, so home owns both spellings.
			assert.eq(h.rendered.join(","), "/home,/education,/games/find-path");

			// No mode claims it, so home takes it — without throwing.
			await h.go("#/no-such-wing");
			assert.eq(h.router.current().id, "home", "an unknown wing must land on home");
			assert.eq(h.modeAttr(), "home");
		} finally { h.cleanup(); }
	});

	/** The regression: #dd-001 (exhibit index) and #main-content (skip link). */
	test("a bare fragment is left to the browser: the mounted wing survives it", async () => {
		const h = await routerHarness();
		try {
			await h.start("#/education");
			const mounted = h.outlet.firstElementChild;
			assert.ok(mounted, "the wing never rendered, so the rest of this test proves nothing");

			for (const anchor of ["#dd-001", "#main-content"]) {
				await h.go(anchor);
				// Assert the browser really moved the URL, or "nothing happened"
				// would pass for the wrong reason.
				assert.eq(window.location.hash, anchor, "the fragment did not reach the URL");
				assert.eq(h.mounts.length, 1, `${anchor} re-mounted the wing`);
				assert.eq(h.outlet.firstElementChild, mounted, `${anchor} threw away the mounted wing`);
				assert.eq(h.modeAttr(), "education", `${anchor} changed the wing on screen`);
				assert.eq(h.router.current().id, "education", `${anchor} made the router forget where it is`);
			}

			// Letting a fragment go must not wedge the router.
			await h.go("#/games");
			assert.eq(h.mounts.length, 2, "navigation after an anchor stopped working");
			assert.eq(h.modeAttr(), "games");
		} finally { h.cleanup(); }
	});

	test("changing exhibit inside a wing is a sub-route, not a re-render", async () => {
		const h = await routerHarness();
		try {
			await h.start("#/education");
			const mounted = h.outlet.firstElementChild;

			await h.go("#/education/dd-006");
			assert.eq(h.mounts.length, 1, "a sub-route rebuilt the wing and would reset the game in progress");
			assert.eq(h.subs.join(","), "dd-006", "the wing was never told which exhibit to focus");
			assert.eq(h.outlet.firstElementChild, mounted, "the wing's DOM was replaced under a live exhibit");
			assert.includes(h.rendered.join(","), "/education/dd-006", "nav state is not told about the new exhibit");
		} finally { h.cleanup(); }
	});

	test("stop() leaves no hashchange listener behind", async () => {
		const h = await routerHarness();
		try {
			await h.start("#/home");
			h.router.stop();

			await h.go("#/games");
			assert.eq(window.location.hash, "#/games", "the hash did not change, so this proves nothing");
			assert.eq(h.mounts.length, 1, "a stopped router is still rendering");
			assert.eq(h.modeAttr(), "home", "a stopped router is still repainting the page");
		} finally { h.cleanup(); }
	});
});
