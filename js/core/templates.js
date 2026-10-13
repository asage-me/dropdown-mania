/**
 * Template loading with a cache and a readable failure.
 */

const cache = new Map();

export async function loadTemplate(url) {
	if (cache.has(url)) return cache.get(url);

	let response;
	try {
		response = await fetch(url, { cache: "no-cache" });
	} catch {
		throw new Error(`Could not fetch ${url}. Open this site over HTTP, not file://.`);
	}
	if (!response.ok) {
		throw new Error(`${url} responded ${response.status} ${response.statusText}`);
	}

	const text = await response.text();
	cache.set(url, text);
	return text;
}
