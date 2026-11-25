/**
 * DD-012 as a mounted exhibit.
 *
 * The regression tests here are all about the verdict row. A wrong answer hides
 * every row but the first, so a verdict written on the row that earned it went
 * unread for four levels and then reappeared when that row was re-armed — where
 * it read as a verdict on the answer you were about to give.
 */

import {
	assert, choose, freshModule, gameModule, mountExhibit, readStore, suite, test, text, tick,
} from "../harness.js";

/**
 * Mount DD-012, optionally dealt a named set.
 *
 * Pass `setId: null` to leave the picker alone. Choosing a set runs newRun(),
 * which clears the run — so a test that wants a mount to behave like a wing
 * re-entry must not choose anything.
 */
async function path(setId = "markup", sameModule) {
	const sets = await freshModule("js/games/path-sets.js");
	const exhibit = await mountExhibit("find-path", sameModule);
	const q = (selector) => exhibit.root.querySelector(selector);
	const game = {
		...exhibit, q, sets,
		setSelect: q("[data-fp-set]"),
		rows: () => [...exhibit.root.querySelectorAll("[data-fp-board] .path__level")],
		verdicts: () => [...exhibit.root.querySelectorAll("[data-fp-board] [data-verdict]")].map((n) => n.textContent.trim()),
		status: () => text(exhibit.root, "[data-fp-status]"),
		pick: async (row, value) => { choose(exhibit.root.querySelectorAll("[data-fp-board] select")[row], value); await tick(30); },
		solve: async () => {
			const levels = sets.getSet(setId).levels;
			for (let row = 0; row < levels.length; row += 1) {
				await game.pick(row, levels[row].correct);
			}
		},
	};
	if (setId !== null) {
		choose(game.setSelect, setId);
		await tick(40);
	}
	return game;
}

suite("games/path-sets.js", () => {
	test("there are fifty sets, five levels each, with unique ids", async () => {
		const { PATH_SETS, SET_COUNT, PATH_THEMES } = await freshModule("js/games/path-sets.js");
		assert.eq(SET_COUNT, 50);
		assert.eq(PATH_SETS.length, 50);
		assert.eq(new Set(PATH_SETS.map((set) => set.id)).size, 50);
		for (const set of PATH_SETS) {
			assert.eq(set.levels.length, 5, `${set.id} must stay five levels deep`);
				assert.ok(PATH_THEMES.includes(set.theme), `${set.id} has a theme no group offers`);
			for (const level of set.levels) {
				assert.eq(level.options.length, 4, `${set.id}: every menu offers four`);
				assert.ok(level.options.includes(level.correct), `${set.id}: "${level.correct}" is not among the options`);
				assert.eq(new Set(level.options).size, 4, `${set.id}: duplicate options`);
				assert.ok(level.rule.length > 20, `${set.id}: a wrong answer needs an explanation to teach`);
			}
		}
	});

	test("an unknown set id is reported as missing, and random dealing avoids repeats", async () => {
		const { PATH_SETS, getSet, randomSetId, RANDOM_PICK, JOURNEY_PICK } = await freshModule("js/games/path-sets.js");
		// Pinned deliberately: getSet returns null rather than a default, so every
		// caller has to hold a valid id. find-path seeds itself from PATH_SETS[0].
		assert.eq(getSet("no-such-set"), null);
		assert.eq(getSet("markup").id, "markup");
		assert.eq(RANDOM_PICK, "random");
		assert.eq(JOURNEY_PICK, "journey");
		for (let i = 0; i < 40; i += 1) {
			assert.notOk(randomSetId("markup") === "markup", "random dealt the set it was told to avoid");
		}
		assert.ok(PATH_SETS.length > 1, "random dealing needs somewhere else to go");
	});
});

suite("games/find-path.js — the board", () => {
	test("a run is five rows with only the first showing, each menu holding a placeholder", async () => {
		const g = await path();
		try {
			assert.eq(g.rows().length, 5);
			assert.eq(g.rows().filter((row) => row.hidden).length, 4);
			assert.eq(g.rows()[0].querySelector("select").value, "", "a row must start unanswered");
			assert.match(g.rows()[0].querySelector("select").options[0].textContent, /Choose/);
		} finally { g.destroy(); }
	});

	test("the set picker offers random, the journey, and all fifty sets", async () => {
		const g = await path();
		try {
			const values = [...g.setSelect.options].map((option) => option.value).filter(Boolean);
			assert.includes(values.join(","), "random");
			assert.includes(values.join(","), "journey");
			assert.eq(values.length, 52, "fifty sets plus two ways of letting the archive choose");
			assert.ok(g.setSelect.querySelectorAll("optgroup").length >= 3, "sets must be grouped by theme");
		} finally { g.destroy(); }
	});

	test("a correct answer arms the next row", async () => {
		const g = await path();
		try {
			const level = g.sets.getSet("markup").levels[0];
			await g.pick(0, level.correct);
			assert.notOk(g.rows()[1].hidden, "the second row stayed hidden after a correct first answer");
			assert.eq(text(g.root, "[data-fp-attempts]"), "1");
		} finally { g.destroy(); }
	});

	/** The complaint this whole change exists to answer. */
	test("a wrong answer says no where it can be seen, and stops saying it once the row is re-armed", async () => {
		const g = await path();
		try {
			const levels = g.sets.getSet("markup").levels;
			const wrong = levels[0].options.find((option) => option !== levels[0].correct);

			await g.pick(0, wrong);
			assert.eq(g.verdicts()[0], "Wrong.", "the row itself must still carry the verdict");
			assert.match(g.status(), /not the one/i, "the live region has to say it too, since it never hides");
			assert.eq(g.rows().filter((row) => row.hidden).length, 4, "a miss must send the board back to level 1");

			// Climb back to the row that was wrong. It is the same row, re-armed,
			// so the old verdict has already been read and must not still be there.
			await g.pick(0, levels[0].correct);
			assert.eq(g.verdicts()[1], "", "a stale verdict followed the row back");
			await g.pick(1, levels[1].correct);
			assert.eq(g.verdicts()[2], "", "a stale verdict followed the row back");
		} finally { g.destroy(); }
	});

	test("a miss on a later level resets the board but keeps the field notes", async () => {
		const g = await path();
		try {
			const levels = g.sets.getSet("markup").levels;
			await g.pick(0, levels[0].correct);
			await g.pick(1, levels[1].correct);
			const wrong = levels[2].options.find((option) => option !== levels[2].correct);
			await g.pick(2, wrong);

			assert.eq(g.rows().filter((row) => row.hidden).length, 4);
			const notes = text(g.root, "[data-fp-notes]");
			assert.ok(notes && notes.length > 0, "what you already solved has to survive the reset");
			assert.includes(notes, levels[0].correct);
		} finally { g.destroy(); }
	});

	test("choosing the placeholder is not an attempt", async () => {
		const g = await path();
		try {
			await g.pick(0, "");
			assert.eq(text(g.root, "[data-fp-attempts]"), "0");
			assert.eq(g.verdicts()[0], "");
		} finally { g.destroy(); }
	});

	test("finishing the path earns the record, records a best time, and stops the clock", async () => {
		const g = await path();
		try {
			await g.solve();
			assert.includes(g.unlocks.join(","), "path-first");
			assert.notOk(g.q("[data-fp-result]").hidden, "the win panel never appeared");
			assert.notMatch(text(g.root, "[data-fp-best]"), /^—$/, "no best time was written");
			const saved = readStore("find-path");
			// A flawless run is 0 seconds, which is falsy — so the key has to be
			// probed for, not truth-tested.
			assert.ok(saved && "standard" in saved, "the best time was not saved");
			assert.includes(saved.completed, "markup");
		} finally { g.destroy(); }
	});

	test("clearing a run, leaving the wing and coming back leaves a playable board", async () => {
		// Two mounts of ONE module instance, because that is what a wing re-entry
		// is: the module stays in the browser's module map while the router throws
		// the wing's DOM away and fetches it again. The defect this pins was a
		// rebuilt board under a `won` flag left over from the finished run, which
		// hid nothing, announced nothing, and refused every answer.
		const game = await gameModule("find-path");
		const first = await path("markup", game);
		let back = null;
		try {
			await first.solve();
			assert.notOk(first.q("[data-fp-result]").hidden, "the win panel never appeared, so this proves nothing");
			assert.notEq(text(first.root, "[data-fp-attempts]"), "0", "the run was never actually played");

			first.destroy();
			// No set chosen: this mount has to survive on its own, the way the
			// router does it when the visitor walks back into Wing II.
			back = await path(null, game);

			assert.ok(back.q("[data-fp-result]").hidden, "a finished run's result panel came back over a new board");
			assert.eq(text(back.root, "[data-fp-attempts]"), "0", "the previous run's attempt count came back");
			assert.match(back.q("[data-fp-hint-count]").textContent, /2/, "a new visit started with last visit's hints");
			assert.eq(back.rows().filter((row) => row.hidden).length, 4, "the returned board was not a fresh run");

			const levels = back.sets.getSet("markup").levels;
			await back.pick(0, levels[0].correct);
			assert.notOk(back.rows()[1].hidden, "the returned board refused the correct answer");
			assert.eq(text(back.root, "[data-fp-attempts]"), "1", "a correct answer on the returned board was not counted");
		} finally {
			first.destroy();
			back?.destroy();
		}
	});

	test("hints run out and say so instead of silently doing nothing", async () => {
		const g = await path();
		try {
			const button = g.q("[data-fp-hint]");
			const count = g.q("[data-fp-hint-count]");
			assert.match(count.textContent, /2/);
			button.click();
			await tick(20);
			assert.match(count.textContent, /1/);
			button.click();
			await tick(20);
			assert.match(count.textContent, /0/, "a third hint was given");

			const before = g.status();
			button.click();
			await tick(20);
			assert.match(count.textContent, /0/, "the count went negative");
			assert.match(g.status(), /No hints left/i, "an exhausted hint button must explain itself, not go quiet");
			assert.notEq(g.status(), before);
		} finally { g.destroy(); }
	});

	test("unmounting stops the clock and leaves no timer behind", async () => {
		const g = await path();
		const first = text(g.root, "[data-fp-clock]");
		g.destroy();
		await tick(1200);
		assert.eq(text(g.root, "[data-fp-clock]"), first, "the clock kept ticking after unmount");
	});
});
