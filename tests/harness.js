/**
 * A test runner with no build step, because the site has no build step.
 *
 * There is no toolchain here and adding one would be the beginning of a build nobody asked
 * for, so this is a page: open /tests/ over the same static server the site uses and it
 * runs. `?json` prints the report as JSON for a machine reader. The `tests/package.json`
 * beside this file is not a project file: it holds one key, present only so Node reads
 * `tests/*.js` as ES modules.
 *
 * Three things it exists to make possible:
 *
 *  - `freshModule()` re-imports a module under a unique query string, which
 *    gives a genuinely fresh instance. The games keep their run state in module
 *    scope (`state`, `record`), so a normal import would leak one test's board
 *    into the next test's board.
 *  - `mountExhibit()` mounts a real game into the real `games.html`, fetched
 *    from disk. Tests therefore assert against the shipped markup; a renamed
 *    `data-*` hook fails a test instead of silently breaking a page.
 *  - Storage is snapshotted on the first test and restored when the run ends,
 *    so running the suite never costs you your own saved progress.
 */

const NS = "dropdown-archive";

const suites = [];
let current = null;
let storageSnapshot = null;

/* ---------- registration ---------- */

export function suite(name, body) {
	const group = { name, tests: [] };
	suites.push(group);
	current = group;
	body();
	current = null;
}

export function test(name, fn) {
	if (!current) throw new Error("test() must be called inside suite()");
	current.tests.push({ name, fn });
}

/* ---------- assertions ---------- */

export class AssertionError extends Error {}

function fail(message) {
	throw new AssertionError(message);
}

function show(value) {
	if (typeof value === "string") return JSON.stringify(value);
	if (value instanceof Set) return `Set(${[...value].map(show).join(", ")})`;
	if (value instanceof Map) return `Map(${[...value].map(([k, v]) => `${show(k)} => ${show(v)}`).join(", ")})`;
	if (Array.isArray(value)) return `[${value.map(show).join(", ")}]`;
	if (value && typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
}

export const assert = {
	ok(value, message) {
		if (!value) fail(message || `expected a truthy value, got ${show(value)}`);
	},

	notOk(value, message) {
		if (value) fail(message || `expected a falsy value, got ${show(value)}`);
	},

	eq(actual, expected, message) {
		if (actual !== expected) {
			fail(message || `expected ${show(expected)}, got ${show(actual)}`);
		}
	},

	notEq(actual, unexpected, message) {
		if (actual === unexpected) fail(message || `expected anything but ${show(actual)}`);
	},

	deepEq(actual, expected, message) {
		const a = JSON.stringify(actual);
		const b = JSON.stringify(expected);
		if (a !== b) fail(message || `expected ${b}, got ${a}`);
	},

	match(text, pattern, message) {
		if (!pattern.test(String(text))) {
			fail(message || `expected ${show(String(text))} to match ${pattern}`);
		}
	},

	notMatch(text, pattern, message) {
		if (pattern.test(String(text))) {
			fail(message || `expected ${show(String(text))} not to match ${pattern}`);
		}
	},

	/** The assertion most worth having here: a value must not be reachable. */
	includes(haystack, needle, message) {
		if (!haystack.includes(needle)) {
			fail(message || `expected ${show(haystack)} to include ${show(needle)}`);
		}
	},
};

/* ---------- helpers ---------- */

export const tick = (ms = 0) => new Promise((resolve) => {
	window.setTimeout(resolve, ms);
});

/**
 * The suite lives one directory below the site, but the app names its templates
 * relative to the site root ("games.html") because that is what lets it be
 * served from a sub-directory. Resolve bare names against the root so the
 * catalogue and the router work here exactly as they do on a page.
 */
const SITE_ROOT = new URL("../", window.location.href).href;
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
	if (typeof input === "string" && !/^(?:https?:|\/|\.|blob:|data:)/i.test(input)) {
		return nativeFetch(new URL(input, SITE_ROOT).href, init);
	}
	return nativeFetch(input, init);
};

let importSeq = 0;

/** Import a module afresh, so its module-scope state starts empty. */
export function freshModule(path) {
	importSeq += 1;
	// A URL object keeps the cache-busted specifier opaque to static graph analysis.
	// A literal `import(\`../${path}?test=...\`)` instead makes the editor's analyser
	// assume the harness imports every test case, inventing cycles none of the
	// modules actually contain. Runtime behaviour is identical.
	return import(new URL(`../${path}?test=${importSeq}`, import.meta.url).href);
}

export async function fetchText(path) {
	const response = await fetch(`../${path}`, { cache: "no-cache" });
	if (!response.ok) throw new Error(`${path} responded ${response.status}`);
	return response.text();
}

export function storageKeys() {
	const keys = [];
	for (let i = 0; i < window.localStorage.length; i += 1) {
		const key = window.localStorage.key(i);
		if (key && key.startsWith(`${NS}:`)) keys.push(key);
	}
	return keys;
}

export function snapshotStorage() {
	if (storageSnapshot) return;
	storageSnapshot = new Map(storageKeys().map((key) => [key, window.localStorage.getItem(key)]));
	window.addEventListener("pagehide", restoreStorage);
}

export function restoreStorage() {
	if (!storageSnapshot) return;
	storageKeys().forEach((key) => window.localStorage.removeItem(key));
	storageSnapshot.forEach((value, key) => window.localStorage.setItem(key, value));
}

export function clearStorage() {
	storageKeys().forEach((key) => window.localStorage.removeItem(key));
}

export function readStore(name) {
	const raw = window.localStorage.getItem(`${NS}:${name}`);
	return raw === null ? null : JSON.parse(raw);
}

/**
 * A scratch element attached to the document. Games measure and query their
 * subtree, and the select widget listens on `document`, so a detached node is
 * not a faithful host.
 */
export function host(html = "") {
	const node = document.createElement("div");
	node.className = "test-host";
	node.innerHTML = html;
	document.body.appendChild(node);
	return node;
}

export function release(node) {
	if (!node) return;
	node.remove();
}

/**
 * The games keep their run state in module scope, so importing the module is
 * what decides whether a mount starts from nothing. Exported for the one test
 * that needs the opposite: a game mounted twice from the same module instance,
 * which is what leaving the wing and coming back really is.
 */
export function gameModule(gameId) {
	const paths = {
		"find-path": "js/games/find-path.js",
		hacker: "js/games/hacker.js",
		"lazy-drop": "js/games/lazy-drop.js",
	};
	const path = paths[gameId];
	if (!path) throw new Error(`no game module named ${show(gameId)}`);
	return freshModule(path);
}

/**
 * Mount one exhibit into the real games.html. Returns the game's handle plus a
 * stub api that records which achievements it asked for.
 *
 * Pass `sameModule` (a namespace from gameModule) to mount a second instance of
 * a game that is already imported. Without it every call gets a fresh module and
 * therefore fresh run state, which is right for most tests and wrong for
 * testing what survives a wing re-entry.
 */
export async function mountExhibit(gameId, sameModule) {
	const { loadTemplate } = await freshModule("js/core/templates.js");
	// Not freshModule: the widget keeps its registry in module scope, and the
	// games import the plain path. A second copy of the module would build
	// widgets the game's own refreshSelect() cannot see.
	const { destroySelectsIn, enhanceSelects } = await import("../js/ui/select.js");
	const game = sameModule ? Promise.resolve(sameModule) : gameModule(gameId);

	const container = host(await loadTemplate("../games.html"));
	const section = container.querySelector(`[data-game="${gameId}"]`);
	if (!section) throw new Error(`games.html has no [data-game="${gameId}"]`);
	// The wing ships every game hidden and the router reveals exactly one
	// (js/modes/games.js). A hidden element has no layout whatsoever, so without
	// this every rect below is a box of zeros and any geometry assertion passes
	// without testing anything. Computed-style checks survived; layout did not.
	section.hidden = false;
	enhanceSelects(section);
	// Fail loudly rather than let a zero-size host quietly invalidate every
	// geometry assertion in a file. Height can come from the static markup, so a
	// healthy mount always has some.
	if (!section.getBoundingClientRect().height) {
		throw new Error(`mounted ${gameId} exhibit has no layout: a hidden host measures only zeros`);
	}

	const unlocks = [];
	const api = {
		unlock: (id) => { unlocks.push(id); return true; },
		navigate: () => {},
		openRecords: () => {},
		openPalette: () => {},
	};

	const definition = await game;
	const handle = definition.default.mount(section, api) || {};
	const instance = typeof handle === "function" ? { unmount: handle } : handle;
	instance.onShow?.();

	return {
		root: section,
		container,
		api,
		unlocks,
		instance,
		destroy() {
			instance.unmount?.();
			destroySelectsIn(section);
			release(container);
		},
	};
}

/** Pick an option the way a user does, so the change handler actually fires. */
export function choose(select, value) {
	if (![...select.options].some((option) => option.value === value)) {
		throw new Error(`option ${show(value)} does not exist on ${select.id || select.name}`);
	}
	select.value = value;
	select.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Whether an element can hold focus. A `tabindex` of any value counts, including
 * `-1`, which is focusable on a click and merely untabbable.
 */
const FOCUSABLE = "a[href],button,input,select,textarea,summary,[contenteditable],[tabindex]";
function isFocusable(el) {
	return Boolean(el) && el !== document.documentElement && el.matches(FOCUSABLE);
}

/**
 * The focusable ancestor a browser would land on when a press falls on something
 * it cannot focus — `main.wing[tabindex="-1"]` on every page of this site.
 */
function focusableAncestor(node) {
	for (let el = node; el; el = el.parentElement) if (isFocusable(el)) return el;
	return null;
}

/**
 * Move focus for real and let the browser raise its own `blur`/`focusout`. Hand
 * made `FocusEvent`s are not the same thing: a widget cannot tell them apart, but
 * a test cannot tell a missing handler from a missed one either, and a whole class
 * of dismissal bug walked past the synthetic version unnoticed.
 *
 * The decision is made from what *can* take focus, never from where focus ended up
 * afterwards: a widget that answers the focus move by pulling focus back
 * synchronously — which is the fix under test — would otherwise look like a press
 * that moved nothing, and the helper would blur the focus it just won back. A
 * target that cannot hold focus is the page-at-large case, and a browser spells
 * that a blur onto `<body>`.
 */
function moveFocusTo(target) {
	const before = document.activeElement;
	if (isFocusable(target) && target !== before) {
		target.focus({ preventScroll: true });
		return;
	}
	if (before && before !== document.body) before.blur();
}

/** A real click on a trigger leaves focus on it, which is what a press can take. */
function focusTrigger(trigger, item) {
	if (trigger !== item && document.activeElement !== trigger) trigger.focus({ preventScroll: true });
}

/**
 * Pick an item in an open list the way a mouse does: mousedown, then the focus
 * move its default causes, then mouseup and click on whatever the pointer is
 * over by then.
 *
 * This exists because `item.click()` cannot fail in the one way a dropdown fails.
 * Nothing inside these lists is focusable — that is the point of keeping the
 * highlight in `aria-activedescendant` — so a mousedown left alone hands focus to
 * the nearest focusable ancestor (`main.wing[tabindex="-1"]` on every page), a
 * widget that dismisses on focus loss hides its own list before `mouseup`, and
 * Chromium, which reads a click as the place the pointer went down *and* the
 * place it came up, gives the click to an ancestor of the option. The menu
 * closes, nothing is chosen, and a bare `.click()` still passes. A bare
 * `.click()` proves a handler is bound; only a sequence like this one says
 * whether the click would have reached it.
 *
 * The focus move is a real one, so the blur the widget has to survive is the
 * browser's own — and it happens only when the press stood, because a cancelled
 * `mousedown` never reaches the browser's focus handling at all. `focusTarget` is
 * where focus goes; left out, the helper infers the nearest focusable ancestor the
 * way a browser does. `panel` is the open list, `trigger` the control whose click
 * opened it (focused first, as a real click would). Returns the clicked element.
 */
export function mousePick(item, { panel, trigger = item, focusTarget = null } = {}) {
	focusTrigger(trigger, item);
	const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window });
	item.dispatchEvent(press);
	if (press.defaultPrevented) {
		// The widget refused the focus move, so the pointer is still on the item.
		item.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
		item.click();
		return item;
	}
	moveFocusTo(focusTarget || focusableAncestor(item.parentElement) || document.body);
	const target = panel && panel.hidden ? panel.parentElement : item;
	target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
	target.click();
	return target;
}

/**
 * A mousedown at a point in the page, asked as a yes/no question: did something
 * cancel it? Both dropdowns cancel mousedown across their own list — see
 * `mousePick` — so a test needs to say which presses must survive that.
 */
export function pressAt(target, x, y) {
	const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y });
	target.dispatchEvent(event);
	return event.defaultPrevented;
}

/**
 * One pixel past the client box of a scrolling panel, which is where Chromium
 * reports a press on that panel's own vertical bar. `offsetX` is measured from the
 * target's padding box, so a press on the bar arrives with coordinates past
 * `clientWidth` — exactly the arithmetic `js/ui/scrollbar.js` reads.
 */
export function pastPanelEdge(panel) {
	const box = panel.getBoundingClientRect();
	const border = parseFloat(getComputedStyle(panel).borderLeftWidth) || 0;
	return box.left + border + panel.clientWidth + 1;
}

/**
 * A press on a scrolling panel's own scroll bar, replayed in the order Chromium
 * produces it, for widgets that must survive it.
 *
 * `mousePick` covers the press a widget refuses. This is the one it must not: the
 * bar, where cancelling `mousedown` stops the thumb. The event order comes from a
 * capture-phase log of a real press on a real five-hundred-row menu — `pointerdown`
 * and `mousedown` on the panel with coordinates past its client box, then
 * `focusout`/`focusin` as the browser moves focus from the control to
 * `<main class="wing" tabindex="-1">` of its own accord, then the release coming
 * back on the panel.
 *
 * The focus move is the test. A press replayed without it only proves the widget
 * spared the bar, which the broken version also did; what it closed was the list,
 * one event later, on a `focusout` indistinguishable from a keyboard Tab out.
 * The move is a real one, so the blur events are the browser's own rather than
 * hand-made ones, and `trigger` is focused first because a real click on it left
 * focus there — with nothing holding focus there is no focus to lose and nothing to
 * test. `focusTarget` is where it goes; left out it is inferred from the nearest
 * focusable ancestor exactly as `mousePick` does. Do not leave it out on a fragment
 * with no focusable ancestor: the move is then a blur onto `<body>`, whose
 * `focusout` carries a null `relatedTarget`, which both widgets let go on purpose —
 * the press would look survived while testing nothing.
 *
 * One liberty: a browser sends **no** `click` for a press on the trough, and this
 * replay sends one anyway, so the case also proves the panel survives a click
 * landing on itself. That is harsher than reality, not faithful to it.
 *
 * Returns whether the press survived (true = the thumb can be dragged).
 */
export function scrollbarPress(panel, { trigger = document.activeElement, focusTarget = null } = {}) {
	const x = pastPanelEdge(panel);
	const y = Math.round(panel.getBoundingClientRect().top + panel.clientHeight / 2);
	const at = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
	const pointer = { ...at, pointerId: 1, isPrimary: true };

	focusTrigger(trigger, panel);
	panel.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
	const down = new MouseEvent("mousedown", { ...at, buttons: 1 });
	panel.dispatchEvent(down);
	// A cancelled press never reaches the browser's focus handling at all, which
	// is the very thing that makes a bar press worth sparing.
	if (!down.defaultPrevented) moveFocusTo(focusTarget || focusableAncestor(panel) || document.body);
	panel.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
	panel.dispatchEvent(new MouseEvent("mouseup", { ...at, buttons: 0 }));
	panel.dispatchEvent(new MouseEvent("click", at));
	return !down.defaultPrevented;
}

export function submit(form) {
	form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export function text(root, selector) {
	const node = root.querySelector(selector);
	return node ? node.textContent.trim() : null;
}

/* ---------- running ---------- */

export async function run() {
	snapshotStorage();
	const started = performance.now();
	const results = [];
	let failed = 0;

	const report = document.querySelector("[data-report]");

	for (const group of suites) {
		const heading = document.createElement("h2");
		heading.textContent = group.name;
		report?.appendChild(heading);

		for (const item of group.tests) {
			clearStorage();
			let error = null;
			try {
				await item.fn();
			} catch (caught) {
				error = caught;
				failed += 1;
			}
			results.push({ suite: group.name, name: item.name, ok: !error, message: error ? error.message : "" });

			const row = document.createElement("p");
			row.className = error ? "row is-fail" : "row";
			const mark = document.createElement("b");
			mark.textContent = error ? "FAIL" : "ok";
			const label = document.createElement("span");
			label.textContent = item.name;
			row.append(mark, label);
			if (error) {
				const detail = document.createElement("code");
				detail.textContent = error.message;
				row.appendChild(detail);
			}
			report?.appendChild(row);
		}
	}

	clearStorage();
	restoreStorage();

	const total = results.length;
	const summary = { total, failed, passed: total - failed, ms: Math.round(performance.now() - started) };

	if (report) {
		const line = document.createElement("p");
		line.className = summary.failed ? "summary is-fail" : "summary";
		line.textContent = `${summary.passed} / ${summary.total} passing in ${summary.ms} ms`;
		report.appendChild(line);
	}
	document.title = summary.failed ? `${summary.failed} failing` : `all ${summary.total} passing`;
	window.__TEST_RESULT__ = summary;

	if (new URLSearchParams(window.location.search).has("json")) {
		document.body.innerHTML = "";
		const pre = document.createElement("pre");
		pre.textContent = JSON.stringify({ summary, results }, null, 2);
		document.body.appendChild(pre);
	}

	return summary;
}
