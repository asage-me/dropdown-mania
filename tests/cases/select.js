/**
 * The dropdown widget itself. This is the module with the most machinery and
 * the most history of self-inflicted bugs, so the tests aim at the seams where
 * application code meets it rather than at pixel behaviour.
 */

import {
	assert, choose, freshModule, host, release, suite, test, tick,
} from "../harness.js";

const MARKUP = `
	<label for="pick">Favourite</label>
	<select id="pick">
		<option value="">Choose…</option>
		<optgroup label="Warm">
			<option value="red">Red</option>
			<option value="gold">Gold</option>
		</optgroup>
		<option value="ink">Ink</option>
	</select>`;

async function widget(markup = MARKUP) {
	const { enhanceSelects, destroySelectsIn, refreshSelect, syncSelect, selectTrigger } = await freshModule("js/ui/select.js");
	const node = host(markup);
	const select = node.querySelector("select");
	enhanceSelects(node);
	return {
		node, select, enhanceSelects, destroySelectsIn, refreshSelect, syncSelect, selectTrigger,
		cleanup() { destroySelectsIn(node); release(node); },
	};
}

suite("ui/select.js", () => {
	test("enhanceSelects wraps a native select and marks it so it is never upgraded twice", async () => {
		const w = await widget();
		try {
			assert.eq(w.select.getAttribute("data-archive-select"), "");
			assert.ok(w.node.querySelector(".sel"), "no widget root was created");
			assert.eq(w.enhanceSelects(w.node).length, 0, "a second pass must create nothing");
			assert.eq(w.node.querySelectorAll(".sel").length, 1, "a second pass must not nest a second widget");
		} finally { w.cleanup(); }
	});

	test("the native element stays in the tree so the form value and the a11y tree survive", async () => {
		const w = await widget();
		try {
			assert.ok(w.node.contains(w.select), "the native select must not be removed");
			choose(w.select, "gold");
			assert.eq(w.select.value, "gold");
			assert.ok(w.selectTrigger(w.select), "the widget must expose its trigger");
		} finally { w.cleanup(); }
	});

	test("opening lists every option, groups included, and picking one moves focus back", async () => {
		const w = await widget();
		try {
			const trigger = w.selectTrigger(w.select);
			trigger.click();
			await tick(20);
			const root = w.node.querySelector(".sel");
			assert.ok(root.classList.contains("is-open"), "clicking the trigger must open the listbox");
			const options = [...root.querySelectorAll(".sel__option")];
			assert.eq(options.length, 4, "one placeholder, two grouped, one plain");
			assert.ok(root.querySelectorAll(".sel__group").length >= 1, "optgroup headings must be rendered");

			options.find((option) => option.textContent.includes("Gold")).click();
			await tick(20);
			assert.eq(w.select.value, "gold");
			assert.notOk(root.classList.contains("is-open"), "picking must close the listbox");
			// The trigger is the tab stop, so it is the trigger that gets focus back.
			assert.eq(document.activeElement, trigger, "focus must return to the control, not the void");
		} finally { w.cleanup(); }
	});

	/**
	 * The router upgrades every select in an outlet before a mode mounts, so a
	 * select authored empty is upgraded empty. Filling it afterwards and only
	 * calling paint() leaves the widget showing nothing — this is the exact
	 * mistake the games used to make.
	 */
	test("refreshOptions picks up options added after the widget was built", async () => {
		const { enhanceSelects, destroySelectsIn, refreshSelect } = await freshModule("js/ui/select.js");
		const node = host(`<select id="late"></select>`);
		try {
			enhanceSelects(node);
			const select = node.querySelector("select");
			assert.eq(node.querySelectorAll(".sel__option").length, 0);

			select.append(new Option("First", "a"), new Option("Second", "b"));
			refreshSelect(select);

			const labels = [...node.querySelectorAll(".sel__option")].map((n) => n.textContent);
			assert.eq(labels.length, 2, "refreshSelect must re-read the choices");
			assert.includes(labels.join("|"), "Second");
		} finally {
			destroySelectsIn(node);
			release(node);
		}
	});

	test("syncSelect repaints the label when code changes the value", async () => {
		const w = await widget();
		try {
			const value = w.node.querySelector(".sel__value");
			w.select.value = "ink";
			w.syncSelect(w.select);
			await tick(10);
			assert.includes(value.textContent, "Ink");
		} finally { w.cleanup(); }
	});

	test("destroySelectsIn tears the widget down and leaves a clean native select", async () => {
		const w = await widget();
		const trigger = w.selectTrigger(w.select);
		w.destroySelectsIn(w.node);
		assert.eq(w.node.querySelector(".sel"), null, "the widget root must be gone");
		assert.notOk(w.select.hasAttribute("data-archive-select"), "the native select must be re-claimable");
		assert.notOk(trigger?.isConnected, "the trigger must be removed, not merely hidden");
		release(w.node);
	});

	test("only one widget is open at a time", async () => {
		const { enhanceSelects, destroySelectsIn, selectTrigger } = await freshModule("js/ui/select.js");
		const node = host(`
			<select id="one"><option value="a">A</option></select>
			<select id="two"><option value="b">B</option></select>`);
		try {
			enhanceSelects(node);
			selectTrigger(node.querySelector("#one")).click();
			await tick(10);
			selectTrigger(node.querySelector("#two")).click();
			await tick(10);
			const open = [...node.querySelectorAll(".sel")].filter((root) => root.classList.contains("is-open"));
			assert.eq(open.length, 1, "two open listboxes at once is a keyboard trap");
		} finally {
			destroySelectsIn(node);
			release(node);
		}
	});
});
