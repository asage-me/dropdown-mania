/**
 * DD-013 as a mounted exhibit, against the real games.html.
 *
 * Answers are decoded at run time rather than written down, so this file can
 * ship without becoming the answer key for a game whose whole point is that the
 * source does not contain the answer.
 */

import { save } from "../../js/lib/store.js";
import {
	assert, choose, clearStorage, freshModule, gameModule, mountExhibit, readStore, submit, suite, test, text, tick,
} from "../harness.js";

/**
 * One copy of the game for the whole file, cleared between cases by the game's own
 * `resetRunState()` instead of by a fresh import. The harness would hand every case a
 * new module, which keeps them apart through a cache-busting URL and quietly hides a
 * piece of run state that the reset forgets — which is precisely the bleed a visitor
 * meets on re-entry. Sharing one copy on purpose turns that mistake into a failing case
 * here. The two cases about state *surviving* a re-entry say so for themselves.
 */
const hackerGame = gameModule("hacker");

async function hacker() {
	const flags = await freshModule("js/games/hacker-flags.js");
	const { rot13, caesar, fromHex, fromB64, reverse, SHIFT } = flags;
	/** Fragments are stored encoded, exactly like the five ciphertexts. */
	const fragment = (index) => flags.decodeFragment(flags.FRAGMENTS[index]);
	const decode = {
		credential: () => flags.FRAGMENTS.map((_, index) => fragment(index)).join("-"),
		base64: (p) => fromB64(p),
		caesar: (p) => caesar(p, -SHIFT),
		hex: (p) => fromHex(p),
		mirror: (p) => rot13(reverse(p)),
		deep: (p) => rot13(fromB64(fromHex(p))),
	};
	const game = await hackerGame;
	game.resetRunState();
	const exhibit = await mountExhibit("hacker", game);
	const q = (selector) => exhibit.root.querySelector(selector);
	return {
		...exhibit, flags, q, decode, fragment,
		fragments: () => flags.FRAGMENTS.map((_, index) => fragment(index)),
		target: q("#hk-flag"),
		input: q("#hk-password"),
		form: q("[data-hk-form]"),
		hint: q("[data-hk-hint]"),
		result: () => text(exhibit.root, "[data-hk-result]"),
		payload: () => text(exhibit.root, "[data-hk-payload]"),
		found: () => text(exhibit.root, "[data-hk-found]"),
		hintLines: () => [...exhibit.root.querySelectorAll(".terminal__line--hint")].map((n) => n.textContent),
		tryFlag: async (id, guess) => {
			choose(q("#hk-flag"), id);
			await tick(20);
			q("#hk-password").value = guess;
			submit(q("[data-hk-form]"));
			await tick(30);
		},
	};
}

suite("games/hacker.js — the exhibit", () => {
	test("the target picker offers all six flags and the widget shows one", async () => {
		const h = await hacker();
		try {
			assert.eq(h.target.options.length, 6);
			assert.eq(h.target.value, "credential");
			// The router upgrades this select while it is still empty, so the
			// widget only knows about the options if mount() refreshed it.
			const labels = [...h.root.querySelectorAll(".sel__option")].map((n) => n.textContent);
			assert.eq(labels.length, 6, "the widget was never told about the options mount() added");
			assert.includes(labels.join("|"), "FLAG-06");
		} finally { h.destroy(); }
	});

	test("the shift key is left on the panel, because FLAG-03 is unsolvable without it", async () => {
		const h = await hacker();
		try {
			assert.eq(h.q("[data-hk-terminal]").dataset.hkShift, String(h.flags.SHIFT));
		} finally { h.destroy(); }
	});

	test("switching target swaps the brief and the payload, and only FLAG-01 shows the fragment checklist", async () => {
		const h = await hacker();
		try {
			assert.notOk(h.q("[data-hk-clues]").hidden, "the checklist belongs to FLAG-01");
			choose(h.target, "hex");
			await tick(20);
			assert.ok(h.q("[data-hk-clues]").hidden, "the checklist must hide for a flag with no fragments");
			assert.includes(h.payload(), h.flags.getFlag("hex").payload);
			assert.match(h.input.placeholder, /flag\{/, "an encoded flag is hinted with the flag shape");

			choose(h.target, "credential");
			await tick(20);
			assert.match(h.input.placeholder, /-/, "the credential is hinted with the fragment shape");
			assert.includes(h.input.placeholder, h.fragment(0), "dropping the leading fragment leaves no shape to type against");
			assert.notOk(h.fragments().filter((text) => h.input.placeholder.includes(text)).length > 2,
				"the placeholder names more than two of the four fragments, which is most of the answer");
		} finally { h.destroy(); }
	});

	test("an empty submission is refused without spending an attempt", async () => {
		const h = await hacker();
		try {
			h.input.value = "   ";
			submit(h.form);
			await tick(20);
			assert.match(h.result(), /Nothing to check/);
			assert.eq(text(h.root, "[data-hk-attempts]"), "0");
		} finally { h.destroy(); }
	});

	test("a wrong answer costs an attempt, says no, and clears nothing", async () => {
		const h = await hacker();
		try {
			await h.tryFlag("base64", "flag{not_even_close}");
			assert.eq(text(h.root, "[data-hk-attempts]"), "1");
			assert.match(h.result(), /denied/);
			assert.eq(h.unlocks.length, 0);
			assert.eq(readStore("hacker"), null, "a miss must not write a save");
		} finally { h.destroy(); }
	});

	test("two misses start handing out hints, and a hint never contains the answer", async () => {
		const h = await hacker();
		try {
			const answer = h.decode.base64(h.flags.getFlag("base64").payload);
			await h.tryFlag("base64", "wrong once");
			await h.tryFlag("base64", "wrong twice");
			const lines = [...h.root.querySelectorAll(".terminal__line")].map((n) => n.textContent).join("\n");
			assert.match(lines, /\$ /, "a hint should be logged into the terminal");
			assert.notMatch(lines, new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "a hint gave away the flag");
		} finally { h.destroy(); }
	});

	test("solving a flag earns its record, marks the card, and persists", async () => {
		const h = await hacker();
		try {
			const answer = h.decode.hex(h.flags.getFlag("hex").payload);
			await h.tryFlag("hex", answer);
			assert.deepEq(h.unlocks, ["hacker-hex"]);
			assert.match(h.result(), /recovered/);
			assert.eq(text(h.root, "[data-hk-flags-cleared]"), "1");
			assert.eq(h.root.querySelectorAll(".flag.is-cleared").length, 1);
			assert.deepEq(readStore("hacker"), { cleared: ["hex"] });
			assert.includes(h.target.options[h.target.selectedIndex].textContent, "✓");
		} finally { h.destroy(); }
	});

	test("a solved flag cannot be farmed for a second record", async () => {
		const h = await hacker();
		try {
			const flag = h.flags.getFlag("mirror");
			const answer = h.decode.mirror(flag.payload);
			await h.tryFlag("mirror", answer);
			await h.tryFlag("mirror", answer);
			assert.deepEq(h.unlocks, ["hacker-mirror"], "a repeat solve re-earned the record");
			assert.match(h.result(), /already yours/i);
		} finally { h.destroy(); }
	});

	test("assembling the credential earns both records once all four fragments are known", async () => {
		const h = await hacker();
		try {
			await h.tryFlag("credential", h.decode.credential());
			assert.includes(h.unlocks.join(","), "hacker-granted");
			assert.includes(h.unlocks.join(","), "hacker-all-clues");
			assert.eq(text(h.root, "[data-hk-found]"), "4");
			assert.eq(h.root.querySelectorAll("[data-clue].is-found").length, 4);
		} finally { h.destroy(); }
	});

	test("a partial credential guess reports how much it recognised", async () => {
		const h = await hacker();
		try {
			const [first, second] = h.fragments();
			await h.tryFlag("credential", `${first}-${second}-XX-YY`);
			assert.match(h.result(), /2 of 4 fragments/);
			assert.eq(text(h.root, "[data-hk-found]"), "2");
		} finally { h.destroy(); }
	});

	test("recovering all six earns Root Kit exactly once", async () => {
		const h = await hacker();
		try {
			for (const flag of h.flags.FLAGS) {
				await h.tryFlag(flag.id, h.decode[flag.id](flag.payload));
			}
			assert.eq(h.unlocks.filter((id) => id === "hacker-all").length, 1);
			assert.eq(text(h.root, "[data-hk-flags-cleared]"), "6");
			assert.eq(readStore("hacker").cleared.length, 6);
			const lines = [...h.root.querySelectorAll(".terminal__line")].map((n) => n.textContent);
			assert.ok(lines.some((line) => /root acquired/i.test(line)), "the win is not announced");
		} finally { h.destroy(); }
	});

	/**
	 * Both halves of the ladder's contract. From a cold start the rungs name the four
	 * surfaces and never their content, so the puzzle stays a puzzle for anyone who
	 * clicks "Stuck?" five times. After two misses on the capstone the deepest rung
	 * still says the fragments out loud: the last two live in a console line and a
	 * CSS custom property, so without it a visitor with no way to open devtools
	 * cannot finish FLAG-01, and FLAG-01 is required to finish the exhibit.
	 */
	test("the ladder names every surface cold, and hands over the fragments two misses deep", async () => {
		const h = await hacker();
		try {
			const climb = async (clicks) => {
				const seen = [];
				for (let click = 0; click < clicks; click += 1) {
					h.hint.click();
					await tick(10);
					seen.push(h.result());
				}
				return seen;
			};
			const all = h.fragments();

			const nudges = await climb(all.length + 2);
			for (const rung of nudges) {
				const recited = all.filter((piece) => rung.includes(piece));
				assert.eq(recited.length, 0, `a hint recited ${recited.join(", ")} before a single miss`);
			}
			const trail = nudges.join("\n");
			for (const surface of [/view source/i, /data-hk-dom-clue/, /console/i, /--hk-fragment/]) {
				assert.match(trail, surface, `no rung points at the ${surface} surface any more`);
			}

			await h.tryFlag("credential", "not it");
			await h.tryFlag("credential", "still not it");
			const deep = await climb(all.length + 2);
			const pieces = all.filter((piece) => deep.some((rung) => rung.includes(piece)));
			assert.eq(pieces.length, 4, "the ladder stopped short of the fragments, so a visitor without devtools has no way through FLAG-01");
		} finally { h.destroy(); }
	});

	test("fragment credit belongs to FLAG-01, the only flag that has fragments", async () => {
		const h = await hacker();
		try {
			await h.tryFlag("caesar", h.fragment(0));
			assert.eq(h.found(), "0", "a guess aimed at another flag lit up FLAG-01's clue board");
			const states = [...h.root.querySelectorAll("[data-clue] .clue__state")].map((node) => node.textContent);
			assert.ok(states.every((state) => state === "Not found"), `a clue row read ${states.join(", ")}`);

			await h.tryFlag("credential", `${h.fragment(0)}-${h.fragment(1)}-XX-YY`);
			assert.eq(h.found(), "2", "crediting a real FLAG-01 guess stopped working");
		} finally { h.destroy(); }
	});

	test("the hint ladder counts failures on the flag you are failing, not in the session", async () => {
		const h = await hacker();
		try {
			// Both targets share one terminal, so the assertion is about how many
			// hint lines exist, not whether any do.
			const count = () => h.hintLines().length;
			await h.tryFlag("base64", "wrong once");
			await h.tryFlag("base64", "wrong twice");
			assert.ok(count() > 0, "two failures on one flag earned no hint");
			const earned = count();

			await h.tryFlag("hex", "one miss on a different flag");
			assert.eq(count(), earned, "the second flag paid for the first one's misses");

			await h.tryFlag("hex", "and the second miss on it");
			assert.ok(count() > earned, "two failures on the new flag earned no hint either");
		} finally { h.destroy(); }
	});

	/**
	 * The rung belongs to the flag, not to the terminal. Two things used to go wrong
	 * with one shared step: a second flag opened at whatever rung a different flag
	 * had reached, and painting the target — which a solve does — reset the counter,
	 * so a stuck visitor could never be walked down to the last rung. Each hint says
	 * which flag and which rung it is, so both failures are visible in the line
	 * rather than inferred from a session-wide Attempt count.
	 */
	test("each flag keeps its own place in its own ladder, and says so", async () => {
		const h = await hacker();
		try {
			await h.tryFlag("base64", "wrong once");
			await h.tryFlag("base64", "wrong twice");
			assert.match(h.hintLines().at(-1), /\$ FLAG-02 · rung 1 of 2/, "FLAG-02's first hint was not its first rung");

			await h.tryFlag("hex", "miss one on another flag");
			await h.tryFlag("hex", "miss two on another flag");
			assert.match(h.hintLines().at(-1), /\$ FLAG-04 · rung 1 of 2/, "FLAG-04 opened at a rung its own misses never earned");

			await h.tryFlag("base64", "back to the first flag");
			assert.match(h.hintLines().at(-1), /\$ FLAG-02 · rung 2 of 2/, "FLAG-02 went back to its first rung after another flag was tried");
		} finally { h.destroy(); }
	});

	/**
	 * AC-04 is about the clue set, so it follows what the board has actually put in
	 * the visitor's hand. A rung that only nudges gives nothing; a rung that names a
	 * surface gives away that clue; the fourth surface in hand is the badge, with no
	 * correct guess anywhere. A guess that contains the fragments still credits them
	 * exactly as before (see the two crediting tests above), so a clean solve still
	 * earns the badge on the winning submit.
	 */
	test("a rung that names a surface hands over that clue, and the badge follows the clues", async () => {
		const h = await hacker();
		try {
			await h.tryFlag("hex", "miss on a flag with no fragments");
			await h.tryFlag("hex", "and another");
			h.hint.click();
			await tick(10);
			assert.eq(h.found(), "0", "a rung on a fragment-less flag credited FLAG-01's board");

			await h.tryFlag("credential", "not it");
			await h.tryFlag("credential", "still not it");
			// Two misses print the opening rung, which only says where to start.
			assert.eq(h.found(), "0", "a rung that names no surface handed over a fragment");

			h.hint.click();
			await tick(10);
			assert.eq(h.found(), "2", "the rung naming the source comment and the data attribute did not hand them over");
			assert.eq(h.unlocks.length, 0, "a badge went out before all four surfaces were in hand");

			h.hint.click();
			await tick(10);
			assert.eq(h.found(), "3", "the rung naming the console banner did not hand it over");

			h.hint.click();
			await tick(10);
			assert.eq(h.found(), "4", "the rung naming the custom property did not hand it over");
			assert.includes(h.unlocks.join(","), "hacker-all-clues", "the fourth surface did not earn the badge");
			assert.eq(h.unlocks.filter((id) => id === "hacker-granted").length, 0,
				"being handed the clues cannot be the same thing as assembling the credential");
		} finally { h.destroy(); }
	});

	/**
	 * The rungs now give real things away, and two of the four surfaces only exist in
	 * devtools. That has to be said in plain words on the screen rather than left for
	 * the visitor to work out — but only from the first rung that actually gives
	 * something, because a board that promises handouts two nudges in is warning about
	 * a shortcut nobody has been offered yet. Said once per visit, not on every rung.
	 */
	test("the board says, out loud and once, that its rungs hand the clues over", async () => {
		const h = await hacker();
		const lines = () => [...h.root.querySelectorAll(".terminal__line")].map((node) => node.textContent).join("\n");
		const notices = () => (lines().match(/hands? (that clue|all four|the fragments)/gi) || []).length;
		try {
			h.hint.click();
			await tick(10);
			assert.eq(notices(), 0, "the opening rung, which gives nothing away, promised handouts");

			h.hint.click();
			await tick(10);
			assert.match(lines(), /hands that clue over/i, "the first giveaway rung did not say it was giving a clue away");
			assert.match(lines(), /devtools/i, "the notice does not say why the rungs give anything away");

			h.hint.click();
			await tick(10);
			h.hint.click();
			await tick(10);
			assert.eq(notices(), 1, `the notice was repeated instead of said once (${notices()} copies)`);
		} finally { h.destroy(); }
	});

	/**
	 * Module-scope run state is deliberate in js/games/hacker.js: leaving the wing
	 * and coming back is meant to keep the ladder, while a reload starts clean. That
	 * is a promise about state that lives outside mount(), so it is pinned here on
	 * the one harness route that can test it — a second mount of the same module,
	 * which is what a wing re-entry actually is.
	 */
	test("the ladder survives a wing re-entry, and a reload does not carry it", async () => {
		const shared = await gameModule("hacker");

		const first = await mountExhibit("hacker", shared);
		try {
			choose(first.root.querySelector("#hk-flag"), "base64");
			await tick(20);
			first.root.querySelector("#hk-password").value = "wrong once";
			submit(first.root.querySelector("[data-hk-form]"));
			await tick(30);
			assert.eq(text(first.root, "[data-hk-attempts]"), "1");
		} finally {
			first.destroy();
		}

		const again = await mountExhibit("hacker", shared);
		try {
			assert.eq(text(again.root, "[data-hk-attempts]"), "1", "re-entry forgot the run the visitor was on");
		} finally {
			again.destroy();
		}

		// A fresh module is a reload: module scope starts at nothing.
		const fresh = await hacker();
		try {
			assert.eq(text(fresh.root, "[data-hk-attempts]"), "0", "a reload inherited another run");
		} finally { fresh.destroy(); }
	});

	/**
	 * The other half of that contract. Module-scope run state is what lets a wing
	 * re-entry keep the visitor's place, and it is also what makes a second mount
	 * inherit the first mount's game; the only thing keeping cases independent was
	 * the harness's cache-busting import, which is luck rather than design. This
	 * pins the deliberate way to say "start over".
	 */
	test("resetRunState puts the run back to a fresh page", async () => {
		const shared = await gameModule("hacker");

		const first = await mountExhibit("hacker", shared);
		try {
			choose(first.root.querySelector("#hk-flag"), "hex");
			await tick(20);
			const input = first.root.querySelector("#hk-password");
			for (const guess of ["wrong once", "wrong twice"]) {
				input.value = guess;
				submit(first.root.querySelector("[data-hk-form]"));
				await tick(30);
			}
			first.root.querySelector("[data-hk-hint]").click();
			await tick(30);
			assert.eq(text(first.root, "[data-hk-attempts]"), "2", "the misses were not counted");
			assert.ok(text(first.root, "[data-hk-result]").length > 0, "the rung printed nothing to reset");
		} finally {
			first.destroy();
		}

		shared.resetRunState();

		const again = await mountExhibit("hacker", shared);
		try {
			assert.eq(text(again.root, "[data-hk-attempts]"), "0", "the attempt count outlived the reset");
			assert.eq(text(again.root, "[data-hk-found]"), "0", "the clue board outlived the reset");
			assert.eq(text(again.root, "[data-hk-result]"), "", "the rung line outlived the reset");

			// The record is the other piece of module scope, and it is the one that
			// actually bled once every case in this file shared a copy: a flag the copy
			// had solved stayed lit after its save was deleted, because the copy reads
			// storage once, at import. A fresh page rereads it, so a reset has to as well.
			const flags = await freshModule("js/games/hacker-flags.js");
			choose(again.root.querySelector("#hk-flag"), "hex");
			await tick(20);
			again.root.querySelector("#hk-password").value = flags.fromHex(flags.getFlag("hex").payload);
			submit(again.root.querySelector("[data-hk-form]"));
			await tick(30);
			assert.eq(text(again.root, "[data-hk-flags-cleared]"), "1", "the flag was never actually cleared");
			assert.deepEq(readStore("hacker").cleared, ["hex"], "clearing it wrote nothing down");

			clearStorage();
			shared.resetRunState();
		} finally {
			again.destroy();
		}

		const clean = await mountExhibit("hacker", shared);
		try {
			assert.eq(text(clean.root, "[data-hk-flags-cleared]"), "0",
				"a cleared flag outlived the save that recorded it, because the copy reread nothing");
			assert.eq(clean.unlocks.length, 0, "the reset left a record of unearned badges behind");
		} finally {
			clean.destroy();
		}
	});

	test("a save naming a flag that no longer exists is ignored, not obeyed", async () => {
		// What a returning visitor is left holding when a flag id is renamed: the
		// saved set is bigger than the game, which used to make the all-clear
		// branch unreachable and the next correct guess throw inside the handler.
		save("hacker", { cleared: ["credential", "base64", "caesar", "hex", "mirror", "dd-013-flag-6"] });
		const thrown = [];
		const noteThrow = (event) => thrown.push(event.message);
		window.addEventListener("error", noteThrow);
		const h = await hacker();
		try {
			await h.tryFlag("deep", h.decode.deep(h.flags.getFlag("deep").payload));
			assert.match(h.result(), /recovered/i);
			assert.eq(text(h.root, "[data-hk-flags-cleared]"), "6", "a retired id still counts towards the six flags");
			assert.ok(h.root.querySelectorAll(".flag.is-cleared").length < 7, "the flag list counted a flag that is not in it");
			const lines = [...h.root.querySelectorAll(".terminal__line")].map((node) => node.textContent);
			assert.ok(lines.some((line) => /root acquired/i.test(line)), "the all-clear never fired");
			assert.deepEq([...readStore("hacker").cleared].sort(), h.flags.FLAGS.map((flag) => flag.id).sort(),
				"the stale id was written straight back to the save");
			assert.eq(h.input.value, "", "the throw left the answer sitting in the input box");
			assert.deepEq(thrown, [], `submitting with a stale save threw: ${thrown.join("; ")}`);
		} finally {
			window.removeEventListener("error", noteThrow);
			h.destroy();
		}
	});

	test("a save whose cleared field is not a list does not stop the exhibit", async () => {
		save("hacker", { cleared: "all" });
		const h = await hacker();
		try {
			await h.tryFlag("base64", h.decode.base64(h.flags.getFlag("base64").payload));
			assert.match(h.result(), /recovered/i);
			assert.eq(text(h.root, "[data-hk-flags-cleared]"), "1");
		} finally { h.destroy(); }
	});

	test("unmount stops the rain and removes its resize listener", async () => {
		const h = await hacker();
		const canvas = h.q("[data-hk-rain]");
		assert.ok(canvas, "the terminal has no canvas");
		h.instance.onShow?.();
		h.destroy();
		// Nothing to observe directly: a stopped loop simply stops painting.
		const before = canvas.getContext("2d").getImageData(0, 0, Math.min(canvas.width, 40), Math.min(canvas.height, 40)).data.join(",");
		await tick(300);
		const after = canvas.getContext("2d").getImageData(0, 0, Math.min(canvas.width, 40), Math.min(canvas.height, 40)).data.join(",");
		assert.eq(before, after, "the rain kept animating after unmount");
	});
});
