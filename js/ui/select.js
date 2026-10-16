/**
 * ArchiveSelect — an accessible upgrade for a native <select>.
 *
 * The native element stays in the DOM as the source of truth (form value,
 * history, screen readers), so this component never needs to be kept in sync
 * by hand: it writes to the native element, and it also listens for changes
 * made by other code and repaints itself.
 *
 * Keyboard model (WAI-ARIA select-only combobox):
 *   Enter / Space / Down / Up  open the listbox
 *   Down / Up                  move the active option (wraps)
 *   Home / End                 first / last option
 *   a–z                        typeahead
 *   Enter / Space              commit the active option
 *   Esc                        close, discard the highlight
 *   Tab                        close, commit nothing
 */

const registry = new WeakMap();
const openSet = new Set();
let idSeed = 0;

const PRINTABLE = /^[a-z0-9!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-]$/i;

/**
 * Keys while the listbox is open. A table rather than a switch keeps the
 * handler a lookup and leaves the contract in the header comment readable at a
 * glance. A Map, not an object, because the key comes from whatever the visitor
 * types and must never reach Object.prototype.
 */
const OPEN_KEYS = new Map([
	["ArrowDown", (sel) => sel.highlight(sel.step(sel.activeIndex, 1))],
	["ArrowUp", (sel) => sel.highlight(sel.step(sel.activeIndex, -1))],
	["Home", (sel) => sel.highlight(sel.firstEnabled())],
	["End", (sel) => sel.highlight(sel.lastEnabled())],
	["Enter", (sel) => (sel.activeIndex >= 0 ? sel.commit(sel.activeIndex) : sel.close())],
	[" ", (sel) => (sel.activeIndex >= 0 ? sel.commit(sel.activeIndex) : sel.close())],
	["Escape", (sel) => sel.close()],
	// The one key that must not be cancelled: focus has to be allowed to leave.
	["Tab", (sel) => sel.close({ refocus: false })],
]);

/** Keys that open a closed listbox. */
const OPENING_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", " "]);

function nextId(prefix) {
	idSeed += 1;
	return `${prefix}-${idSeed}`;
}

/* ---------- keeping an open listbox on screen ---------- */

/**
 * A menu is anchored to its trigger, so a trigger low in the viewport — or one
 * drifting around the viewport, which is exactly what Find the Path advanced
 * does — would otherwise spill off the bottom of the screen and hide its own
 * options. One loop serves every open menu and exists only while one is open,
 * so a page at rest costs nothing.
 */
const MENU_GAP = 6;
const MENU_MIN = 140; // never squeeze a menu into an unreadable sliver
let alignFrame = 0;

function alignAll() {
	openSet.forEach((sel) => sel.alignMenu());
	alignFrame = openSet.size ? requestAnimationFrame(alignAll) : 0;
}

function scheduleAlign() {
	if (!alignFrame) alignFrame = requestAnimationFrame(alignAll);
}

class ArchiveSelect {
	constructor(select, { variant = "" } = {}) {
		this.native = select;
		this.variant = variant;
		this.typeahead = "";
		this.typeaheadTimer = 0;
		this.fromComponent = false;

		this.build();
		this.bind();
		registry.set(select, this);
	}

	/* ---------- construction ---------- */

	build() {
		this.menuId = nextId("archive-select-listbox");

		const root = document.createElement("div");
		root.className = ["sel", this.variant].filter(Boolean).join(" ");

		const trigger = document.createElement("button");
		trigger.type = "button";
		trigger.className = "sel__trigger";
		trigger.setAttribute("role", "combobox");
		trigger.setAttribute("aria-haspopup", "listbox");
		trigger.setAttribute("aria-expanded", "false");
		trigger.setAttribute("aria-controls", this.menuId);
		trigger.disabled = this.native.disabled;

		const value = document.createElement("span");
		value.className = "sel__value";
		const caret = document.createElement("span");
		caret.className = "sel__caret";
		caret.setAttribute("aria-hidden", "true");
		trigger.append(value, caret);

		const listbox = document.createElement("div");
		listbox.className = "sel__menu";
		listbox.id = this.menuId;
		listbox.setAttribute("role", "listbox");
		listbox.hidden = true;

		const label = this.native.getAttribute("aria-label")
			|| labelFor(this.native);
		if (label) listbox.setAttribute("aria-label", label);

		this.root = root;
		this.trigger = trigger;
		this.valueEl = value;
		this.listbox = listbox;
		this.activeIndex = -1;

		this.renderItems();

		root.append(trigger, listbox);

		this.native.style.setProperty("display", "none", "important");
		this.native.setAttribute("aria-hidden", "true");
		this.native.tabIndex = -1;
		this.native.parentNode.insertBefore(root, this.native);

		this.paint();
	}

	/**
	 * Read the native options and rebuild the listbox to match. Kept apart from
	 * build() so refreshOptions() can re-read a select whose choices were
	 * rewritten after it was upgraded — Lazy Drop re-rolls which option carries
	 * its bonus star, and the label has to stay truthful.
	 */
	renderItems() {
		this.options = Array.from(this.native.options).map((opt, index) => ({
			index,
			value: opt.value,
			label: opt.textContent.trim(),
			disabled: opt.disabled,
			group: opt.parentElement?.tagName === "OPTGROUP" ? opt.parentElement.label : "",
		}));

		this.listbox.innerHTML = "";
		let lastGroup = null;
		this.items = this.options.map((opt) => {
			// A group header is decoration between the options. It never joins
			// this.items, so the arrow keys still step option to option and the
			// highlight logic never has to know that groups exist.
			if (opt.group && opt.group !== lastGroup) {
				const header = document.createElement("div");
				header.className = "sel__group";
				header.setAttribute("aria-hidden", "true");
				header.textContent = opt.group;
				this.listbox.appendChild(header);
			}
			lastGroup = opt.group;

			const item = document.createElement("div");
			item.className = "sel__option";
			item.setAttribute("role", "option");
			item.id = nextId("archive-select-option");
			item.dataset.index = String(opt.index);
			item.textContent = opt.label;
			if (opt.group) item.dataset.group = opt.group;
			if (opt.disabled) {
				item.classList.add("is-disabled");
				item.setAttribute("aria-disabled", "true");
			}
			item.addEventListener("click", (event) => {
				event.stopPropagation();
				if (opt.disabled) return;
				this.commit(opt.index);
			});
			this.listbox.appendChild(item);
			return item;
		});
	}

	/**
	 * Re-read the native element after application code replaced its options.
	 * The native select stays the source of truth, so this only has to look at
	 * it again — never keep a second copy of the choices in caller code.
	 */
	refreshOptions() {
		const wasOpen = this.open;
		this.close({ refocus: false });
		this.renderItems();
		this.paint();
		if (wasOpen) this.openList();
	}

	bind() {
		this.onTriggerKey = (event) => this.handleTriggerKey(event);
		this.onTriggerClick = (event) => {
			event.preventDefault();
			this.open ? this.close() : this.openList();
		};
		this.onNativeChange = () => {
			if (this.fromComponent) return;
			this.paint();
		};
		this.onDocumentFocusOut = (event) => {
			if (this.open && !this.root.contains(event.target)) this.close();
		};

		this.trigger.addEventListener("keydown", this.onTriggerKey);
		this.trigger.addEventListener("click", this.onTriggerClick);
		this.native.addEventListener("change", this.onNativeChange);
		document.addEventListener("focusout", this.onDocumentFocusOut);
	}

	/* ---------- state ---------- */

	get open() {
		return this.root.classList.contains("is-open");
	}

	get selectedIndex() {
		const i = this.native.selectedIndex;
		return i >= 0 ? i : 0;
	}

	paint() {
		const selected = this.options[this.selectedIndex];
		this.valueEl.textContent = selected ? selected.label : "";
		this.valueEl.classList.toggle("is-placeholder", !this.native.value);
		this.items.forEach((item, i) => {
			const isSelected = i === this.selectedIndex;
			item.classList.toggle("is-selected", isSelected);
			item.setAttribute("aria-selected", String(isSelected));
		});
	}

	/* ---------- open / close ---------- */

	openList() {
		ArchiveSelect.closeAll(this);
		this.openSetAdd(true);
		this.listbox.hidden = false;
		this.root.classList.add("is-open");
		this.trigger.setAttribute("aria-expanded", "true");
		// Placed before the first frame rather than on it, so a menu opening
		// near the bottom of the screen never flashes at the wrong size.
		this.alignMenu();
		this.highlight(Math.max(this.selectedIndex, 0));
	}

	close({ refocus = true } = {}) {
		if (!this.open) return;
		this.openSetAdd(false);
		this.root.classList.remove("is-open");
		this.listbox.hidden = true;
		this.trigger.setAttribute("aria-expanded", "false");
		this.trigger.removeAttribute("aria-activedescendant");
		this.activeIndex = -1;
		if (refocus) this.trigger.focus({ preventScroll: true });
	}

	openSetAdd(isOpen) {
		if (isOpen) {
			openSet.add(this);
			scheduleAlign();
			return;
		}
		openSet.delete(this);
		if (!openSet.size && alignFrame) {
			cancelAnimationFrame(alignFrame);
			alignFrame = 0;
		}
	}

	/**
	 * Choose the side with room and hand the menu the height it can actually
	 * use. Called every frame while open because a floating trigger moves
	 * between frames; a decision made once at open time goes stale immediately.
	 */
	alignMenu() {
		const rect = this.trigger.getBoundingClientRect();
		const below = window.innerHeight - rect.bottom - MENU_GAP;
		const above = rect.top - MENU_GAP;
		const wanted = this.listbox.scrollHeight + MENU_GAP;
		const up = below < wanted && above > below;
		const room = Math.max(MENU_MIN, up ? above : below);
		this.listbox.classList.toggle("is-up", up);
		this.listbox.style.setProperty("--menu-room", `${Math.round(room)}px`);
	}

	highlight(index) {
		if (!this.items.length) return;
		const bounded = ((index % this.items.length) + this.items.length) % this.items.length;
		this.activeIndex = bounded;
		this.items.forEach((item, i) => item.classList.toggle("is-active", i === bounded));
		const active = this.items[bounded];
		this.trigger.setAttribute("aria-activedescendant", active.id);
		const list = this.listbox;
		const top = active.offsetTop;
		const bottom = top + active.offsetHeight;
		if (top < list.scrollTop) list.scrollTop = top;
		else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
	}

	/** Move to the next enabled option, skipping disabled ones. */
	step(from, direction) {
		const total = this.items.length;
		for (let n = 1; n <= total; n += 1) {
			const candidate = (((from + direction * n) % total) + total) % total;
			if (!this.options[candidate].disabled) return candidate;
		}
		return from;
	}

	firstEnabled() {
		const found = this.options.findIndex((o) => !o.disabled);
		return found === -1 ? 0 : found;
	}

	lastEnabled() {
		for (let i = this.options.length - 1; i >= 0; i -= 1) {
			if (!this.options[i].disabled) return i;
		}
		return 0;
	}

	commit(index) {
		if (this.options[index].disabled) return;
		this.fromComponent = true;
		this.native.selectedIndex = index;
		this.native.dispatchEvent(new Event("change", { bubbles: true }));
		this.fromComponent = false;
		this.paint();
		this.close();
	}

	/* ---------- keyboard ---------- */

	handleTriggerKey(event) {
		if (!this.open) {
			if (!OPENING_KEYS.has(event.key)) return;
			event.preventDefault();
			this.openList();
			if (event.key === "ArrowUp") this.highlight(this.lastEnabled());
			return;
		}

		const action = OPEN_KEYS.get(event.key);
		if (!action) {
			if (PRINTABLE.test(event.key)) this.runTypeahead(event.key);
			return;
		}
		if (event.key !== "Tab") event.preventDefault();
		action(this);
	}

	runTypeahead(char) {
		window.clearTimeout(this.typeaheadTimer);
		this.typeahead += char.toLowerCase();
		this.typeaheadTimer = window.setTimeout(() => { this.typeahead = ""; }, 600);

		const start = this.activeIndex >= 0 ? this.activeIndex : this.selectedIndex;
		const total = this.options.length;
		for (let n = 1; n <= total; n += 1) {
			const candidate = (start + n) % total;
			const opt = this.options[candidate];
			if (!opt.disabled && opt.label.toLowerCase().startsWith(this.typeahead)) {
				this.highlight(candidate);
				return;
			}
		}
		if (this.typeahead.length === 1) {
			for (let n = 1; n <= total; n += 1) {
				const candidate = (start + n) % total;
				if (!this.options[candidate].disabled
					&& this.options[candidate].label.toLowerCase().startsWith(char.toLowerCase())) {
					this.highlight(candidate);
					return;
				}
			}
		}
	}

	/* ---------- teardown ---------- */

	destroy() {
		this.close({ refocus: false });
		this.trigger.removeEventListener("keydown", this.onTriggerKey);
		this.trigger.removeEventListener("click", this.onTriggerClick);
		this.native.removeEventListener("change", this.onNativeChange);
		document.removeEventListener("focusout", this.onDocumentFocusOut);
		this.root.remove();
		this.native.style.removeProperty("display");
		this.native.removeAttribute("aria-hidden");
		this.native.removeAttribute("tabindex");
		// The marker is what enhanceSelects() skips, so leaving it behind would
		// mean a destroyed select can never be upgraded again — destroy() would
		// only be safe when the element is about to be thrown away.
		this.native.removeAttribute("data-archive-select");
		registry.delete(this.native);
	}

	static closeAll(except = null) {
		for (const instance of Array.from(openSet)) {
			if (instance !== except) instance.close({ refocus: false });
		}
	}

	static of(select) {
		return registry.get(select) || null;
	}
}

function labelFor(select) {
	if (select.labels && select.labels.length) {
		return select.labels[0].textContent.trim();
	}
	const id = select.getAttribute("id");
	if (!id) return "";
	const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
	return label ? label.textContent.trim() : "";
}

/** Upgrade every un-upgraded native select inside a scope. */
export function enhanceSelects(scope = document, { variant = "" } = {}) {
	const selects = scope.querySelectorAll("select:not([data-archive-select])");
	const created = [];
	selects.forEach((select) => {
		select.setAttribute("data-archive-select", "");
		const variantName = select.dataset.selectVariant || variant;
		const instance = new ArchiveSelect(select, { variant: variantName });
		created.push(instance);
	});
	return created;
}

/** Repaint the widget after application code changed select.value. */
export function syncSelect(select) {
	ArchiveSelect.of(select)?.paint();
}

/**
 * Rebuild the widget after application code replaced the select's <option>
 * elements. paint() would only refresh the chosen label; anything that changes
 * the choices themselves has to be re-read.
 */
export function refreshSelect(select) {
	ArchiveSelect.of(select)?.refreshOptions();
}

/**
 * The widget's trigger button for an upgraded select, or null.
 *
 * The trigger - not the hidden native element - is what the visitor tabs to
 * and types into, so demo code that watches keys has to listen there. Ask the
 * widget instead of walking the DOM: the root is a sibling of the native
 * select, which makes previousElementSibling the only link and a silent
 * no-op the moment the markup is reordered.
 */
export function selectTrigger(select) {
	return ArchiveSelect.of(select)?.trigger ?? null;
}

/** Drop widgets whose DOM is about to be thrown away. */
export function destroySelectsIn(scope) {
	scope.querySelectorAll("select[data-archive-select]").forEach((select) => {
		ArchiveSelect.of(select)?.destroy();
	});
}
