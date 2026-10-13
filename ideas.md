# Ideas — The Dropdown Archive

## Original brief, and where it landed

- **Goal: world's #1 dropdown site.** Still the goal. Shipped as an archive rather than a
  gallery: everything here is a specimen with a label, not a demo with a caption.
- **Dropdown at the top of the page selects the mode.** Shipped — the header holds a real
  dropdown (Wing I/II/III) that drives the router, plus a command palette (`Ctrl+K`) for
  jumping straight to an exhibit.
- **Education: show how EVERY dropdown works.** Shipped as 11 exhibits (DD-001…DD-011):
  native, custom listbox, anatomy, mega, multi-select, searchable combobox, grouped,
  keyboard-only, accessible naming, anti-patterns, and a decision table.
- **Education: best practices.** Shipped — every exhibit ends with a *Practice* note, and
  DD-010 shows the failures with the reason they fail.
- **Create a never-before-seen dropdown.** Partially shipped: the "unfold" motion (panels
  unfold from the trigger with a per-item stagger, origin derived from the trigger) is the
  signature, and the home hero drawer is a dropdown that navigates. The specimen bench below is
  the honest version of this idea.
- **Find the Path, hidden path.** Shipped (DD-012): five dropdowns, one sequence, yes/no only.
- **Advanced mode where the dropdowns move.** Shipped — *Advanced — menus move*: each control
  drifts on its own path, and the run is timed separately (AC-02).
- **Hacker: hide things for inspector / view-source / console.** Shipped (DD-013): four clues,
  one in an HTML comment, one in a `data-*` attribute, one in a stylesheet custom property, one
  in a `console.log`. The terminal only accepts the real string.
- **Lazy Drop: an idle dropdown game.** Shipped (DD-014) — the answer to "not sure what this
  even means" is: points are earned per *selection*, tiers raise the value of a selection,
  upgrades change what a selection costs, and the ledger records what you banked.
- **1999 obnoxious mode.** Shipped as Wing III (DD-015/016/017): marquee, blink, magenta,
  bevels, a hit counter that really counts, and a guestbook that keeps what you write.

---

## On the bench

Roughly ordered by value per hour. Each is self-contained — none of them requires changing
what exists.

### 1. Wing IV — the Specimen Bench
A sandbox where you tick the properties of a dropdown (native or custom, grouped, searchable,
multi, async, virtualised, disabled options) and it renders a live specimen *plus* the ARIA
markup it generated and a lint score against the rules from Wing I. This is the "never before
seen" piece: a dropdown that builds dropdowns, and the natural fourth wing because it turns the
catalogue into a tool.

### 2. Async combobox (DD-019) and virtualised list (DD-018)
Two exhibits the catalogue is genuinely missing: a debounced fetch with request cancellation
(show the stale-while-revalidate states and the race you get without `AbortController`), and a
10,000-option select with windowing. Both teach something the current eleven do not, and both
are the questions people actually ask in review.

### 3. Find the Path: seeded runs and a local leaderboard
Seeded layouts mean a run is reproducible and shareable (`#/games/find-path?seed=7`), which
makes the timer mean something. Store the top five per difficulty in `dropdown-archive:find-path`
and offer a ghost of your best run — the drifting menus are much funnier with a ghost racing you.

### 4. Lazy Drop: deaccession (prestige) and offline progress
Reset your points for a permanent multiplier on each selection, and credit elapsed idle value on
load (the store already keeps a timestamp). Prestige is the single cheapest thing that makes an
idle game worth returning to.

### 5. Curator card
Render your records as a downloadable SVG/PNG "reading room card" — accession numbers, wing
counts, best times. It is the only shareable artefact the site currently lacks, and it makes the
record book feel like something you own.

### 6. A third theme: *Lampshade*
`prefers-contrast: more` plus a manual switch — pure black on bone, no motion, no texture. Cheap
to add on top of `tokens.css`, and it is the accessibility win with the least new code.

### 7. What the screen reader said
DD-008 already logs keypresses. Extend it to show the announcement a screen reader would make at
each step (`combobox, collapsed, 3 of 5, Cotton rag board`), generated from the live ARIA state
rather than hardcoded. It turns "this is accessible" into a demonstration.

### 8. Smoke tests without a build step
`node --test` over the pure modules (`store.js`, `catalogue.js` parsing, the router's route
parsing) plus one Playwright script that walks all four routes and asserts zero console errors.
No bundler, no config beyond a `package.json` with `"type": "module"`.

### 9. Installable and offline
A `manifest.webmanifest` and a ~20-line service worker (cache the shell and the seven
stylesheets, network-first for the wing fragments). The site is already dependency-free, so
offline works unusually well here.

### 10. Print stylesheet for the catalogue
An archive should print. `#/education?print=1` → single column, no demos, accession numbers as
visible labels, page breaks between exhibits.

### 11. Cross-wing streak
One record for operating a dropdown in all three wings on the same day, and a small "consecutive
days in the reading room" counter in the footer. Low effort, and it is the only mechanic that
pulls a visitor back.

---

## Deliberately not doing

- **A framework.** The whole point is that the markup is the source of truth and there is nothing
  to compile. A build step would make the hacker wing's "view source" clue hunt worse, not better.
- **Dropdown hover menus.** They are in DD-010 as an anti-pattern; the site should not ship one.
- **More games before the bench.** Three games is enough to prove the wing; the catalogue is what
  a visitor came for.
