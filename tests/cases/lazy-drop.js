/**
 * DD-014 as a mounted exhibit.
 *
 * Three things are pinned here and all three were real bugs. The save is
 * versioned, and a mismatched version has to be discarded rather than half-read.
 * The banked total used to live in the statline, where a nine-figure score
 * widened the head and shoved the rest of the page sideways — so its position is
 * now asserted, not eyeballed. And an open tier menu painted under the tiers
 * below it, because a leftover transform turned every tier into a stacking
 * context the menu's own z-index could not escape.
 */

import {
	assert, choose, fetchText, host, mountExhibit, readStore, release, suite, test, text, tick,
} from "../harness.js";

async function lazy() {
	const exhibit = await mountExhibit("lazy-drop");
	const q = (selector) => exhibit.root.querySelector(selector);
	return {
		...exhibit, q,
		score: () => q("[data-ld-score]").textContent,
		bankOnce: async (tier = 1) => {
			const select = q(`#ld-tier-${tier}`);
			const payable = [...select.options].find((option) => option.value && Number(option.value) > 0);
			choose(select, payable.value);
			await tick(30);
		},
	};
}

function writeSave(state) {
	window.localStorage.setItem("dropdown-archive:lazy-drop", JSON.stringify(state));
}

suite("games/lazy-drop.js", () => {
	test("a fresh run banks nothing and pays one per selection", async () => {
		const g = await lazy();
		try {
			assert.eq(g.score(), "0");
			assert.eq(text(g.root, "[data-ld-power]"), "1");
			assert.eq(text(g.root, "[data-ld-clicks]"), "0");
		} finally { g.destroy(); }
	});

	test("committing a tier pays out and counts the selection", async () => {
		const g = await lazy();
		try {
			await g.bankOnce(1);
			assert.notOk(g.score() === "0", "committing paid nothing");
			assert.eq(text(g.root, "[data-ld-clicks]"), "1");
			assert.ok(Number(g.score().replace(/\D/g, "")) > 0);
			assert.ok(g.root.querySelectorAll("[data-ld-log] li").length >= 1, "the ledger logged nothing");
		} finally { g.destroy(); }
	});

	test("a save from another version is discarded rather than half-read", async () => {
		writeSave({ version: 1, points: 987654, tiers: 9, upgrades: 9 });
		const g = await lazy();
		try {
			assert.eq(g.score(), "0", "a stale save was restored instead of dropped");
			assert.eq(text(g.root, "[data-ld-clicks]"), "0");
		} finally { g.destroy(); }
	});

	test("a save at the current version comes back", async () => {
		const probe = await mountExhibit("lazy-drop");
		// unmount() flushes, and only unmount() does — mounting alone writes
		// nothing, so the version has to be read after the game lets go.
		probe.destroy();
		const version = readStore("lazy-drop")?.version;
		assert.ok(typeof version === "number", "the game never wrote a versioned save");

		writeSave({ version, points: 4200, tiers: 1, upgrades: 0, clicks: 7, perSelection: 1, perSecond: 0, log: [] });
		const g = await lazy();
		try {
			assert.includes(g.score().replace(/\D/g, ""), "4200");
		} finally { g.destroy(); }
	});

	/**
	 * The layout contract. The banked total is allowed to grow as wide as it
	 * likes — it just is not allowed to move anything else while doing it.
	 */
	test("a nine-figure score grows the bank without shifting the statline", async () => {
		const node = host(`
			<div class="game__head">
				<div><h3>Lazy Drop</h3></div>
				<dl class="statline">
					<div><dt>Per selection</dt><dd data-ld-power>1</dd></div>
					<div><dt>Per second</dt><dd data-ld-rate>0</dd></div>
					<div><dt>Selections</dt><dd data-ld-clicks>0</dd></div>
				</dl>
			</div>
			<p class="bank"><span class="bank__label">Banked</span><b class="bank__value" data-ld-score>0</b></p>`);
		try {
			const cells = [...node.querySelectorAll(".statline dd")];
			const before = cells.map((cell) => cell.getBoundingClientRect().left);
			const boardTop = node.querySelector(".bank").getBoundingClientRect().bottom;

			node.querySelector("[data-ld-score]").textContent = "9,876,543,210";
			await tick(20);

			const after = cells.map((cell) => cell.getBoundingClientRect().left);
			assert.deepEq(after, before, "the statline moved when the score grew");
			assert.ok(node.querySelector(".bank").getBoundingClientRect().bottom >= boardTop);
			assert.eq(getComputedStyle(node.querySelector(".bank__value")).whiteSpace, "nowrap", "a wrapping score would jitter the band");
		} finally { release(node); }
	});

	test("the banked total is no longer inside the game head", async () => {
		const g = await lazy();
		try {
			const score = g.q("[data-ld-score]");
			assert.ok(score.closest(".bank"), "the score must live in its own band");
			assert.notOk(score.closest(".game__head"), "the score must not sit in the head, which sizes itself to its content");
		} finally { g.destroy(); }
	});

	test("wiping the save really wipes it", async () => {
		const g = await lazy();
		try {
			await g.bankOnce(1);
			g.q("[data-ld-reset]").click();
			await tick(60);
			assert.eq(g.score(), "0");
			assert.eq(text(g.root, "[data-ld-clicks]"), "0");
			assert.eq(readStore("lazy-drop").points, 0);
		} finally { g.destroy(); }
	});

	test("every tier a fresh run can reach renders a menu that can be committed", async () => {
		const g = await lazy();
		try {
			const selects = [...g.root.querySelectorAll("[data-ld-tiers] select")];
			// Higher tiers are bought, not shown, so a fresh save only opens tier 1.
			assert.ok(selects.length >= 1, "no tier rendered at all");
			for (const select of selects) {
				const payable = [...select.options].filter((option) => option.value && Number(option.value) > 0);
				assert.ok(payable.length >= 1, `${select.id} offers nothing to commit`);
				assert.ok(select.hasAttribute("data-archive-select"), `${select.id} was never upgraded`);
				assert.match(select.options[0].textContent, /Commit/, `${select.id} has no neutral first option`);
			}
		} finally { g.destroy(); }
	});

	/**
	 * Every tier is its own stacking context — `tier-arrive` leaves a filled
	 * transform behind, and any non-none transform creates one — so a listbox's
	 * z-index cannot escape the tier it belongs to. Tiers then paint in DOM
	 * order, and because they wrap into rows, an open menu on tier 1 overlaps
	 * tier 2 and used to be painted under it. Pinned at both levels: the rule
	 * that fixes it, and the paint order the player actually sees.
	 */
	test("an open menu is not buried under the tiers that follow it", async () => {
		// Read the live version rather than hard-coding it, so a save-version
		// bump cannot quietly turn this into a test of the discard path.
		const probe = await mountExhibit("lazy-drop");
		probe.destroy();
		const { version } = readStore("lazy-drop");

		writeSave({
			version, points: 0, power: 1, multiplier: 1, autoRate: 0, tiers: 7,
			powerCost: 100, autoCost: 500, tierCost: 1000, multiplierCost: 5000,
			selections: 0, jackpots: 0, log: [], lastSeen: Date.now(),
		});

		const g = await lazy();
		try {
			const tiers = [...g.root.querySelectorAll(".tier")];
			assert.eq(tiers.length, 7, "a save that owns seven tiers should render seven");

			// The overlap only exists once the tiers wrap, so make it happen
			// rather than hoping the viewport cooperates.
			g.container.style.width = "620px";
			await tick(30);
			// And put the tier at the top of the viewport: a menu with no room
			// below flips up, where it overlaps nothing and proves nothing.
			tiers[0].scrollIntoView({ block: "start", behavior: "instant" });
			await tick(30);

			tiers[0].querySelector(".sel__trigger").click();
			await tick(60);
			const menu = tiers[0].querySelector(".sel__menu");
			assert.notOk(menu.hidden, "the menu did not open");

			const level = (el) => {
				const value = getComputedStyle(el).zIndex;
				return value === "auto" ? 0 : Number(value);
			};
			assert.ok(level(tiers[0]) > level(tiers[1]), `the tier in use sits at ${level(tiers[0])}, its neighbour at ${level(tiers[1])}`);

			const trigger = tiers[0].querySelector(".sel__trigger").getBoundingClientRect();
			const mr = menu.getBoundingClientRect();
			assert.ok(mr.top >= trigger.bottom - 1, "the menu opened above its trigger, so it cannot overlap the tiers below");

			let overlaps = 0;
			tiers.slice(1).forEach((other, offset) => {
				const r = other.getBoundingClientRect();
				const ox = Math.max(mr.x, r.x), oy = Math.max(mr.y, r.y);
				const ex = Math.min(mr.right, r.right), ey = Math.min(mr.bottom, r.bottom);
				if (ex <= ox + 2 || ey <= oy + 2) return;
				overlaps += 1;
				const hit = document.elementFromPoint((ox + ex) / 2, (oy + ey) / 2);
				assert.ok(hit && menu.contains(hit), `tier ${offset + 2} paints over the open menu`);
			});
			assert.ok(overlaps > 0, "the tiers never overlapped, so nothing was tested");
		} finally { g.destroy(); }
	});

	/**
	 * Tier 7 is one winning row in five hundred, and the whole game is reading
	 * the page — so the prize must live in a closure, never in the markup.
	 * It cannot be reached on a fresh save, so the invariant is pinned here.
	 */
	test("the Long Menu's winning row is never written into the markup", async () => {
		const source = await fetchText("js/games/lazy-drop.js");
		assert.notMatch(source, /data-(winner|prize|winning)/, "the prize is stored on a data attribute");
		assert.notMatch(source, /option\.(dataset|setAttribute)[^\n]*(win|prize)/i, "an option is tagged as the winner");
		assert.match(source, /LONG_MENU_TIER/, "the Long Menu disappeared");
	});
});
