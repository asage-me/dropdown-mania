/**
 * The education wing (js/modes/education.js), mounted for real.
 *
 * The wing is the one place the archive hand-wires a dropdown instead of using
 * js/ui/select.js or js/ui/menu.js, so it needs its own coverage: DD-006 is a
 * combobox that belongs to neither component, and the bugs the components have
 * already been taught to avoid show up here by a different route.
 *
 * The host reproduces index.html's wing — main.wing[tabindex="-1"] — because that
 * element is precisely what takes focus when a press is not cancelled. A bare div
 * would let the bug pass.
 */

import {
	assert, freshModule, host, mousePick, pressAt, release, scrollbarPress, suite, test, tick,
} from "../harness.js";

/** Keys are dispatched the way a keyboard produces them: the wing listens for
 *  `keydown` on the input and reads `event.key`. */
function keydown(node, key) {
	node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

async function education({ before = null } = {}) {
	const undo = before ? before() : null;
	let destroyed = false;
	const { loadTemplate } = await freshModule("js/core/templates.js");
	const mode = await freshModule("js/modes/education.js");
	const container = host('<main id="main-content" class="wing" tabindex="-1"></main>');
	const wing = container.firstElementChild;
	wing.innerHTML = await loadTemplate("../education.html");

	const unlocks = [];
	const api = {
		unlock: (id) => { unlocks.push(id); return true; },
		openRecords: () => {},
		navigate: () => {},
		openPalette: () => {},
	};
	// A mode is mounted as mount(root, route, api) (js/core/router.js:106) — unlike
	// a game, which is mount(root, api). Passing the api in the route slot would
	// quietly hand every exhibit an undefined api.
	const route = { path: "/education", id: "education", mode: "education", sub: null };
	const teardown = mode.default.mount(wing, route, api);

	return {
		wing,
		unlocks,
		mode: mode.default,
		q: (selector) => wing.querySelector(selector),
		/** Type into DD-006 and leave its list open, the way a reader arrives. */
		async search(query) {
			const input = this.q("#dd006-input");
			input.focus();
			input.value = query;
			input.dispatchEvent(new Event("input", { bubbles: true }));
			await tick(10);
			return { input, list: this.q("#dd006-list"), count: this.q("[data-dd006-count]") };
		},
		/** The active row is whichever one the wing points at with aria-active-
		 *  descendant; asking it rather than counting keeps the test honest if the
		 *  highlight ever moves by another route. */
		activeRow() {
			const id = this.q("#dd006-input").getAttribute("aria-activedescendant");
			return id ? this.wing.querySelector(`#${id}`) : null;
		},
		// Idempotent: a case that unmounts the wing mid-test to see what the wing
		// leaves behind still has to survive its own finally block.
		destroy() {
			if (destroyed) return;
			destroyed = true;
			if (typeof teardown === "function") teardown();
			else teardown?.unmount?.();
			release(container);
			undo?.();
		},
	};
}

suite("modes/education.js — the wing", () => {
	/**
	 * Nothing inside .combo__list is focusable — the highlight lives in
	 * aria-activedescendant — so a mousedown on a row, if nothing cancels it, hands
	 * focus to main.wing[tabindex="-1"] and the reader is back at the top of the
	 * document with the caret gone. js/ui/menu.js and js/ui/select.js both cancel
	 * the press for exactly this reason; DD-006 is the third dropdown in the archive
	 * and the only one that had not been taught.
	 */
	test("a mouse pick in DD-006 commits and keeps the caret in the input", async () => {
		const e = await education();
		try {
			const { list, count } = await e.search("photograph");
			const row = [...list.querySelectorAll(".combo__item")].find((node) => /Photograph/i.test(node.textContent));
			assert.ok(row, "filtering for “photograph” offered no Photograph row to pick");
			assert.notOk(list.hidden, "the list should be open while the reader is choosing");

			const box = row.getBoundingClientRect();
			assert.ok(
				pressAt(row, box.left + box.width / 2, box.top + box.height / 2),
				"a press on a DD-006 row is not cancelled, so the input loses focus to the wing"
			);

			const landed = mousePick(row, { panel: list, trigger: e.q("#dd006-input"), focusTarget: e.wing });
			await tick(200);
			assert.eq(landed, row, "the click has to land on the row, not the page around it");
			assert.match(count.textContent, /Selected: Photograph/, "a mouse pick did not commit");
			assert.ok(list.hidden, "the list stayed open after a pick");
			assert.eq(document.activeElement, e.q("#dd006-input"), "a mouse pick moved the caret out of the input");
		} finally { e.destroy(); }
	});

	/**
	 * The bar is the one press on this list that must keep its default, and sparing
	 * it turned out to be only half of making it work. Chromium moves focus off a
	 * control whose list is open for a press anywhere in that list, this exhibit
	 * closes its list on blur, and a reader who went to the bar for a scroll got a
	 * closed list and lost the caret with it. `scrollbarPress` replays the press and
	 * the focus move in the order the browser produces them; the wait is deliberately
	 * longer than the wing's blur grace period, since that timer is exactly where the
	 * list used to collapse.
	 */
	test("a press on DD-006's own scroll bar scrolls instead of closing the list", async () => {
		const e = await education();
		try {
			const { input, list } = await e.search("a");
			assert.ok(list.scrollHeight > list.clientHeight, "the list has to overflow, or there is no bar to press");

			const survived = scrollbarPress(list, { trigger: input, focusTarget: e.wing });
			await tick(200);
			assert.ok(survived, "the press on the bar was cancelled, so the thumb cannot be dragged");
			assert.notOk(list.hidden, "a press on the list's own scrollbar closed it on top of the thumb");
			assert.eq(document.activeElement, input, "a bar press left the caret outside the combobox");
			assert.eq(input.getAttribute("aria-expanded"), "true", "aria-expanded disagrees with the list on screen");
		} finally { e.destroy(); }
	});

	/**
	 * The other half: cancelling the press must not cost the exhibit its dismissal.
	 * The blur path waits out a grace period (a pick used to blur the input through
	 * the row), then hides the list once focus is genuinely outside the combobox.
	 */
	test("DD-006 still closes its list once focus really leaves the combobox", async () => {
		const e = await education();
		try {
			const { input, list } = await e.search("glass");
			assert.notOk(list.hidden, "typing should have opened the list");

			// A control in another exhibit: focus genuinely leaves [data-dd006].
			const elsewhere = [...e.wing.querySelectorAll("input, button, select, a[href]")]
				.find((node) => node !== input && !node.closest("[data-dd006]"));
			assert.ok(elsewhere, "the wing has no other focusable control to blur into");
			elsewhere.focus();
			await tick(200);

			assert.ok(list.hidden, "the list stayed open after focus left the combobox");
			assert.eq(input.getAttribute("aria-expanded"), "false", "aria-expanded still claims the list is open");
		} finally { e.destroy(); }
	});

	/**
	 * aria-activedescendant is a pointer into a list that is on screen. The moment the
	 * list is hidden the pointer has to go, or the screen reader is still reading an
	 * option the reader cannot see, and the next ArrowDown starts from a row that is
	 * not there. Every route out of the list has to clear it: Escape, a commit, and
	 * focus walking away.
	 */
	test("every way out of DD-006's list stops pointing at an option that is no longer shown", async () => {
		const e = await education();
		const input = () => e.q("#dd006-input");
		const dangling = (when) => assert.eq(input().getAttribute("aria-activedescendant"), null,
			`${when} closed the list but left the input pointing at a hidden option`);
		try {
			await e.search("paper");
			assert.ok(e.activeRow(), "nothing was highlighted before the list was closed");
			keydown(input(), "Escape");
			await tick(10);
			assert.ok(e.q("#dd006-list").hidden, "Escape did not close the list");
			dangling("Escape");

			await e.search("map");
			keydown(input(), "Enter");
			await tick(10);
			dangling("Enter");

			await e.search("book");
			const elsewhere = [...e.wing.querySelectorAll("input, button, select, a[href]")]
				.find((node) => node !== input() && !node.closest("[data-dd006]"));
			elsewhere.focus();
			await tick(200);
			assert.ok(e.q("#dd006-list").hidden, "focus left the combobox and the list stayed open");
			dangling("blur");
		} finally { e.destroy(); }
	});

	/**
	 * The list is a keyboard widget: the arrow keys move a highlight that the reader
	 * cannot see directly, and Enter has to commit the row the widget says is active —
	 * not the first row of whatever the filter left behind.
	 */
	test("the arrow keys move DD-006's highlight, and Enter commits the highlighted row", async () => {
		const e = await education();
		try {
			const { input, list } = await e.search("map");
			assert.eq(list.querySelectorAll(".combo__item").length, 2, "filtering to “map” should leave exactly two records");
			const first = e.activeRow();
			assert.ok(first, "a freshly filtered list highlights nothing, so ArrowDown has nowhere to come from");

			keydown(input, "ArrowDown");
			await tick(10);
			const second = e.activeRow();
			assert.notEq(second, first, "ArrowDown did not move the highlight");
			assert.ok(second.classList.contains("is-active"), "the highlighted row is not the one the class marks active");

			keydown(input, "Enter");
			await tick(20);
			assert.eq(input.value.trim(), second.textContent.trim(), "Enter committed a record other than the highlighted one");
			assert.ok(list.hidden, "Enter left the list open");
		} finally { e.destroy(); }
	});

	/**
	 * DD-006 is the only exhibit in the wing that can end up with nothing to show, so
	 * the empty state has to be said out loud — the count readout is what a screen
	 * reader is reading while the reader types.
	 */
	test("a query that matches nothing says so, and highlights nothing", async () => {
		const e = await education();
		try {
			const { input, list, count } = await e.search("zzzzz-nothing");
			assert.ok(list.hidden, "an empty result set left a list open");
			assert.eq(input.getAttribute("aria-expanded"), "false", "aria-expanded claims there are options to open");
			assert.eq(e.activeRow(), null, "an empty result set left an option highlighted");
			assert.match(count.textContent, /No record matches/, "the count readout does not tell the reader why nothing appeared");
		} finally { e.destroy(); }
	});

	/**
	 * The record book entry is earned by reading the wing, and the wing decides that
	 * from what IntersectionObserver reports as visible. What the platform counts as
	 * visible is not under test — the wing's rule is: part of the wing is not the whole
	 * of it, and a partial read must never light AC-08. The observer is replaced with
	 * one that reports exactly the exhibits each step names.
	 */
	test("AC-08 waits for the last exhibit in the wing, not the first read", async () => {
		let reader = null;
		const e = await education({
			before: () => {
				const real = window.IntersectionObserver;
				window.IntersectionObserver = class ReportedReading {
					constructor(callback) {
						this.callback = callback;
						this.targets = [];
						reader = this;
					}

					observe(target) { this.targets.push(target); }

					unobserve() {}

					disconnect() { this.targets = []; }

					report(ids) {
						this.callback(ids.map((id) => ({
							target: this.targets.find((node) => node.id === id),
							isIntersecting: true,
						})), this);
					}
				};
				return () => { window.IntersectionObserver = real; };
			},
		});
		try {
			const ids = [...e.wing.querySelectorAll("[data-exhibit]")].map((node) => node.id);
			assert.ok(ids.length >= 8, `the wing exposed ${ids.length} exhibits to the reader; the record book cannot be finished`);
			for (const id of ids) assert.ok(id, "an exhibit carries [data-exhibit] with no id, so reading it cannot be recorded");

			reader.report(ids.slice(0, -1));
			assert.eq(e.unlocks.length, 0, `the record book opened with ${ids.length - 1} of ${ids.length} exhibits read`);

			reader.report([ids.at(-1)]);
			assert.includes(e.unlocks.join(","), "edu-complete", "reading the last exhibit did not open the record book");
		} finally { e.destroy(); }
	});

	/**
	 * DD-004 keeps its `aria-expanded` in step with its panel by hand, from five
	 * places: the markup it ships with, its own button, a click anywhere else in the
	 * document, Escape, and the wing tearing itself down. Every one is a chance for the
	 * attribute to start lying, and a lying aria-expanded is worse than none at all —
	 * it tells a screen reader there is a panel to open when there is nothing there.
	 */
	test("DD-004's aria-expanded never disagrees with its panel", async () => {
		const e = await education();
		const trigger = e.q("[data-dd004] .mega__trigger");
		const panel = e.q("[data-dd004] .mega__panel");
		const agrees = (when) => assert.eq(trigger.getAttribute("aria-expanded"), String(!panel.hidden),
			`${when}: aria-expanded said “${trigger.getAttribute("aria-expanded")}” while the panel was ${panel.hidden ? "hidden" : "on screen"}`);
		try {
			agrees("at mount");

			trigger.click();
			await tick(10);
			assert.notOk(panel.hidden, "the button did not open the panel");
			agrees("opened by its own button");

			e.q("#dd001-select").click();
			await tick(10);
			assert.ok(panel.hidden, "a click outside the mega menu left it open");
			agrees("closed by a click outside it");

			trigger.click();
			await tick(10);
			keydown(document, "Escape");
			await tick(10);
			assert.ok(panel.hidden, "Escape left the mega menu open");
			agrees("closed by Escape");
			assert.eq(document.activeElement, trigger, "Escape closed the menu without handing focus back to its button");

			e.destroy();
			agrees("after the wing unmounted");
		} finally { e.destroy(); }
	});

	/**
	 * `#/education/dd-006` has to land on DD-006 both when the wing mounts and when the
	 * router only swaps the sub-route (js/core/router.js calls onSub, not mount). An
	 * accession nobody typed — a mistyped link, an exhibit that moved — must leave the
	 * wing alone rather than throw inside the router.
	 */
	test("a deep link marks the exhibit the route names, and an unknown one marks nothing", async () => {
		const e = await education();
		try {
			const ids = [...e.wing.querySelectorAll("[data-exhibit]")].map((node) => node.id);
			e.mode.onSub(e.wing, { path: "/education/dd-004", id: "education", mode: "education", sub: ids[1] });
			const marked = [...e.wing.querySelectorAll(".is-targeted")];
			assert.eq(marked.length, 1, `the deep link marked ${marked.length} exhibits instead of one`);
			assert.eq(marked[0].id, ids[1], "the deep link scrolled to the wrong exhibit");

			e.mode.onSub(e.wing, { path: "/education", id: "education", mode: "education", sub: null });
			e.mode.onSub(e.wing, { path: "/education/dd-999", id: "education", mode: "education", sub: "dd-999" });
			assert.eq(e.wing.querySelectorAll(".is-targeted").length, 1, "a route with no exhibit to mark marked one anyway");
		} finally { e.destroy(); }
	});
});
