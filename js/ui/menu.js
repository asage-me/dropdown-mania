/**
 * Menu — accessible listbox behaviour over markup that already exists.
 *
 * ArchiveSelect handles native <select>. This handles the hand-authored
 * dropdowns the archive teaches about: the hero drawer, the mega menu, the
 * multi-select, the searchable filter. Same keyboard contract as the select,
 * so every dropdown on the site behaves identically — and the same model for
 * getting out of one: Esc, Tab, a pick, a click anywhere outside, or focus
 * moving somewhere else entirely, none of which drags focus back except on a
 * pick. The list's own items are not focusable, so a mousedown inside the panel
 * is cancelled to keep focus on the trigger; see ui/scrollbar.js for the one
 * press that is spared, and ui/presses.js for why the spared press still has to
 * be caught before it reads as leaving.
 */

import { isScrollbarPress } from "./scrollbar.js";
import { trackPanelPresses } from "./presses.js";

const PRINTABLE = /^[a-z0-9!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-]$/i;
const openMenus = new Set();

export function createMenu({ trigger, panel, itemSelector = "[data-menu-item]", onSelect, keepOpen = false }) {
	const state = { open: false, active: -1, typeahead: "", timer: 0 };

	const itemsOf = () => Array.from(panel.querySelectorAll(itemSelector))
		.filter((el) => !el.hidden && !el.hasAttribute("data-disabled"));

	function items() {
		return itemsOf();
	}

	function setOpen(isOpen) {
		if (state.open === isOpen) return;
		state.open = isOpen;
		const root = trigger.parentElement;
		root.classList.toggle("is-open", isOpen);
		panel.hidden = !isOpen;
		trigger.setAttribute("aria-expanded", String(isOpen));
		if (isOpen) {
			openMenus.add(state);
			state.close = close;
		} else {
			openMenus.delete(state);
			trigger.removeAttribute("aria-activedescendant");
			state.active = -1;
		}
	}

	function close({ refocus = false } = {}) {
		if (!state.open) return;
		setOpen(false);
		items().forEach((el) => el.classList.remove("is-active"));
		if (refocus) trigger.focus({ preventScroll: true });
	}

	function highlight(index) {
		const list = items();
		if (!list.length) return;
		const bounded = ((index % list.length) + list.length) % list.length;
		state.active = bounded;
		list.forEach((el, i) => el.classList.toggle("is-active", i === bounded));
		const active = list[bounded];
		trigger.setAttribute("aria-activedescendant", active.id);
		active.scrollIntoView({ block: "nearest" });
	}

	function commit(index) {
		const list = items();
		const target = list[index];
		if (!target) return;
		onSelect?.(target, index);
		if (!keepOpen) close({ refocus: true });
	}

	function step(from, direction) {
		const list = items();
		// Nothing is active yet (the intro opens unhighlighted). A listbox with no
		// active option enters at the top going down and the bottom going up.
		if (from < 0) return direction > 0 ? 0 : list.length - 1;
		return (((from + direction) % list.length) + list.length) % list.length;
	}

	function typeahead(char) {
		window.clearTimeout(state.timer);
		state.typeahead += char.toLowerCase();
		state.timer = window.setTimeout(() => { state.typeahead = ""; }, 600);
		const list = items();
		const start = state.active >= 0 ? state.active : -1;
		for (let n = 1; n <= list.length; n += 1) {
			const candidate = (start + n) % list.length;
			if (list[candidate].textContent.trim().toLowerCase().startsWith(state.typeahead)) {
				highlight(candidate);
				return;
			}
		}
	}

	// Same shape as ArchiveSelect: a table, so the handler stays a lookup. Tab is
	// the only key left uncancelled, because focus has to be able to move on.
	const OPEN_KEYS = new Map([
		["ArrowDown", () => highlight(step(state.active, 1))],
		["ArrowUp", () => highlight(step(state.active, -1))],
		["Home", () => highlight(0)],
		["End", () => highlight(items().length - 1)],
		["Enter", () => commit(state.active)],
		[" ", () => commit(state.active)],
		["Escape", () => close({ refocus: true })],
		["Tab", () => close()],
	]);
	const OPENING_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", " "]);

	function onKey(event) {
		if (!state.open) {
			if (!OPENING_KEYS.has(event.key)) return;
			event.preventDefault();
			setOpen(true);
			highlight(event.key === "ArrowUp" ? items().length - 1 : 0);
			return;
		}

		const action = OPEN_KEYS.get(event.key);
		if (!action) {
			if (PRINTABLE.test(event.key)) typeahead(event.key);
			return;
		}
		if (event.key !== "Tab") event.preventDefault();
		action();
	}

	function onTriggerClick(event) {
		event.preventDefault();
		event.stopPropagation();
		if (state.open) close({ refocus: true });
		else {
			Menu.closeAll();
			setOpen(true);
			highlight(0);
			trigger.setAttribute("aria-expanded", "true");
		}
	}

	function onPanelClick(event) {
		const target = event.target.closest(itemSelector);
		if (!target) return;
		event.stopPropagation();
		commit(items().indexOf(target));
	}

	// Nothing in the list takes focus — the highlight lives in
	// aria-activedescendant — so a mousedown left alone hands focus to the
	// nearest focusable ancestor, which on every page here is
	// <main class="wing" tabindex="-1">. The dismissal below reads exactly that
	// as leaving the widget, so without this the list closed under the pointer
	// before mouseup, the click landed on the page around it, and a pick did
	// nothing at all. Cancelling mousedown is also what stops a scrollbar thumb
	// being dragged, which is why the panel's own bar is left alone.
	function onPanelMouseDown(event) {
		if (isScrollbarPress(event, panel)) return;
		event.preventDefault();
	}

	function onDocClick(event) {
		if (state.open && !trigger.parentElement.contains(event.target)) close();
	}

	// Focus moving out is an exit too: the index palette, a filter dialog, or
	// simply Tab. relatedTarget is the element gaining focus, and focus stays
	// with it — close() on this path never pulls focus back to the trigger.
	function onFocusOut(event) {
		const next = event.relatedTarget;
		if (!state.open || !next || trigger.parentElement.contains(next)) return;
		// Except for a press the panel is holding. The press on the panel's own
		// scrollbar is deliberately not cancelled, and Chromium still moves focus
		// off a control whose list is open for it — mid-drag, that is not a
		// departure, so the focus goes back where the listbox pattern wants it and
		// the menu stays up over the thumb (ui/presses.js).
		if (presses.pressing()) {
			trigger.focus({ preventScroll: true });
			return;
		}
		close();
	}

	const presses = trackPanelPresses(panel);

	trigger.addEventListener("click", onTriggerClick);
	trigger.addEventListener("keydown", onKey);
	panel.addEventListener("click", onPanelClick);
	panel.addEventListener("mousedown", onPanelMouseDown);
	document.addEventListener("click", onDocClick);
	document.addEventListener("focusout", onFocusOut);

	// Give every option an id so aria-activedescendant has something to point at.
	items().forEach((el, i) => {
		if (!el.id) el.id = `menu-item-${Math.random().toString(36).slice(2, 9)}-${i}`;
		if (!el.getAttribute("role")) el.setAttribute("role", "option");
	});

	const setActive = highlight;

	const api = {
		close,
		// Pass -1 to open with nothing highlighted, for callers that move the
		// highlight themselves. Pre-highlighting the first option would leave the
		// first step of that animation with nothing visibly changing.
		open(index = 0) {
			Menu.closeAll();
			setOpen(true);
			if (index >= 0) highlight(index);
		},
		// Move the highlight without opening or committing, for callers that
		// animate a list (the home intro). Ignored while closed: pointing
		// aria-activedescendant at a hidden listbox is a lie to readers.
		highlight(index) {
			if (state.open) setActive(index);
		},
		isOpen: () => state.open,
		destroy() {
			close();
			trigger.removeEventListener("click", onTriggerClick);
			trigger.removeEventListener("keydown", onKey);
			panel.removeEventListener("click", onPanelClick);
			panel.removeEventListener("mousedown", onPanelMouseDown);
			presses.release();
			document.removeEventListener("click", onDocClick);
			document.removeEventListener("focusout", onFocusOut);
			openMenus.delete(state);
		},
	};
	return api;
}

export const Menu = {
	closeAll() {
		for (const state of Array.from(openMenus)) state.close?.();
	},
};
