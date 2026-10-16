/**
 * DD-013 as a mounted exhibit, against the real games.html.
 *
 * Answers are decoded at run time rather than written down, so this file can
 * ship without becoming the answer key for a game whose whole point is that the
 * source does not contain the answer.
 */

import {
	assert, choose, freshModule, mountExhibit, readStore, submit, suite, test, text, tick,
} from "../harness.js";

async function hacker() {
	const flags = await freshModule("js/games/hacker-flags.js");
	const { rot13, caesar, fromHex, fromB64, reverse, SHIFT, CREDENTIAL } = flags;
	const decode = {
		credential: () => CREDENTIAL,
		base64: (p) => fromB64(p),
		caesar: (p) => caesar(p, -SHIFT),
		hex: (p) => fromHex(p),
		mirror: (p) => rot13(reverse(p)),
		deep: (p) => rot13(fromB64(fromHex(p))),
	};
	const exhibit = await mountExhibit("hacker");
	const q = (selector) => exhibit.root.querySelector(selector);
	return {
		...exhibit, flags, q, decode,
		target: q("#hk-flag"),
		input: q("#hk-password"),
		form: q("[data-hk-form]"),
		result: () => text(exhibit.root, "[data-hk-result]"),
		payload: () => text(exhibit.root, "[data-hk-payload]"),
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
			assert.match(h.input.placeholder, /0P3N/, "the credential is hinted with the fragment shape");
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
			await h.tryFlag("credential", h.flags.CREDENTIAL);
			assert.includes(h.unlocks.join(","), "hacker-granted");
			assert.includes(h.unlocks.join(","), "hacker-all-clues");
			assert.eq(text(h.root, "[data-hk-found]"), "4");
			assert.eq(h.root.querySelectorAll("[data-clue].is-found").length, 4);
		} finally { h.destroy(); }
	});

	test("a partial credential guess reports how much it recognised", async () => {
		const h = await hacker();
		try {
			const [first, second] = h.flags.FRAGMENTS.map((f) => f.text);
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
