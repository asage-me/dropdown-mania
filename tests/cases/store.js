/**
 * The storage layer. Thin, but everything else trusts it, and it is the one
 * module whose failure is silent by design — a private-mode browser must not
 * break a page, so every path swallows. These tests pin that swallowing.
 */

import { assert, freshModule, suite, test } from "../harness.js";

suite("lib/store.js", () => {
	test("namespaces every key so the archive cannot collide with another app on the same origin", async () => {
		const { save } = await freshModule("js/lib/store.js");
		save("probe", { a: 1 });
		assert.ok(window.localStorage.getItem("dropdown-archive:probe"), "expected the namespaced key to be written");
		assert.eq(window.localStorage.getItem("probe"), null, "expected no un-namespaced key");
	});

	test("load falls back when nothing is stored", async () => {
		const { load } = await freshModule("js/lib/store.js");
		assert.eq(load("absent", "fallback"), "fallback");
		assert.eq(load("absent"), null);
	});

	test("loadMerged layers stored values over defaults without losing untouched defaults", async () => {
		const { loadMerged, save } = await freshModule("js/lib/store.js");
		save("merged", { kept: "from-defaults" });
		const first = loadMerged("merged", { kept: "from-defaults", added: 7 });
		assert.eq(first.kept, "from-defaults");
		assert.eq(first.added, 7, "a field added after shipping must appear without a save-version bump");

		save("merged", { kept: "overridden", added: 9 });
		assert.deepEq(loadMerged("merged", { kept: "from-defaults", added: 7 }), { kept: "overridden", added: 9 });
	});

	test("corrupt JSON reads as the default rather than throwing", async () => {
		const { load, loadMerged } = await freshModule("js/lib/store.js");
		window.localStorage.setItem("dropdown-archive:broken", "{not json");
		assert.eq(load("broken", "fallback"), "fallback");
		assert.deepEq(loadMerged("broken", { a: 1 }), { a: 1 });
	});

	test("a storage quota failure returns false instead of throwing", async () => {
		const { save } = await freshModule("js/lib/store.js");
		const original = window.localStorage.setItem.bind(window.localStorage);
		window.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
		try {
			assert.eq(save("quota", { big: true }), false, "save() must report failure, not throw through a click handler");
		} finally {
			window.localStorage.setItem = original;
		}
	});
});
