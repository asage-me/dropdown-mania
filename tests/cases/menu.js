/**
 * ui/menu.js — the dropdown the education exhibits and the home-page drawer
 * hand-author with data-menu-item. It is a second implementation of the same
 * idea as ui/select.js, written separately, so the two can disagree about what
 * a click does; that disagreement is the bug these tests exist to prevent.
 */

import {
	assert, freshModule, host, mousePick, pastPanelEdge, pressAt, release, scrollbarPress, suite, test, tick,
} from "../harness.js";

const MARKUP = `
	<div class="wing" tabindex="-1">
		<div class="pick">
			<button type="button" class="pick__trigger" aria-haspopup="listbox" aria-expanded="false"
				aria-controls="pick-list" aria-labelledby="pick-label pick-value">
				<span class="pick__value" id="pick-value">Choose a method…</span>
			</button>
			<ul class="pick__list" id="pick-list" role="listbox" aria-labelledby="pick-label" hidden>
				<li class="pick__item" data-menu-item>Cold storage</li>
				<li class="pick__item" data-menu-item>Desiccation</li>
				<li class="pick__item" data-menu-item>Darkness and 18&#176;C</li>
			</ul>
		</div>
		<button type="button" id="elsewhere">Elsewhere</button>
	</div>`;

const LONG = `
	<div class="wing" tabindex="-1">
		<div class="pick">
			<button type="button" class="pick__trigger" aria-haspopup="listbox" aria-expanded="false">Rows</button>
			<ul class="pick__list" role="listbox" hidden></ul>
		</div>
	</div>`;

/** Mounts the fixture in the page and wires it up the way a mode does. */
async function setup(html = MARKUP) {
	const { createMenu } = await freshModule("js/ui/menu.js");
	const node = host(html);
	const picked = [];
	const menu = createMenu({
		trigger: node.querySelector(".pick__trigger"),
		panel: node.querySelector(".pick__list"),
		onSelect: (item) => picked.push(item.textContent.trim()),
	});
	return {
		node,
		menu,
		picked,
		root: node.querySelector(".pick"),
		trigger: node.querySelector(".pick__trigger"),
		panel: node.querySelector(".pick__list"),
		items: () => [...node.querySelectorAll("[data-menu-item]")],
	};
}

suite("ui/menu.js", () => {
	test("the trigger opens the listbox, describes it, and closes it again", async () => {
		const w = await setup();
		try {
			assert.ok(w.panel.hidden, "the list is closed until the trigger is pressed");
			w.trigger.click();
			await tick(10);
			assert.ok(w.root.classList.contains("is-open"), "the panel is open after a trigger click");
			assert.eq(w.trigger.getAttribute("aria-expanded"), "true", "aria-expanded has to follow");
			w.trigger.click();
			await tick(10);
			assert.notOk(w.root.classList.contains("is-open"), "a second trigger click closes it");
		} finally {
			w.menu.destroy();
			release(w.node);
		}
	});

	test("Enter commits the highlighted option and leaves focus on the trigger", async () => {
		const w = await setup();
		try {
			w.trigger.focus();
			w.trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
			w.trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
			await tick(10);
			assert.deepEq(w.picked, ["Cold storage"], "ArrowDown enters the list at the top, Enter commits it");
			assert.eq(document.activeElement, w.trigger, "the trigger is the only tab stop, so it keeps focus");
		} finally {
			w.menu.destroy();
			release(w.node);
		}
	});

	/**
	 * The bug ui/select.js shipped with, in the other widget. Nothing inside a
	 * data-menu-item list is focusable, so an uncancelling mousedown hands focus
	 * to main.wing[tabindex="-1"], focus-loss dismissal hides the panel, and the
	 * click Chromium computes from the down and up targets belongs to an ancestor
	 * of the item: the menu closes and nothing is chosen.
	 */
	test("a mouse pick commits although mousedown moves focus to the wing around it", async () => {
		const w = await setup();
		try {
			const wing = w.node.querySelector(".wing");
			w.trigger.focus();
			w.trigger.click();
			await tick(10);
			assert.ok(w.root.classList.contains("is-open"), "the menu has to be open for a pick to mean anything");

			const option = w.items().find((item) => item.textContent.trim() === "Desiccation");
			const landed = mousePick(option, { panel: w.panel, trigger: w.trigger, focusTarget: wing });
			await tick(10);

			assert.eq(landed, option, "the click has to land on the option, not the page around it");
			assert.deepEq(w.picked, ["Desiccation"], "a mouse pick must commit the option");
			assert.notOk(w.root.classList.contains("is-open"), "a mouse pick must close the menu");
		} finally {
			w.menu.destroy();
			release(w.node);
		}
	});

	test("a click outside closes the menu and picks nothing", async () => {
		const w = await setup();
		try {
			w.trigger.click();
			await tick(10);
			w.node.querySelector("#elsewhere").click();
			await tick(10);
			assert.notOk(w.root.classList.contains("is-open"), "a click outside the menu must close it");
			assert.deepEq(w.picked, [], "closing on an outside click must not commit");
		} finally {
			w.menu.destroy();
			release(w.node);
		}
	});

	test("focus leaving for the palette closes the menu and stays where the visitor put it", async () => {
		const w = await setup();
		try {
			const elsewhere = w.node.querySelector("#elsewhere");
			w.trigger.click();
			await tick(10);
			assert.ok(w.root.classList.contains("is-open"), "the menu has to be open for dismissal to mean anything");

			// Same reason as in cases/select.js: Chromium dispatches no focus events
			// in a document that does not hold system focus, so the event is built by
			// hand. The handler reads relatedTarget, so this supplies that.
			let refocusAttempts = 0;
			const realFocus = w.trigger.focus.bind(w.trigger);
			w.trigger.focus = (...args) => {
				refocusAttempts += 1;
				return realFocus(...args);
			};
			try {
				w.trigger.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: elsewhere }));
			} finally {
				delete w.trigger.focus;
			}
			await tick(10);

			assert.notOk(w.root.classList.contains("is-open"), "focus moving away must close the menu");
			assert.eq(refocusAttempts, 0, "focus belongs to the control it moved to, not back to the trigger");
		} finally {
			w.menu.destroy();
			release(w.node);
		}
	});

	/**
	 * Cancelling mousedown is what stops a scrollbar thumb from being dragged,
	 * and .pick__list and .combo__list both scroll, so this widget needs the same
	 * exemption ArchiveSelect has. As in cases/select.js, sparing the press is
	 * only half of it: the browser's own focus move for a press inside an open
	 * list is what actually closed the menu, so the assertions after
	 * `scrollbarPress` are the ones the first attempt at this bug had wrong.
	 */
	test("a scrolling menu survives its own scrollbar and spares nothing else", async () => {
		const w = await setup(LONG);
		try {
			w.panel.innerHTML = Array.from({ length: 40 }, (_, row) => {
				return `<li class="pick__item" data-menu-item>Row ${String(row).padStart(2, "0")}</li>`;
			}).join("");
			w.panel.style.setProperty("max-height", "80px", "important");
			w.panel.style.setProperty("overflow-y", "auto", "important");

			w.trigger.focus();
			w.trigger.click();
			await tick(20);
			// Without these two checks the first assertion below would be free.
			assert.ok(/auto|scroll/.test(getComputedStyle(w.panel).overflowY),
				"the stylesheet has to let this list scroll or there is no bar to spare");
			assert.ok(w.panel.scrollHeight > w.panel.clientHeight, "the test menu has to be tall enough to scroll");

			// The press and the focus move it causes, in the order Chromium makes
			// them: sparing the press is the thumb; surviving the focus move is the
			// list staying open.
			const dragged = scrollbarPress(w.panel, { trigger: w.trigger, focusTarget: w.node.querySelector(".wing") });
			assert.ok(dragged, "a press on the bar must keep its default, or the thumb cannot be dragged");
			await tick(20);
			assert.notOk(w.panel.hidden, "a press on the menu's own scrollbar closed the list on top of the thumb");
			assert.eq(document.activeElement, w.trigger,
				"the menu stayed open but left its focus out on the page, where no key can reach it");

			const edge = pastPanelEdge(w.panel);
			const option = w.panel.querySelector("[data-menu-item]");
			const optionBox = option.getBoundingClientRect();
			assert.ok(pressAt(option, optionBox.left + 4, optionBox.top + 3), "a press on an option stays cancelled");
			assert.ok(pressAt(option, edge, optionBox.top + 3),
				"an option reaching past the client edge is still an option, not a bar");
			assert.ok(w.root.classList.contains("is-open"), "none of those presses may close the menu");
		} finally {
			w.menu.destroy();
			release(w.node);
		}
	});

	test("Escape closes the menu without committing", async () => {
		const w = await setup();
		try {
			w.trigger.focus();
			w.trigger.click();
			await tick(10);
			w.trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			await tick(10);
			assert.notOk(w.root.classList.contains("is-open"), "Escape has to close the menu");
			assert.deepEq(w.picked, [], "Escape must not commit");
		} finally {
			w.menu.destroy();
			release(w.node);
		}
	});

	test("destroy stops the trigger, the panel and the document from answering", async () => {
		const w = await setup();
		try {
			w.trigger.click();
			await tick(10);
			w.items()[1].click();
			await tick(10);
			assert.deepEq(w.picked, ["Desiccation"], "a pick before teardown commits");

			w.menu.destroy();
			w.trigger.click();
			w.panel.hidden = false;
			w.items()[2].click();
			w.trigger.dispatchEvent(
				new FocusEvent("focusout", { bubbles: true, relatedTarget: w.node.querySelector("#elsewhere") }),
			);
			await tick(10);

			assert.deepEq(w.picked, ["Desiccation"], "after destroy a leftover panel click must not commit");
			assert.notOk(w.root.classList.contains("is-open"), "after destroy nothing may mark the menu open");
			assert.eq(w.trigger.getAttribute("aria-expanded"), "false", "and aria-expanded stays closed");
		} finally {
			release(w.node);
		}
	});
});
