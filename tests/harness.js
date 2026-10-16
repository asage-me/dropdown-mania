/**
 * A test runner with no build step, because the site has no build step.
 *
 * There is no package.json here and adding one would be the beginning of a
 * toolchain nobody asked for, so this is a page: open /tests/ over the same
 * static server the site uses and it runs. `?json` prints the report as JSON
 * for a machine reader.
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
	return import(`../${path}?test=${importSeq}`);
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
 * Mount one exhibit into the real games.html. Returns the game's handle plus a
 * stub api that records which achievements it asked for.
 */
export async function mountExhibit(gameId) {
	const { loadTemplate } = await freshModule("js/core/templates.js");
	// Not freshModule: the widget keeps its registry in module scope, and the
	// games import the plain path. A second copy of the module would build
	// widgets the game's own refreshSelect() cannot see.
	const { destroySelectsIn, enhanceSelects } = await import("../js/ui/select.js");
	const game = { "find-path": () => freshModule("js/games/find-path.js"), hacker: () => freshModule("js/games/hacker.js"), "lazy-drop": () => freshModule("js/games/lazy-drop.js") }[gameId]();

	const container = host(await loadTemplate("../games.html"));
	const section = container.querySelector(`[data-game="${gameId}"]`);
	if (!section) throw new Error(`games.html has no [data-game="${gameId}"]`);
	enhanceSelects(section);

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
