/**
 * Achievements — one cross-wing record book.
 * Games call achievements.unlock(id); the module owns persistence and the toast.
 */

import { loadMerged, save } from "../lib/store.js";

const KEY = "achievements";

const ACHIEVEMENTS = {
	"path-first": { accession: "AC-01", title: "Path Found", note: "Cleared Find the Path on standard." },
	"path-advanced": { accession: "AC-02", title: "Steady Hand", note: "Cleared Find the Path while the menus moved." },
	"hacker-granted": { accession: "AC-03", title: "Root Access", note: "Assembled the credential hidden across four surfaces." },
	"hacker-all-clues": { accession: "AC-04", title: "Read the Fine Source", note: "Held all four fragments, found or handed over." },
	"lazy-1k": { accession: "AC-05", title: "Point Collector", note: "Banked 1,000 points in Lazy Drop." },
	"lazy-tier-5": { accession: "AC-06", title: "Small Print", note: "Raised Lazy Drop to tier 5." },
	"retro-signed": { accession: "AC-07", title: "Signed the Guestbook", note: "Left a mark in 1999." },
	"edu-complete": { accession: "AC-08", title: "Catalogue Read", note: "Opened every exhibit in Education." },
	"wing-visitor": { accession: "AC-09", title: "Full Tour", note: "Visited all three wings in one sitting." },
	"lazy-jackpot": { accession: "AC-10", title: "Lightning Drop", note: "Picked the one prize row out of the Long Menu's 500." },
	"path-catalogue": { accession: "AC-11", title: "The Whole Shelf", note: "Cleared all fifty question sets in Find the Path." },
	"hacker-base64": { accession: "AC-12", title: "Not Encryption", note: "Decoded the base64 packet in the Hacker Puzzle." },
	"hacker-caesar": { accession: "AC-13", title: "Shifted Thinking", note: "Found the key in the page and shifted the intercept back." },
	"hacker-hex": { accession: "AC-14", title: "Byte Reader", note: "Read the hex flag two digits at a time." },
	"hacker-mirror": { accession: "AC-15", title: "Read It Backwards", note: "Undid the ROT13 and the reversal, in the right order." },
	"hacker-deep": { accession: "AC-16", title: "Three Layers Deep", note: "Stripped hex, then base64, then ROT13 off the last flag." },
	"hacker-all": { accession: "AC-17", title: "Root Kit", note: "Recovered all six flags from the Hacker Puzzle." },
};

// No reset(): the record book is append-only, and nothing in the UI clears it.
const state = loadMerged(KEY, {});
let host = null;
let queue = [];
let showing = false;

function attachHost() {
	if (host) return host;
	host = document.getElementById("achievement-host");
	if (!host) {
		host = document.createElement("div");
		host.id = "achievement-host";
		host.className = "achievement-host";
		host.setAttribute("role", "status");
		host.setAttribute("aria-live", "polite");
		document.body.appendChild(host);
	}
	return host;
}

function paint() {
	const el = attachHost();
	el.innerHTML = "";
	const id = queue.shift();
	if (!id) {
		showing = false;
		return;
	}
	const def = ACHIEVEMENTS[id];
	showing = true;

	const card = document.createElement("div");
	card.className = "achievement";
	card.innerHTML = `
		<span class="achievement__accession">${def.accession}</span>
		<div>
			<strong class="achievement__title"></strong>
			<p class="achievement__note"></p>
		</div>`;
	card.querySelector(".achievement__title").textContent = def.title;
	card.querySelector(".achievement__note").textContent = def.note;
	el.appendChild(card);

	window.setTimeout(() => {
		card.classList.add("is-leaving");
		window.setTimeout(paint, 320);
	}, 4200);
}

export function unlock(id) {
	if (!ACHIEVEMENTS[id] || state[id]) return false;
	state[id] = Date.now();
	save(KEY, state);
	queue.push(id);
	if (!showing) paint();
	document.dispatchEvent(new CustomEvent("archive:achievement", { detail: { id } }));
	return true;
}

export function list() {
	return Object.entries(ACHIEVEMENTS).map(([id, def]) => ({ id, ...def, unlocked: Boolean(state[id]) }));
}

export function unlockedCount() {
	return Object.keys(state).filter((id) => state[id]).length;
}
