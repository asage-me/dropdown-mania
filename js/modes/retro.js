/**
 * WING III — Retro 1999.
 *
 * The guestbook used to fire an alert() and throw the message away; the hit
 * counter was the literal string 00001337. Both are real now, stored in this
 * browser, and the wing still looks like nothing happened since 1999.
 */

import { load, loadMerged, save } from "../lib/store.js";

const COUNTER_KEY = "retro-counter";
const BOOK_KEY = "retro-guestbook";

const SEED = [
	{ name: "xX_pixelknight_Xx", message: "gr8 site!!! how do u make the text blink like that", when: "1999-04-11" },
	{ name: "webmaster_dave", message: "added u to the dropdown webring. pls add me back, thanx", when: "1999-06-02" },
];

let countedThisSession = false;

export default {
	id: "retro",
	label: "Retro 1999",
	title: "Retro 1999 — The Dropdown Archive",
	template: "retro-1999.html",

	mount(root, route, api) {
		const cleanups = [];
		const on = (node, type, handler) => {
			node?.addEventListener(type, handler);
			cleanups.push(() => node?.removeEventListener(type, handler));
		};

		/* ---------- the three sacred selects ---------- */
		const out = root.querySelector("[data-retro-out]");
		const chosen = new Map();
		const onSelectChange = (event) => {
			const select = event.currentTarget;
			const label = root.querySelector(`label[for="${select.id}"]`);
			const name = label ? label.textContent.trim() : select.id;
			if (select.value) chosen.set(name, select.options[select.selectedIndex].textContent);
			else chosen.delete(name);
			out.textContent = chosen.size
				? `Registered: ${[...chosen].map(([k, v]) => `${k} = ${v}`).join(" · ")}`
				: "Nothing chosen. The web waits for you.";
		};
		root.querySelectorAll("select").forEach((select) => on(select, "change", onSelectChange));

		/* ---------- hit counter ---------- */
		const counter = loadMerged(COUNTER_KEY, { total: 1337 });
		if (!countedThisSession) {
			counter.total += 1;
			save(COUNTER_KEY, counter);
			countedThisSession = true;
		}
		const digits = root.querySelectorAll("[data-digit]");
		const padded = String(counter.total).padStart(digits.length, "0").slice(-digits.length);
		digits.forEach((digit, index) => { digit.textContent = padded[index]; });
		const totalEl = root.querySelector("[data-retro-total]");
		if (totalEl) totalEl.textContent = counter.total.toLocaleString("en-US");

		/* ---------- guestbook ---------- */
		const listEl = root.querySelector("[data-retro-entries]");
		const form = root.querySelector("[data-retro-form]");
		const formOut = root.querySelector("[data-retro-formout]");
		const stored = load(BOOK_KEY);
		let book = Array.isArray(stored) ? stored : SEED.slice();

		function paint() {
			listEl.innerHTML = "";
			book.forEach((entry, index) => {
				const item = document.createElement("li");
				item.className = "guestbook__entry";
				item.innerHTML = `
					<p class="guestbook__meta"><strong class="guestbook__name"></strong> <span class="guestbook__when"></span></p>
					<p class="guestbook__message"></p>
					<button type="button" class="guestbook__delete">erase</button>`;
				item.querySelector(".guestbook__name").textContent = entry.name;
				item.querySelector(".guestbook__when").textContent = entry.when;
				item.querySelector(".guestbook__message").textContent = entry.message;
				item.querySelector(".guestbook__delete").addEventListener("click", () => {
					book.splice(index, 1);
					save(BOOK_KEY, book);
					paint();
				});
				listEl.appendChild(item);
			});
		}

		function onSubmit(event) {
			event.preventDefault();
			const name = form.elements.name.value.trim();
			const message = form.elements.message.value.trim();
			if (!name || !message) {
				formOut.textContent = "!! A REAL WEBMASTER FILLS IN BOTH FIELDS !!";
				formOut.className = "retro-formout is-bad";
				return;
			}
			book.unshift({ name, message, when: new Date().toISOString().slice(0, 10) });
			book = book.slice(0, 25);
			save(BOOK_KEY, book);
			paint();
			form.reset();
			formOut.textContent = "★ THANK YOU ★ YOUR MESSAGE IS NOW PART OF THE ARCHIVE ★";
			formOut.className = "retro-formout is-good";
			api.unlock("retro-signed");
		}

		on(form, "submit", onSubmit);
		paint();
		focusSub(root, route);

		return () => cleanups.forEach((fn) => fn());
	},

	onSub(root, route) {
		focusSub(root, route);
	},
};

function focusSub(root, route) {
	if (!route?.sub) {
		window.scrollTo({ top: 0, behavior: "smooth" });
		return;
	}
	const target = root.querySelector(`#${CSS.escape(route.sub)}`) || root.querySelector(`[data-accession="${route.sub.toUpperCase()}"]`);
	target?.scrollIntoView({ block: "start" });
}
