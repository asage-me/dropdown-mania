/**
 * The dropdown widget itself. This is the module with the most machinery and
 * the most history of self-inflicted bugs, so the tests aim at the seams where
 * application code meets it rather than at pixel behaviour.
 */

import {
	assert, choose, freshModule, host, mousePick, pastPanelEdge, pressAt, release, scrollbarPress, suite, test, tick,
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

function scrollableSelect(id) {
	const node = host(`<div class="wing" tabindex="-1"><select id="${id}"></select></div>`);
	const select = node.querySelector("select");
	for (let row = 1; row <= 40; row += 1) {
		select.append(new Option(`Row ${String(row).padStart(3, "0")}`, String(row)));
	}
	return { node, select };
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

			mousePick(options.find((option) => option.textContent.includes("Gold")), {
				panel: root.querySelector(".sel__menu"), trigger, focusTarget: w.node,
			});
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

	/**
	 * The widget owns two document-level listeners, and both halves of the escape
	 * hatch DD-004 promises visitors were broken at once: the focusout guard
	 * tested the element *losing* focus rather than the one gaining it, so it
	 * never fired for the case it existed for, and nothing watched for a click
	 * outside at all. The menu then followed nothing and ignored everything.
	 */
	test("a click outside the widget dismisses it", async () => {
		const { enhanceSelects, destroySelectsIn, selectTrigger } = await freshModule("js/ui/select.js");
		const node = host(`
			<select id="one"><option value="a">A</option></select>
			<p id="plain">Nothing interactive here</p>`);
		try {
			enhanceSelects(node);
			const trigger = selectTrigger(node.querySelector("#one"));
			const root = node.querySelector(".sel");

			trigger.focus();
			trigger.click();
			await tick(10);
			assert.ok(root.classList.contains("is-open"), "the menu has to be open for dismissal to mean anything");

			// A target that takes no focus: no focusout fires, so this half of the
			// escape hatch can only be served by watching clicks on the document.
			node.querySelector("#plain").click();
			await tick(10);
			assert.notOk(root.classList.contains("is-open"), "a click outside the widget must close the listbox");
		} finally {
			destroySelectsIn(node);
			release(node);
		}
	});

	test("focus leaving the widget closes it and stays where the visitor put it", async () => {
		const { enhanceSelects, destroySelectsIn, selectTrigger } = await freshModule("js/ui/select.js");
		const node = host(`
			<select id="one"><option value="a">A</option></select>
			<button id="elsewhere" type="button">Elsewhere</button>`);
		try {
			enhanceSelects(node);
			const trigger = selectTrigger(node.querySelector("#one"));
			const other = node.querySelector("#elsewhere");
			const root = node.querySelector(".sel");

			trigger.click();
			await tick(10);
			assert.ok(root.classList.contains("is-open"), "the menu has to be open for dismissal to mean anything");

			// Focus is moved by dispatching focusout by hand. Chromium fires no focus
			// events in a document that does not hold system focus — a background tab,
			// or a windowed run with another app in front — so a test that just called
			// focus() here would silently assert nothing. The handler reads
			// relatedTarget, so that is what this supplies.
			let refocusAttempts = 0;
			const realFocus = trigger.focus.bind(trigger);
			trigger.focus = (...args) => {
				refocusAttempts += 1;
				return realFocus(...args);
			};
			try {
				trigger.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: other }));
			} finally {
				delete trigger.focus;
			}
			await tick(10);

			assert.notOk(root.classList.contains("is-open"), "focus moving away must close the listbox");
			assert.eq(refocusAttempts, 0, "focus belongs to the control it moved to, not back to the widget");
		} finally {
			destroySelectsIn(node);
			release(node);
		}
	});

	/**
	 * The bug this test now keeps out: a mousedown on an option that is allowed
	 * to run its default hands focus to the nearest focusable ancestor — on every
	 * page of this archive `<main class="wing" tabindex="-1">` — the widget's
	 * focus-loss dismissal reads that as the visitor leaving, the menu hides
	 * before mouseup, and the click goes to the exhibit instead of the option.
	 * Nothing is chosen, and a test that only ever called `.click()` sees none
	 * of it, which is how 83 green tests shipped this.
	 */
	test("a mouse pick commits although mousedown moves focus to the wing around it", async () => {
		const { enhanceSelects, destroySelectsIn, selectTrigger } = await freshModule("js/ui/select.js");
		const node = host(`<div class="wing" tabindex="-1">
			<select id="one"><option value="a">A</option><option value="b">B</option></select>
		</div>`);
		try {
			enhanceSelects(node);
			const trigger = selectTrigger(node.querySelector("#one"));
			const wing = node.querySelector(".wing");
			const root = node.querySelector(".sel");

			trigger.focus();
			trigger.click();
			await tick(10);
			assert.ok(root.classList.contains("is-open"), "the menu has to be open for a pick to mean anything");

			const option = [...root.querySelectorAll(".sel__option")].find((item) => item.textContent === "B");
			const landed = mousePick(option, { panel: root.querySelector(".sel__menu"), trigger, focusTarget: wing });
			await tick(10);

			assert.eq(landed, option, "the click has to land on the option, not the page around it");
			assert.eq(node.querySelector("#one").value, "b", "a mouse pick must write the value");
			assert.notOk(root.classList.contains("is-open"), "a mouse pick must close the listbox");
		} finally {
			destroySelectsIn(node);
			release(node);
		}
	});

	/**
	 * Cancelling mousedown is also what stops a scrollbar thumb from being
	 * dragged, and these menus do scroll — The Long Menu in Lazy Drop is 500 rows
	 * inside a box capped at 290px. So the press has to be spared on the bar and
	 * cancelled everywhere else, including on a row whose own box reaches past the
	 * panel's client edge.
	 *
	 * Sparing the press turned out to be half the job, and the half that shipped
	 * first was the half that did not work. Chromium takes focus off the trigger
	 * for a press inside an open list even though nothing there is focusable, the
	 * focusout dismissal reads that as the visitor leaving, and the menu closed
	 * under the thumb anyway — “clicking on it just closes the menu”. So the
	 * assertion that counts is the one after the focus move, in the order a real
	 * browser makes it: see `scrollbarPress` for where that order came from.
	 */
	test("a scrolling menu survives its own scrollbar and spares nothing else", async () => {
		const { enhanceSelects, destroySelectsIn, selectTrigger } = await freshModule("js/ui/select.js");
		const { node, select } = scrollableSelect("long");
		try {
			enhanceSelects(node);
			const root = node.querySelector(".sel");
			const menu = root.querySelector(".sel__menu");
			const wing = node.querySelector(".wing");
			const trigger = selectTrigger(select);

			trigger.focus();
			trigger.click();
			await tick(20);
			// Without this the first assertion below would be free.
			assert.ok(menu.scrollHeight > menu.clientHeight, "the test menu has to be tall enough to scroll");

			const dragged = scrollbarPress(menu, { trigger, focusTarget: wing });
			assert.ok(dragged, "a press on the bar must keep its default, or the thumb cannot be dragged");
			await tick(20);
			assert.notOk(menu.hidden, "a press on the menu's own scrollbar closed the list on top of the thumb");
			assert.eq(document.activeElement, trigger,
				"the list stayed open but left its focus out on the page, where no key can reach it");

			const option = root.querySelector(".sel__option");
			const optionBox = option.getBoundingClientRect();
			assert.ok(pressAt(option, optionBox.left + 6, optionBox.top + 4), "a press on an option stays cancelled");
			assert.ok(pressAt(option, pastPanelEdge(menu), optionBox.top + 4),
				"an option reaching past the client edge is still an option, not a bar");
		} finally {
			destroySelectsIn(node);
			release(node);
		}
	});

	/**
	 * The case above names the element focus moves to. This one names nothing, which
	 * is the case the next author writes: `scrollbarPress` used to default that move
	 * to `<body>`, and a focus change onto nothing reaches the widget with
	 * `relatedTarget` null — the one focusout both widgets let go on purpose, so a
	 * bar test written that way cannot see a focus-away dismissal any more than the
	 * broken build could. It infers the target now, and reading what the widget was
	 * actually told is what keeps this honest: delete the inference in
	 * `tests/harness.js` and this fails on the next line, not silently.
	 */
	test("a bar press with no focus target named still moves focus somewhere real", async () => {
		const { enhanceSelects, destroySelectsIn, selectTrigger } = await freshModule("js/ui/select.js");
		const { node, select } = scrollableSelect("bar");
		const landed = [];
		const watch = (event) => landed.push(event.relatedTarget);
		document.addEventListener("focusout", watch, true);
		try {
			enhanceSelects(node);
			const root = node.querySelector(".sel");
			const menu = root.querySelector(".sel__menu");
			const trigger = selectTrigger(select);

			trigger.focus();
			trigger.click();
			await tick(20);

			scrollbarPress(menu, { trigger });
			assert.ok(landed.length > 0, "the bar press moved no focus at all, so this case cannot see a dismissal");
			assert.eq(landed.find((target) => target !== null), node.querySelector(".wing"),
				"focus went out to nothing (`relatedTarget` null), which both widgets ignore, so the press tested nothing");
			assert.notOk(menu.hidden, "a bar press that did move focus closed the list");
			assert.eq(document.activeElement, trigger, "the list stayed open but left its focus out on the page");
		} finally {
			document.removeEventListener("focusout", watch, true);
			destroySelectsIn(node);
			release(node);
		}
	});

	test("input inside the widget is not treated as outside", async () => {
		const { enhanceSelects, destroySelectsIn, selectTrigger } = await freshModule("js/ui/select.js");
		const node = host(`<select id="one"><option value="a">A</option></select>`);
		try {
			enhanceSelects(node);
			const trigger = selectTrigger(node.querySelector("#one"));
			const root = node.querySelector(".sel");

			trigger.click();
			await tick(10);
			root.querySelector(".sel__menu").click();
			await tick(10);
			assert.ok(root.classList.contains("is-open"), "a click in the menu's own padding is not an escape");
		} finally {
			destroySelectsIn(node);
			release(node);
		}
	});
});
