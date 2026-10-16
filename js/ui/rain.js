/**
 * Matrix rain on a canvas.
 *
 * A grid of glyph columns falling at slightly different rates, each frame drawn
 * as a translucent wash over the last so every column leaves a tail. Deliberately
 * slow and deliberately dim: it is scenery behind text that still has to be read.
 *
 * The caller owns start() and stop(). An animation left running behind a hidden
 * exhibit burns battery for nothing, so the games shell reports show and hide.
 */

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789<>[]{}/\\|=+*#$%&";
const FONT_SIZE = 14;
const FRAME_MS = 70;

export function createRain(canvas) {
	let ctx = null;
	let columns = [];
	let timer = 0;

	function layout() {
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (width < 1 || height < 1) return false;

		// Cap the backing store at 2x: past that the extra pixels cost real time
		// and nobody can see the difference in a glyph this small.
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);

		ctx = canvas.getContext("2d");
		if (!ctx) return false;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.font = `${FONT_SIZE}px ui-monospace, monospace`;
		ctx.textBaseline = "top";

		// Negative starts stagger the columns so the first second is not a flat line.
		columns = Array.from({ length: Math.ceil(width / FONT_SIZE) }, () => -Math.random() * 40);
		ctx.fillStyle = "rgba(0, 0, 0, 1)";
		ctx.fillRect(0, 0, width, height);
		return true;
	}

	function tick() {
		if (!ctx) return;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;

		ctx.fillStyle = "rgba(6, 12, 9, 0.14)";
		ctx.fillRect(0, 0, width, height);

		for (let i = 0; i < columns.length; i += 1) {
			const y = columns[i] * FONT_SIZE;
			// Leading glyph bright, the rest of the column left to the fade — that
			// is what makes it read as a trail rather than a static texture.
			ctx.fillStyle = "rgba(160, 255, 190, 0.85)";
			ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], i * FONT_SIZE, y);
			if (y > height && Math.random() > 0.975) columns[i] = 0;
			columns[i] += 1;
		}
	}

	function onResize() {
		layout();
	}

	return {
		start() {
			if (timer || !layout()) return;
			timer = setInterval(tick, FRAME_MS);
			window.addEventListener("resize", onResize);
		},
		stop() {
			clearInterval(timer);
			timer = 0;
			window.removeEventListener("resize", onResize);
			ctx = null;
		},
		get running() {
			return timer !== 0;
		},
	};
}
