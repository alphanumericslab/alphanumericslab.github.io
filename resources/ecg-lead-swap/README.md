# Detect & Correct — ECG Lead-Swap Poster Demo

Static, self-contained prototype of the **"Detect and Correct"** QR-code flow
for the ECG limb-electrode-swap poster. Loads once and runs entirely in the
browser (phone / tablet / laptop) with no server round-trips, so it works from
cache on unreliable conference Wi-Fi.

Case data in `data/cases.json` is exported by
`ecg-lead-swapping/codes/website_export/export_cases.py` (real model outputs on
de-identified PTB-XL records). The current records are uncurated placeholders;
regenerate with `export_cases.py --ecg-ids ...` to swap in curated ones. The
UI/rendering code stays as-is.

## Run locally

```bash
# from this directory
python3 -m http.server 8000
# open http://localhost:8000/
```

A plain static server is required — opening `index.html` via `file://` breaks
the service worker and the `fetch()` of `data/cases.json`.

If you are running the parent Jekyll site locally (`bundle exec jekyll serve`),
the demo is served at `http://localhost:4000/<baseurl>/alphanumericslab-leadswap-cinc-demo/`.

## The three examples

1. **Obvious swap** — synthetic RA↔LA swap. Guess swap/no-swap → swap-type quiz
   → result with binary + multiclass readout, and a free-drag body diagram that
   remixes the ECG live from the raw electrode potentials for whatever wiring
   you land on.
2. **Clean recording** — no swap. Correct "no swap" guess ends immediately; a
   wrong "swap" guess still runs the quiz, then shows the (incorrect) result.
3. **Real, model-flagged** — an unreviewed recording with no ground truth.
   Graded against the model's own flagged hypothesis.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Shell; loads scripts, registers service worker |
| `css/styles.css` | Mobile-first styling, ECG aesthetic, light/dark |
| `js/ecg.js` | Canvas ECG plot, morph animation, electrode→lead mixing (Einthoven/Goldberger) |
| `js/bodyDiagram.js` | Draggable SVG limb-electrode diagram |
| `js/cases.js` | Loads `data/cases.json` and exposes `CaseData` |
| `js/app.js` | Flow controller / state machine, hash routing |
| `data/cases.json` | Precomputed cases: model outputs + waveforms + electrode potentials |
| `assets/poster/*.jpg` | Poster figures shown on the home screen |
| `sw.js` | Minimal offline cache (cache-first). Bump `CACHE` on any asset change |

## Deploying inside a Jekyll / GitHub Pages site

This folder is designed to be dropped, as-is, into a repo that GitHub Pages
builds with Jekyll. Link to it from the parent site as
`/alphanumericslab-leadswap-cinc-demo/` (or `.../index.html`).

How it stays compatible:

- **No YAML front matter anywhere.** Jekyll copies files without front matter
  through verbatim as static files, so nothing here is run through Liquid or
  wrapped in a site layout. Do not add `---` front matter to `index.html`
  unless you specifically want Liquid processing.
- **All paths are relative** (`./css/...`, `./js/...`, `./data/...`,
  `./assets/...`), so the demo works under any `baseurl` and any subfolder
  name with no configuration.
- **No files or folders starting with `_`, `.`, `#`, or `~`** — Jekyll silently
  drops those from the build. Keep it that way when adding assets.
- **Hash-based routing** (`#/case/:id`) means refreshing a case page never
  produces a 404, and the parent site's `404.html` is never involved.
- **Service worker scope is this folder only.** `sw.js` is registered from
  `index.html` with a relative path, so its scope is
  `/<repo>/alphanumericslab-leadswap-cinc-demo/` and it never intercepts
  requests for the rest of the site.
- **No build step, no plugins, no `_config.yml` changes needed.** The folder
  contains no workflow of its own; the parent repo's Pages build handles
  deployment.

If the parent `_config.yml` has an `exclude:` list, make sure it does not match
this folder or its `data/` and `assets/` subfolders.

After changing any file in `css/`, `js/`, `data/`, or `index.html`, bump the
`CACHE` string in `sw.js`, otherwise returning visitors keep the old cached
version.
