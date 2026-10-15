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

function nextId(prefix) {
	idSeed += 1;
	return `${prefix}-${idSeed}`;
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
		const options = Array.from(this.native.options).map((opt, index) => ({
			index,
			value: opt.value,
			label: opt.textContent.trim(),
			disabled: opt.disabled,
			group: opt.parentElement?.tagName === "OPTGROUP" ? opt.parentElement.label : "",
		}));

		this.options = options;
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

		this.items = options.map((opt) => {
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
			listbox.appendChild(item);
			return item;
		});

		root.append(trigger, listbox);
		this.root = root;
		this.trigger = trigger;
		this.valueEl = value;
		this.listbox = listbox;
		this.activeIndex = -1;

		this.native.style.setProperty("display", "none", "important");
		this.native.setAttribute("aria-hidden", "true");
		this.native.tabIndex = -1;
		this.native.parentNode.insertBefore(root, this.native);

		this.paint();
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
		if (isOpen) openSet.add(this);
		else openSet.delete(this);
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
		const key = event.key;

		if (!this.open) {
			if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
				event.preventDefault();
				this.openList();
				if (key === "ArrowUp") this.highlight(this.lastEnabled());
			}
			return;
		}

		switch (key) {
			case "ArrowDown":
				event.preventDefault();
				this.highlight(this.step(this.activeIndex, 1));
				break;
			case "ArrowUp":
				event.preventDefault();
				this.highlight(this.step(this.activeIndex, -1));
				break;
			case "Home":
				event.preventDefault();
				this.highlight(this.firstEnabled());
				break;
			case "End":
				event.preventDefault();
				this.highlight(this.lastEnabled());
				break;
			case "Enter":
			case " ":
				event.preventDefault();
				if (this.activeIndex >= 0) this.commit(this.activeIndex);
				else this.close();
				break;
			case "Escape":
				event.preventDefault();
				this.close();
				break;
			case "Tab":
				this.close({ refocus: false });
				break;
			default:
				if (PRINTABLE.test(key)) this.runTypeahead(key);
		}
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

/** Drop widgets whose DOM is about to be thrown away. */
export function destroySelectsIn(scope) {
	scope.querySelectorAll("select[data-archive-select]").forEach((select) => {
		ArchiveSelect.of(select)?.destroy();
	});
}
