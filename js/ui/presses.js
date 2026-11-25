/**
 * Whether the pointer is pressing inside a dropdown's panel right now.
 *
 * A dropdown component has two ways to learn that the visitor left: a click
 * outside the widget, and `focusout`. A pick inside the panel defeats the first
 * on its own — the event's target is inside the widget — and the second only
 * because the components cancel `mousedown` inside the list, which is what keeps
 * focus on the trigger (see `ui/select.js`, `ui/menu.js`).
 *
 * One press cannot be cancelled: the panel's own scrollbar, which has to keep its
 * default in order to drag (`ui/scrollbar.js`). The menus here genuinely scroll —
 * The Long Menu in Lazy Drop is five hundred rows inside a 290px box — so that
 * press is let through, and the fallout has to be caught instead. Chromium does
 * not treat a press inside an open listbox the way it treats a press on a plain
 * scrollable `div`: it takes focus off the control and gives it to the nearest
 * focusable ancestor, which on every page in this archive is
 * `<main class="wing" tabindex="-1">`. `focusout` fires, reads exactly like a
 * keyboard Tab out to the next control, and the list vanished under the thumb —
 * the report was “clicking on it just closes the menu”.
 *
 * A component that can see the press is in progress can answer that focus move
 * correctly: put focus back on the control, which is where a listbox's focus
 * belongs, and stay open. `pointerdown` is the earliest event the browser
 * dispatches for a press and lands before the focus change, so this is decided
 * from `pointerdown` rather than from `mousedown`, which the components may have
 * already cancelled for a pick.
 */

// A press is assumed to be over once the pointer comes up. This ceiling is the
// backstop for a press whose `pointerup` the browser never delivers — a native
// scrollbar drag runs in a mode the page does not always see the end of — since a
// widget that believed in a press forever would never dismiss again. Reaching it
// costs only the focus nudge; the list is closed by the next real exit instead.
const PRESS_CEILING_MS = 2000;

/**
 * Track presses inside `panel`. `pressing()` is true from the moment a press
 * begins inside the panel until the pointer comes up; `release()` stops the
 * tracking. Register one per panel and release it with the panel's listeners.
 */
export function trackPanelPresses(panel) {
	let released = false;
	let pressedUntil = 0;

	const endPress = () => { pressedUntil = 0; };
	const beginPress = () => {
		if (released) return;
		pressedUntil = Date.now() + PRESS_CEILING_MS;
		window.addEventListener("pointerup", endPress, { once: true });
		window.addEventListener("pointercancel", endPress, { once: true });
	};

	panel.addEventListener("pointerdown", beginPress);
	return {
		pressing: () => !released && Date.now() < pressedUntil,
		release() {
			released = true;
			panel.removeEventListener("pointerdown", beginPress);
			endPress();
		},
	};
}
