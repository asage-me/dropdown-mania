/**
 * Float — detaches elements from the page and lets them wander the viewport.
 *
 * Find the Path's advanced mode wants its menus to be genuinely hard to aim at.
 * A CSS keyframe could only nudge a row a few pixels along one fixed line, so
 * this owns the motion instead: each element picks a heading and a speed, the
 * heading wanders so no two paths repeat, and the viewport edges bounce. The
 * caller only says which elements float and when to start or stop.
 *
 * The caller's CSS has to take the elements out of flow (position: fixed at
 * 0,0) because this writes a transform from the top-left corner.
 */

const SPEED = [55, 130]; // px per second, picked per element
const WANDER = 0.9; // radians per second of heading drift
const WOBBLE = 4; // degrees of tilt, so a row never sits level
const MAX_FRAME = 50; // ms — a backgrounded tab must not teleport anything
const EDGE = 14; // px kept off every edge, so the tilt never clips a row

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * Space kept below a row so an open listbox stays on screen. Vertical only: a
 * listbox is anchored to the trigger inside the row, so it is never wider than
 * the row it hangs from and needs no horizontal room. It is also capped by the
 * viewport, since a phone cannot spare a fixed 300px and would otherwise pin
 * every row to the top of the screen.
 */
const menuRoom = () => Math.min(300, window.innerHeight * 0.4);

const spanX = (w) => Math.max(0, window.innerWidth - w - EDGE * 2);
const spanY = (h) => Math.max(0, window.innerHeight - h - menuRoom() - EDGE * 2);

export function createFloaters({ elements }) {
	const list = () => (typeof elements === "function" ? elements() : elements);

	let bodies = [];
	let frame = 0;
	let last = 0;

	function spawn(el) {
		// Measured here as well as each frame so the first placement is already
		// on screen — a row that spawns half off the right edge and snaps back a
		// frame later reads as a glitch.
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		return {
			el,
			w,
			h,
			x: rand(EDGE, EDGE + spanX(w)),
			y: rand(EDGE, EDGE + spanY(h)),
			heading: rand(0, Math.PI * 2),
			speed: rand(SPEED[0], SPEED[1]),
			drift: rand(-WANDER, WANDER),
			phase: rand(0, Math.PI * 2),
		};
	}

	/**
	 * A row holding an open listbox, or one already solved, sits still. Chasing
	 * a cursor out of a list you are reading is difficulty with no point, and an
	 * option list that slides sideways under a keyboard user is worse than
	 * merely hard. Deliberately not "while focused": closing a menu returns
	 * focus to its trigger, so a focus rule would leave every row you have ever
	 * touched parked for the rest of the run.
	 */
	function held(body) {
		return body.el.classList.contains("is-solved") || Boolean(body.el.querySelector('[aria-expanded="true"]'));
	}

	function advance(body, dt, clock) {
		if (held(body)) return;

		body.heading += body.drift * dt * rand(0.4, 1.6);
		body.x += Math.cos(body.heading) * body.speed * dt;
		body.y += Math.sin(body.heading) * body.speed * dt;

		const maxX = EDGE + spanX(body.w);
		const maxY = EDGE + spanY(body.h);
		if (body.x <= EDGE || body.x >= maxX) {
			body.x = Math.min(Math.max(body.x, EDGE), maxX);
			body.heading = Math.PI - body.heading;
		}
		if (body.y <= EDGE || body.y >= maxY) {
			body.y = Math.min(Math.max(body.y, EDGE), maxY);
			body.heading = -body.heading;
		}

		const tilt = Math.sin(clock * 1.7 + body.phase) * WOBBLE;
		body.el.style.transform =
			`translate3d(${body.x.toFixed(1)}px, ${body.y.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
	}

	function tick(now) {
		const dt = Math.min(now - last, MAX_FRAME) / 1000;
		last = now;
		// Sizes first, then motion: reading offsetWidth between two transform
		// writes would force a layout for every element instead of once.
		bodies.forEach((body) => {
			body.w = body.el.offsetWidth;
			body.h = body.el.offsetHeight;
		});
		bodies.forEach((body) => advance(body, dt, now / 1000));
		frame = requestAnimationFrame(tick);
	}

	function onResize() {
		bodies.forEach((body) => {
			body.x = Math.min(Math.max(body.x, EDGE), EDGE + spanX(body.offsetWidth));
			body.y = Math.min(Math.max(body.y, EDGE), EDGE + spanY(body.offsetHeight));
		});
	}

	function start() {
		if (frame) return;
		bodies = list().map(spawn);
		bodies.forEach((body) => advance(body, 0, performance.now() / 1000));
		window.addEventListener("resize", onResize);
		last = performance.now();
		frame = requestAnimationFrame(tick);
	}

	function stop() {
		if (!frame) return;
		cancelAnimationFrame(frame);
		frame = 0;
		window.removeEventListener("resize", onResize);
		bodies.forEach((body) => { body.el.style.transform = ""; });
		bodies = [];
	}

	return { start, stop, isRunning: () => Boolean(frame) };
}
