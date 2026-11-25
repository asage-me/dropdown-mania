/**
 * WING I — Education behaviours.
 *
 * Every exhibit is wired here rather than in inline <script> inside the
 * template. The original inlined them, so each visit to the wing re-ran them
 * and stacked another copy of every document-level listener.
 *
 * mount() returns one cleanup that removes everything this module added.
 */

import { createMenu, Menu } from "../ui/menu.js";
import { selectTrigger } from "../ui/select.js";
import { isScrollbarPress } from "../ui/scrollbar.js";
import { trackPanelPresses } from "../ui/presses.js";

export default {
	id: "education",
	label: "Education",
	title: "Education — The Dropdown Archive",
	template: "education.html",

	mount(root, route, api) {
		const cleanups = [];
		const on = (node, type, handler, options) => {
			node?.addEventListener(type, handler, options);
			cleanups.push(() => node?.removeEventListener(type, handler, options));
		};
		const use = (fn) => cleanups.push(fn);

		/* ---------- DD-001 / DD-007 readouts ---------- */
		[["#dd001-select", "[data-dd001-readout]"], ["#dd007-select", "[data-dd007-readout]"]].forEach(([sel, out]) => {
			const select = root.querySelector(sel);
			const readout = root.querySelector(out);
			if (!select || !readout) return;
			const update = () => {
				readout.textContent = select.value
					? `Chosen: ${select.options[select.selectedIndex].textContent}`
					: "Nothing chosen yet.";
			};
			on(select, "change", update);
		});

		/* ---------- DD-002 custom listbox ---------- */
		const dd002 = root.querySelector("[data-dd002]");
		if (dd002) {
			const readout = root.querySelector("[data-dd002-readout]");
			const menu = createMenu({
				trigger: dd002.querySelector(".pick__trigger"),
				panel: dd002.querySelector(".pick__list"),
				onSelect(item) {
					dd002.querySelector(".pick__value").textContent = item.textContent;
					readout.textContent = `Method recorded: ${item.textContent}.`;
				},
			});
			use(() => menu.destroy());
		}

		/* ---------- DD-004 mega menu ---------- */
		const mega = root.querySelector("[data-dd004]");
		if (mega) {
			const trigger = mega.querySelector(".mega__trigger");
			const panel = mega.querySelector(".mega__panel");
			let open = false;

			const setOpen = (isOpen) => {
				open = isOpen;
				panel.hidden = !isOpen;
				mega.classList.toggle("is-open", isOpen);
				trigger.setAttribute("aria-expanded", String(isOpen));
			};
			const onTrigger = () => setOpen(!open);
			const onDocClick = (event) => {
				if (open && !mega.contains(event.target)) setOpen(false);
			};
			const onKey = (event) => {
				if (event.key === "Escape" && open) {
					setOpen(false);
					trigger.focus();
				}
			};
			// Close after the last link so Tab cannot disappear behind the panel.
			const links = Array.from(panel.querySelectorAll("a"));
			const onLastLinkKey = (event) => {
				if (event.key === "Tab" && !event.shiftKey) setOpen(false);
			};
			const onPanelClick = (event) => {
				if (event.target.closest("a")) setOpen(false);
			};

			on(trigger, "click", onTrigger);
			on(document, "click", onDocClick);
			on(document, "keydown", onKey);
			on(panel, "click", onPanelClick);
			on(links[links.length - 1], "keydown", onLastLinkKey);
			use(() => setOpen(false));
		}

		/* ---------- DD-005 multi-select ---------- */
		const multi = root.querySelector("[data-dd005]");
		if (multi) {
			const trigger = multi.querySelector(".pick__trigger");
			const valueEl = multi.querySelector("#dd005-value");
			const list = multi.querySelector(".pick__list");
			const chips = root.querySelector("[data-dd005-chips]");
			const items = Array.from(list.querySelectorAll(".pick__item"));
			let open = false;

			const selected = () => items.filter((item) => item.getAttribute("aria-selected") === "true");

			const paint = () => {
				const chosen = selected();
				valueEl.textContent = chosen.length ? `${chosen.length} selected` : "No tags selected";
				chips.innerHTML = "";
				if (!chosen.length) {
					const empty = document.createElement("span");
					empty.className = "chips__empty";
					empty.textContent = "Nothing selected";
					chips.appendChild(empty);
					return;
				}
				chosen.forEach((item) => {
					const chip = document.createElement("button");
					chip.type = "button";
					chip.className = "chip";
					chip.innerHTML = '<span></span><span class="chip__x" aria-hidden="true">×</span>';
					chip.querySelector("span").textContent = item.textContent;
					chip.setAttribute("aria-label", `Remove tag ${item.textContent}`);
					chip.addEventListener("click", () => {
						item.setAttribute("aria-selected", "false");
						item.classList.remove("is-selected");
						paint();
					});
					chips.appendChild(chip);
				});
			};

			const setOpen = (isOpen) => {
				open = isOpen;
				multi.classList.toggle("is-open", isOpen);
				list.hidden = !isOpen;
				trigger.setAttribute("aria-expanded", String(isOpen));
			};

			const onTrigger = () => {
				Menu.closeAll();
				setOpen(!open);
			};
			const onList = (event) => {
				const item = event.target.closest(".pick__item");
				if (!item) return;
				const isOn = item.getAttribute("aria-selected") === "true";
				item.setAttribute("aria-selected", String(!isOn));
				item.classList.toggle("is-selected", !isOn);
				paint();
			};
			const onKey = (event) => {
				if (!open) {
					if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						setOpen(true);
					}
					return;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					setOpen(false);
					trigger.focus();
				}
			};
			const onDocClick = (event) => {
				if (open && !multi.contains(event.target)) setOpen(false);
			};

			on(trigger, "click", onTrigger);
			on(trigger, "keydown", onKey);
			on(list, "click", onList);
			on(document, "click", onDocClick);
			on(root.querySelector("[data-dd005-clear]"), "click", () => {
				items.forEach((item) => {
					item.setAttribute("aria-selected", "false");
					item.classList.remove("is-selected");
				});
				paint();
			});
			paint();
			use(() => setOpen(false));
		}

		/* ---------- DD-006 searchable combobox ---------- */
		const combo = root.querySelector("[data-dd006]");
		if (combo) {
			const input = combo.querySelector(".combo__input");
			const list = combo.querySelector(".combo__list");
			const count = root.querySelector("[data-dd006-count]");
			const RECORDS = [
				"Paper — rag board, 1998 donation", "Paper — washi tissue, cold storage",
				"Map — harbour survey, rolled", "Map — county sheet, torn",
				"Photograph — gelatin silver, 1931", "Photograph — glass plate, unlabelled",
				"Manuscript — ledger, iron gall ink", "Manuscript — correspondence bundle",
				"Textile — sample book, 1889", "Textile — banner, moth damage",
				"Poster — exhibition, colour offset", "Poster — safety notice, lithograph",
				"Book — artist's binding, cloth", "Book — trade edition, cracked hinge",
				"Drawing — graphite study, mounted", "Drawing — blueprint, cyanotype",
				"Object — brass fastener box", "Object — printing block, boxwood",
			];
			let activeIndex = -1;
			let matches = RECORDS.slice();

			const render = () => {
				const query = input.value.trim().toLowerCase();
				matches = query ? RECORDS.filter((r) => r.toLowerCase().includes(query)) : RECORDS.slice();
				list.innerHTML = "";
				matches.forEach((record, index) => {
					const item = document.createElement("li");
					item.className = "combo__item";
					item.id = `dd006-opt-${index}`;
					item.setAttribute("role", "option");
					item.setAttribute("aria-selected", String(index === activeIndex));
					item.textContent = record;
					item.addEventListener("click", () => commit(index));
					list.appendChild(item);
				});
				activeIndex = matches.length ? 0 : -1;
				paintActive();
				list.hidden = matches.length === 0 || document.activeElement !== input;
				input.setAttribute("aria-expanded", String(!list.hidden));
				count.textContent = matches.length === 0
					? `No record matches “${input.value}”. Try a shorter word.`
					: `${matches.length} of ${RECORDS.length} records shown.`;
			};

			const paintActive = () => {
				Array.from(list.children).forEach((child, index) => {
					child.classList.toggle("is-active", index === activeIndex);
					child.setAttribute("aria-selected", String(index === activeIndex));
				});
				if (activeIndex >= 0 && list.children[activeIndex]) {
					input.setAttribute("aria-activedescendant", list.children[activeIndex].id);
					list.children[activeIndex].scrollIntoView({ block: "nearest" });
				} else {
					input.removeAttribute("aria-activedescendant");
				}
			};

			/**
			 * The one way out of the list. Hiding it is not enough on its own:
			 * aria-activedescendant is a pointer into a list that is on screen, and a
			 * collapsed list still pointing at an option leaves a screen reader reading
			 * a row the visitor cannot see, with the next arrow key starting from a row
			 * that is not there. Three call sites (Escape, a commit, focus walking off)
			 * each used to remember the first two of these three.
			 */
			const collapse = () => {
				list.hidden = true;
				input.setAttribute("aria-expanded", "false");
				input.removeAttribute("aria-activedescendant");
			};

			const commit = (index) => {
				if (!matches[index]) return;
				input.value = matches[index];
				collapse();
				count.textContent = `Selected: ${matches[index]}.`;
			};

			const onInput = () => { activeIndex = 0; render(); };
			const onFocus = () => { render(); };
			const onKey = (event) => {
				if (list.hidden && ["ArrowDown", "ArrowUp"].includes(event.key)) { render(); return; }
				switch (event.key) {
					case "ArrowDown": event.preventDefault(); activeIndex = Math.min(activeIndex + 1, matches.length - 1); paintActive(); break;
					case "ArrowUp": event.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); paintActive(); break;
					case "Enter":
						if (!list.hidden && matches[activeIndex]) { event.preventDefault(); commit(activeIndex); }
						break;
					case "Escape": event.preventDefault(); collapse(); break;
					default: break;
				}
			};
			const onBlur = () => {
				// Asked now, not inside the timer below: the press is over by the time
				// the grace period ends, and this blur is the browser moving focus off
				// a control whose list is open, not the reader walking away
				// (js/ui/presses.js). Put the caret straight back and leave the list up.
				if (presses.pressing()) { input.focus({ preventScroll: true }); return; }
				window.setTimeout(() => {
					if (!combo.contains(document.activeElement)) collapse();
				}, 120);
			};

			// Nothing in this list takes focus — the highlight lives in
			// aria-activedescendant — so a press on a row, left alone, moves focus to
			// main.wing[tabindex="-1"] and the reader loses the caret mid-word. The
			// two real components refuse the press for the same reason (js/ui/menu.js,
			// js/ui/select.js), and both put isScrollbarPress in front of the refusal
			// because this list scrolls (overflow-y); a drag of its bar must stay a
			// drag. Same here, for the same reason — and the same follow-through: the
			// press that is spared still moves focus, so the blur below asks the
			// tracker in js/ui/presses.js whether the pointer is on the list before it
			// treats that move as the reader leaving.
			const presses = trackPanelPresses(list);
			use(() => presses.release());

			const onListMouseDown = (event) => {
				if (isScrollbarPress(event, list)) return;
				event.preventDefault();
			};

			on(input, "input", onInput);
			on(input, "focus", onFocus);
			on(input, "keydown", onKey);
			on(input, "blur", onBlur);
			on(list, "mousedown", onListMouseDown);
			count.textContent = `${RECORDS.length} records. Start typing to filter.`;
		}

		/* ---------- DD-008 keyboard log ---------- */
		const log = root.querySelector("[data-dd008-log]");
		if (log) {
			const entries = [];
			const onKey = (event) => {
				const label = event.key === " " ? "Space" : event.key;
				if (label.length === 1 && !/[a-z0-9]/i.test(label)) return;
				entries.unshift(label);
				log.innerHTML = "";
				entries.slice(0, 6).forEach((entry, index) => {
					const item = document.createElement("li");
					item.className = "keylog__item";
					item.innerHTML = '<kbd></kbd><span></span>';
					item.querySelector("kbd").textContent = entry;
					item.querySelector("span").textContent = index === 0 ? "received" : "—";
					log.appendChild(item);
				});
			};
			on(root.querySelector("#dd008-select"), "keydown", onKey, true);
			// The widget's trigger, not the hidden native element, receives keys.
			const trigger = selectTrigger(root.querySelector("#dd008-select"));
			on(trigger, "keydown", onKey, true);
		}

		/* ---------- DD-009 accessible naming ---------- */
		const naming = root.querySelector("[data-dd009]");
		if (naming) {
			const said = root.querySelector("[data-dd009-said]");
			const why = root.querySelector("[data-dd009-why]");
			const EXPLAIN = {
				labelled: ['“Handling rules, combo box, two hands always, collapsed, has popup”', "aria-labelledby resolves first, then the label element gives the group name."],
				orphan: ['“Combo box, collapsed, has popup”', "Nothing in the name computation matched. The value is read, the purpose is not."],
				title: ['“Handling rules, combo box”', "title is the last resort: it is not focusable, not translated consistently, and invisible on touch."],
				labelledby: ['“Conservation handling, combo box”', "aria-labelledby wins outright — including text that is visually hidden, which is exactly why it is powerful."],
				placeholder: ['“Combo box, Select a handling rule…”', "Placeholder is read as content, not as a name, and it vanishes as soon as anyone types."],
			};
			const menu = createMenu({
				trigger: naming.querySelector(".pick__trigger"),
				panel: naming.querySelector(".pick__list"),
				onSelect(item) {
					naming.querySelector(".pick__value").textContent = item.textContent;
					const entry = EXPLAIN[item.dataset.name];
					if (!entry) return;
					said.textContent = entry[0];
					why.textContent = entry[1];
				},
			});
			use(() => menu.destroy());
		}

		/* ---------- DD-010 mouse-only div ---------- */
		const broken = root.querySelector("[data-dd010-div]");
		if (broken) {
			const onClick = () => {
				broken.classList.toggle("is-open");
				broken.textContent = broken.classList.contains("is-open")
					? "1990s ▾ (see? a mouse gets this. Tab gets nothing.)"
					: "Choose a decade ▾";
			};
			on(broken, "click", onClick);
		}

		/* ---------- exhibit progress → record book ---------- */
		const exhibits = Array.from(root.querySelectorAll("[data-exhibit]"));
		const visited = new Set();
		if ("IntersectionObserver" in window && exhibits.length) {
			const observer = new IntersectionObserver((entries) => {
				entries.forEach((entry) => {
					if (!entry.isIntersecting) return;
					visited.add(entry.target.id);
					entry.target.classList.add("is-read");
					if (visited.size === exhibits.length) api.unlock("edu-complete");
				});
			}, { threshold: 0.35 });
			exhibits.forEach((exhibit) => observer.observe(exhibit));
			use(() => observer.disconnect());
		}

		/* ---------- deep link ---------- */
		focusExhibit(root, route);

		root.querySelector("[data-open-records]")?.addEventListener("click", (event) => {
			event.preventDefault();
			api.openRecords();
		});

		return () => cleanups.reverse().forEach((fn) => fn());
	},

	onSub(root, route) {
		focusExhibit(root, route);
	},
};

/** Scroll an exhibit into view and stamp it, without remounting the wing. */
function focusExhibit(root, route) {
	if (!route?.sub) return;
	const target = root.querySelector(`#${CSS.escape(route.sub)}`);
	if (!target) return;
	target.scrollIntoView({ block: "start" });
	target.classList.add("is-targeted");
	window.setTimeout(() => target.classList.remove("is-targeted"), 2200);
}
