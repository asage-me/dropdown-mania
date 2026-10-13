/**
 * Command palette (Ctrl/⌘+K) and the record book.
 *
 * A searchable archive should be searchable. The palette indexes the wing
 * templates themselves, so it can never list an exhibit that has been removed.
 * Both surfaces are <dialog>: Escape, focus trapping and the top layer come
 * from the platform instead of hand-rolled overlay code.
 */

import { getCatalogue, WINGS } from "../core/catalogue.js";
import { list as listRecords } from "../core/achievements.js";

let paletteDialog = null;
let recordsDialog = null;

function ensureDialog(id, className, innerHTML) {
	let dialog = document.getElementById(id);
	if (dialog) return dialog;
	dialog = document.createElement("dialog");
	dialog.id = id;
	dialog.className = className;
	dialog.innerHTML = innerHTML;
	document.body.appendChild(dialog);

	// Clicking the backdrop closes it; clicking the panel does not.
	dialog.addEventListener("click", (event) => {
		if (event.target === dialog) dialog.close();
	});

	// Escape is a platform default action — but an embedded browser (or a host
	// chrome that owns the key) can swallow it, so close it ourselves too.
	dialog.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			dialog.close();
		}
	});
	return dialog;
}

export function createPalette({ navigate }) {
	const dialog = ensureDialog("palette", "palette", `
		<form class="palette__search" role="search">
			<label class="u-visually-hidden" for="palette-input">Search the archive</label>
			<input id="palette-input" name="q" type="search" autocomplete="off" spellcheck="false"
			       placeholder="Search exhibits, wings, records…">
		</form>
		<ul class="palette__results" role="listbox" aria-label="Archive results"></ul>
		<p class="palette__foot">↑↓ move · Enter open · Esc close</p>`);

	const input = dialog.querySelector("#palette-input");
	const results = dialog.querySelector(".palette__results");
	let entries = [];
	let rows = [];
	let active = 0;

	getCatalogue().then((catalogue) => {
		entries = [
			{ accession: "—", title: "Reading room", kind: "Wing", wing: "Home", route: "/" },
			...WINGS.map((wing) => ({ accession: wing.roman, title: wing.name, kind: "Wing", wing: wing.name, route: wing.route })),
			...catalogue,
			{ accession: "AC", title: "Record book", kind: "Action", wing: "You", route: "!records" },
		];
		render("");
	});

	function matches(query) {
		const q = query.trim().toLowerCase();
		if (!q) return entries.slice(0, 9);
		return entries
			.map((entry) => {
				const haystack = `${entry.accession} ${entry.title} ${entry.wing} ${entry.kind}`.toLowerCase();
				const at = haystack.indexOf(q);
				return { entry, score: at === -1 ? Infinity : at };
			})
			.filter((hit) => hit.score !== Infinity)
			.sort((a, b) => a.score - b.score)
			.slice(0, 12)
			.map((hit) => hit.entry);
	}

	function render(query) {
		rows = matches(query);
		active = 0;
		results.innerHTML = "";
		if (!rows.length) {
			const empty = document.createElement("li");
			empty.className = "palette__empty";
			empty.textContent = `Nothing in the catalogue matches “${query}”.`;
			results.appendChild(empty);
			return;
		}
		rows.forEach((entry, index) => {
			const row = document.createElement("li");
			row.className = "palette__row";
			row.id = `palette-row-${index}`;
			row.setAttribute("role", "option");
			row.setAttribute("aria-selected", String(index === 0));
			row.innerHTML = `<span class="accession"></span><span class="palette__title"></span><span class="palette__meta"></span>`;
			row.querySelector(".accession").textContent = entry.accession;
			row.querySelector(".palette__title").textContent = entry.title;
			row.querySelector(".palette__meta").textContent = `${entry.wing} · ${entry.kind}`;
			row.addEventListener("click", () => choose(index));
			results.appendChild(row);
		});
		input.setAttribute("aria-activedescendant", rows.length ? `palette-row-0` : "");
	}

	function move(delta) {
		if (!rows.length) return;
		active = (active + delta + rows.length) % rows.length;
		rows.forEach((_, index) => {
			const row = results.children[index];
			if (!row) return;
			row.classList.toggle("is-active", index === active);
			row.setAttribute("aria-selected", String(index === active));
		});
		results.children[active]?.scrollIntoView({ block: "nearest" });
		input.setAttribute("aria-activedescendant", `palette-row-${active}`);
	}

	function choose(index = active) {
		const entry = rows[index];
		if (!entry) return;
		dialog.close();
		if (entry.route === "!records") openRecords();
		else navigate(entry.route);
	}

	input.addEventListener("input", () => render(input.value));
	dialog.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
		else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
		else if (event.key === "Enter") { event.preventDefault(); choose(); }
	});
	dialog.addEventListener("close", () => { input.value = ""; render(""); });
	dialog.addEventListener("cancel", (event) => { event.preventDefault(); dialog.close(); });

	return {
		open() {
			dialog.showModal();
			input.value = "";
			render("");
			input.focus();
		},
	};
}

export function openRecords() {
	const dialog = ensureDialog("records", "records", `
		<h2 class="records__title">Record book</h2>
		<p class="records__lead">Nine records, earned across all three wings. Stored in this browser only.</p>
		<ul class="records__list"></ul>
		<form method="dialog"><button class="btn btn--sm" type="submit">Close</button></form>`);

	const listEl = dialog.querySelector(".records__list");
	listEl.innerHTML = "";
	listRecords().forEach((record) => {
		const item = document.createElement("li");
		item.className = record.unlocked ? "record is-unlocked" : "record";
		item.innerHTML = `
			<span class="accession"></span>
			<span class="record__body"><strong></strong><span></span></span>
			<span class="record__state"></span>`;
		item.querySelector(".accession").textContent = record.accession;
		item.querySelector("strong").textContent = record.title;
		item.querySelector(".record__body span").textContent = record.note;
		item.querySelector(".record__state").textContent = record.unlocked ? "Earned" : "Sealed";
		listEl.appendChild(item);
	});
	dialog.showModal();
}
