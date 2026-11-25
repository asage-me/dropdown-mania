/**
 * The scrollbar exception to the cancelled mousedown.
 *
 * `tests/cases/select.js` proves an open menu spares its bar in the browser's
 * own coordinates. What is checked here is the arithmetic behind that, clause by
 * clause, because two of the three clauses cannot be arranged in a real menu
 * under test: a menu wide enough to need a horizontal bar would have to be
 * squeezed by positioned ancestors, and a panel that overflows in neither
 * direction has no bar to press on.
 */

import { assert, freshModule, suite, test } from "../harness.js";

/** A panel is only numbers to this predicate: a client box and a scroll size. */
function panel({ width = 200, height = 100, scrollWidth = 200, scrollHeight = 100 } = {}) {
	return { clientWidth: width, clientHeight: height, scrollWidth, scrollHeight };
}

suite("ui/scrollbar.js", () => {
	test("only the strip the panel actually has a bar in counts as a bar", async () => {
		const { isScrollbarPress } = await freshModule("js/ui/scrollbar.js");
		const tall = panel({ scrollHeight: 400 });
		const still = panel();

		assert.ok(isScrollbarPress({ target: tall, offsetX: 201, offsetY: 40 }, tall),
			"a press past the right edge of a menu that scrolls vertically is its bar");
		assert.notOk(isScrollbarPress({ target: still, offsetX: 201, offsetY: 40 }, still),
			"the same coordinate is ordinary padding on a menu that does not scroll");
		assert.notOk(isScrollbarPress({ target: tall, offsetX: 100, offsetY: 40 }, tall),
			"inside the client box is a row or the padding, never a bar");

		const wide = panel({ width: 200, height: 100, scrollWidth: 320 });
		assert.ok(isScrollbarPress({ target: wide, offsetX: 100, offsetY: 101 }, wide),
			"a press below the client box of a menu that scrolls horizontally is its bottom bar");
		assert.notOk(isScrollbarPress({ target: tall, offsetX: 100, offsetY: 101 }, tall),
			"below the last row is padding when there is no horizontal bar to hit");
	});

	test("a press belongs to whatever the pointer went down on, so a row is never a bar", async () => {
		const { isScrollbarPress } = await freshModule("js/ui/scrollbar.js");
		const tall = panel({ scrollHeight: 400 });
		// offsetX is measured from the target's own padding box, so a nowrap row
		// wider than the panel reports coordinates past the panel's client edge too.
		const row = { className: "sel__option" };

		assert.notOk(isScrollbarPress({ target: row, offsetX: 201, offsetY: 40 }, tall),
			"a row reached past the panel's edge must keep its cancelled focus move");
	});
});
