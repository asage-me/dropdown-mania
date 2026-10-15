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
const WANDER = 0.35; // radians per second of heading drift
const SWERVE = 0.5; // chance per second of a hard, sudden turn
const WOBBLE = 4; // degrees of tilt, so a row never sits level
const MAX_FRAME = 50; // ms — a backgrounded tab must not teleport anything
const EDGE = 14; // px kept off every edge, so the tilt never clips a row

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * The band a row is allowed to occupy, measured fresh each frame.
 *
 * The top is the lower edge of the sticky header rather than the viewport: the
 * header paints above these rows, so a menu that drifts behind it disappears
 * for no reason. The bottom is the viewport itself — an open listbox keeps
 * itself on screen (ArchiveSelect flips it above its trigger when there is no
 * room below), so a row near the floor is not a row you cannot read.
 */
function bounds() {
	const header = document.querySelector(".site-header");
	const top = (header ? header.getBoundingClientRect().bottom : 0) + EDGE;
	return {
		top,
		bottom: Math.max(top, window.innerHeight - EDGE),
		left: EDGE,
		right: Math.max(EDGE, window.innerWidth - EDGE),
	};
}

export function createFloaters({ elements }) {
	const list = () => (typeof elements === "function" ? elements() : elements);

	let bodies = [];
	let frame = 0;
	let last = 0;

	function spawn(el, box) {
		// Measured here as well as each frame so the first placement is already
		// on screen — a row that spawns half off the right edge and snaps back a
		// frame later reads as a glitch.
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		return {
			el,
			w,
			h,
			x: rand(box.left, Math.max(box.left, box.right - w)),
			y: rand(box.top, Math.max(box.top, box.bottom - h)),
			heading: rand(0, Math.PI * 2),
			speed: rand(SPEED[0], SPEED[1]),
			drift: rand(-WANDER, WANDER),
			phase: rand(0, Math.PI * 2),
		};
	}

	/**
	 * A solved row parks itself. There is nothing left to catch there, and a row
	 * you have already committed to should stop competing for the cursor. An
	 * open listbox deliberately does *not* freeze anything: the whole point of
	 * the mode is that the menu keeps moving while you aim, and the listbox
	 * travels with its row and stays on screen.
	 */
	function held(body) {
		return body.el.classList.contains("is-solved");
	}

	function advance(body, dt, clock, box) {
		if (held(body)) return;

		// A gentle constant drift plus occasional hard swerves. Drift alone at any
		// useful rate curves a row into an orbit it never leaves, so the menus
		// would wander in one corner of the screen and read as stuck; straight
		// runs interrupted by jinks are what actually carry a row across the whole
		// band and bounce it off all four walls.
		body.heading += body.drift * dt * rand(0.4, 1.6);
		if (Math.random() < SWERVE * dt) body.heading += rand(-1.2, 1.2);
		body.x += Math.cos(body.heading) * body.speed * dt;
		body.y += Math.sin(body.heading) * body.speed * dt;

		const maxX = Math.max(box.left, box.right - body.w);
		const maxY = Math.max(box.top, box.bottom - body.h);
		if (body.x <= box.left || body.x >= maxX) {
			body.x = Math.min(Math.max(body.x, box.left), maxX);
			body.heading = Math.PI - body.heading;
		}
		if (body.y <= box.top || body.y >= maxY) {
			body.y = Math.min(Math.max(body.y, box.top), maxY);
			body.heading = -body.heading;
		}

		const tilt = Math.sin(clock * 1.7 + body.phase) * WOBBLE;
		body.el.style.transform =
			`translate3d(${body.x.toFixed(1)}px, ${body.y.toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
	}

	function tick(now) {
		const dt = Math.min(now - last, MAX_FRAME) / 1000;
		last = now;
		// Reads first, then motion: measuring between two transform writes would
		// force a layout for every element instead of once for all of them.
		const box = bounds();
		bodies.forEach((body) => {
			body.w = body.el.offsetWidth;
			body.h = body.el.offsetHeight;
		});
		bodies.forEach((body) => advance(body, dt, now / 1000, box));
		frame = requestAnimationFrame(tick);
	}

	function onResize() {
		const box = bounds();
		bodies.forEach((body) => {
			body.x = Math.min(Math.max(body.x, box.left), Math.max(box.left, box.right - body.offsetWidth));
			body.y = Math.min(Math.max(body.y, box.top), Math.max(box.top, box.bottom - body.offsetHeight));
		});
	}

	function start() {
		if (frame) return;
		const box = bounds();
		bodies = list().map((el) => spawn(el, box));
		bodies.forEach((body) => advance(body, 0, performance.now() / 1000, box));
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
