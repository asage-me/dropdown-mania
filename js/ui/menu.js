/**
 * Menu — accessible listbox behaviour over markup that already exists.
 *
 * ArchiveSelect handles native <select>. This handles the hand-authored
 * dropdowns the archive teaches about: the hero drawer, the mega menu, the
 * multi-select, the searchable filter. Same keyboard contract as the select,
 * so every dropdown on the site behaves identically.
 */

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

	function onKey(event) {
		if (!state.open) {
			if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
				event.preventDefault();
				setOpen(true);
				highlight(event.key === "ArrowUp" ? items().length - 1 : 0);
			}
			return;
		}
		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				highlight(step(state.active, 1));
				break;
			case "ArrowUp":
				event.preventDefault();
				highlight(step(state.active, -1));
				break;
			case "Home":
				event.preventDefault();
				highlight(0);
				break;
			case "End":
				event.preventDefault();
				highlight(items().length - 1);
				break;
			case "Enter":
			case " ":
				event.preventDefault();
				commit(state.active);
				break;
			case "Escape":
				event.preventDefault();
				close({ refocus: true });
				break;
			case "Tab":
				close();
				break;
			default:
				if (PRINTABLE.test(event.key)) typeahead(event.key);
		}
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

	function onDocClick(event) {
		if (state.open && !trigger.parentElement.contains(event.target)) close();
	}

	trigger.addEventListener("click", onTriggerClick);
	trigger.addEventListener("keydown", onKey);
	panel.addEventListener("click", onPanelClick);
	document.addEventListener("click", onDocClick);

	// Give every option an id so aria-activedescendant has something to point at.
	items().forEach((el, i) => {
		if (!el.id) el.id = `menu-item-${Math.random().toString(36).slice(2, 9)}-${i}`;
		if (!el.getAttribute("role")) el.setAttribute("role", "option");
	});

	const api = {
		close,
		open() { Menu.closeAll(); setOpen(true); highlight(0); },
		isOpen: () => state.open,
		destroy() {
			close();
			trigger.removeEventListener("click", onTriggerClick);
			trigger.removeEventListener("keydown", onKey);
			panel.removeEventListener("click", onPanelClick);
			document.removeEventListener("click", onDocClick);
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
