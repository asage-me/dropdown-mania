/**
 * Namespaced, failure-tolerant localStorage.
 * Private-mode browsers and disabled storage must never break a page.
 */

const NS = "dropdown-archive";

function key(name) {
	return `${NS}:${name}`;
}

export function load(name, fallback = null) {
	try {
		const raw = localStorage.getItem(key(name));
		if (raw === null) return fallback;
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}

export function save(name, value) {
	try {
		localStorage.setItem(key(name), JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

export function remove(name) {
	try {
		localStorage.removeItem(key(name));
	} catch {
		/* ignore */
	}
}

/** Merge a partial object over stored defaults for one key. */
export function loadMerged(name, defaults) {
	return { ...defaults, ...(load(name, {}) || {}) };
}
