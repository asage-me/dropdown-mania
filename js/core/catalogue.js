/**
 * The catalogue index.
 *
 * Single source of truth is the wing markup itself: every exhibit carries
 * data-exhibit / data-accession / data-title. The command palette and the
 * home page read that index instead of maintaining a second list that could
 * drift out of date.
 */

import { loadTemplate } from "./templates.js";

export const WINGS = [
	{ id: "education", name: "Education", roman: "Wing I", template: "education.html", route: "/education" },
	{ id: "games", name: "Games", roman: "Wing II", template: "games.html", route: "/games" },
	{ id: "retro", name: "Retro 1999", roman: "Wing III", template: "retro-1999.html", route: "/retro" },
];

let index = null;
let pending = null;

export function getCatalogue() {
	if (index) return Promise.resolve(index);
	if (pending) return pending;

	pending = Promise.all(
		WINGS.map(async (wing) => {
			const html = await loadTemplate(wing.template);
			const doc = new DOMParser().parseFromString(html, "text/html");
			return Array.from(doc.querySelectorAll("[data-exhibit]")).map((node) => ({
				accession: node.dataset.accession || "—",
				title: node.dataset.title || node.textContent.trim().slice(0, 60),
				kind: node.dataset.exhibit === "demo" ? "Exhibit" : node.dataset.exhibit,
				wing: wing.name,
				wingId: wing.id,
				route: node.dataset.route || wing.route,
				target: node.id || null,
			}));
		}),
	)
		.then((groups) => {
			index = groups.flat();
			return index;
		})
		.catch((error) => {
			console.error("Catalogue index unavailable:", error);
			index = [];
			return index;
		});

	return pending;
}

/** Deterministic "dropdown of the day" — same pick all day, changes at midnight. */
export async function pickOfDay() {
	const list = await getCatalogue();
	if (!list.length) return null;
	const now = new Date();
	const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
	return list[dayNumber % list.length];
}
