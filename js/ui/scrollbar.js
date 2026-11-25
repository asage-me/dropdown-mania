/**
 * The one press a dropdown must not cancel.
 *
 * Both dropdown components cancel `mousedown` inside an open list, because
 * nothing in that list takes focus: left alone, the press moves focus to the
 * nearest focusable ancestor on the page, which the dismissal each component
 * watches reads as the visitor leaving — and the list then vanishes before the
 * click can commit. See the headers of `ui/select.js` and `ui/menu.js`.
 *
 * Cancelling that press is also, though, the only thing that stops a scrollbar
 * thumb from being dragged, and the menus here do scroll: The Long Menu in Lazy
 * Drop is five hundred rows deep inside a box capped at 290px. So a press that
 * lands on the panel's own scrollbar is left alone, and the wheel, the arrow
 * keys and type-ahead stay available to anyone who does not want the thumb.
 *
 * Chromium and Edge report `offsetX`/`offsetY` past the panel's client box for a
 * press on the scrollbar the panel owns, since a scrollbar sits inside the
 * padding box and outside `clientWidth`/`clientHeight`. Two details keep the
 * guard from catching anything else:
 *
 *   - `event.target === panel` first. `offsetX` is measured from the *target's*
 *     padding box, and a long `white-space: nowrap` option can be wider than the
 *     panel, so a press on the far right of one would otherwise look like a
 *     scrollbar and lose its cancelled focus move — the pick, not the scroll.
 *   - each bar is judged against the overflow that bar belongs to. A panel that
 *     scrolls one way has no bar the other way, and the strip beyond the other
 *     axis is only the panel's own padding.
 *
 * A browser that reports in-box coordinates for a scrollbar press simply gets
 * the guard's absence: that press is cancelled like any other.
 */

/** True when this mousedown landed on `panel`'s own scrollbar. */
export function isScrollbarPress(event, panel) {
	if (event.target !== panel) return false;
	const onVerticalBar = event.offsetX > panel.clientWidth && panel.scrollHeight > panel.clientHeight;
	const onHorizontalBar = event.offsetY > panel.clientHeight && panel.scrollWidth > panel.clientWidth;
	return onVerticalBar || onHorizontalBar;
}
