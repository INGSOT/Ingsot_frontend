# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project type

Static multi-page marketing site for INGSOT (Ukrainian-language digital agency). No package.json, no bundler, no test suite — plain HTML/CSS/JS served as files. Content and code comments are in Ukrainian; preserve the language when editing.

## Running locally

Pages **must be served over HTTP** — opening an `.html` file via `file://` breaks `loadComponent` because it uses `fetch('./components/...')`. The repo lives under `~/Herd/...`, which is the Laravel Herd document root, so the site is reachable at `http://ingsot-frontend.test/` (or whatever Herd resolves this directory to). Any equivalent static server works (`python3 -m http.server`, `npx serve`, etc.).

There is no build step for JS. The single asset you may need to rebuild is the stylesheet:

```sh
# Compile SCSS → CSS (sourcemap is committed alongside)
sass css/style.scss css/style.css
# Or watch
sass --watch css/style.scss css/style.css
```

Pick whichever `sass` CLI is installed locally (Dart Sass works).

## Architecture

### Page model
Every URL is a top-level `.html` file (`index.html`, `01.solutions.html`, `02.4.1.1.services_marketing_pack.html`, …). The numeric prefix encodes the site's IA — `NN.section`, `NN.M.subsection`, `NN.M.K.leaf` — and the page hierarchy lives in the filenames, not in any router. New pages copy this numbering.

### Shared chunks via runtime fetch
Header, footer, modals, and other repeated UI live in `components/*.html` and are injected at runtime by `js/loadComponent.js`:

```js
loadComponent('header', '#header_placeholder');
loadComponent('footer', '#footer_placeholder');
```

Every page declares empty `<div id="*_placeholder"></div>` slots in the body and calls `loadComponent` for each one near the bottom (after jQuery loads). Modals use the same mechanism — `onclick="loadComponent('submit_request', '#modal'); openModal();"` injects the modal HTML into the persistent `<div id="modal">` and shows it. When editing a shared component, change `components/<name>.html`; do **not** duplicate the markup back into each page.

### Modal lifecycle (`js/script.js`)
- `#modal` is a single persistent container in every page.
- `openModal()` adds `.on`; `closeModal()` empties `innerHTML` and removes `.on`.
- Click-outside and click on `.modal_content .x12` are handled by delegation on `#modal`.
- This means modal HTML is **disposable** — re-injected fresh each open. Don't store state inside modal markup.

### Animated WebGL backgrounds
`js/gradient-bg.js` defines `class GradientBg` — a WebGL fragment-shader gradient using 4 Gaussian "blobs" that ping-pong between configured positions. All math runs on the GPU.

`js/gradient-presets.js` exports a global `GRADIENT_PRESETS` map (`blue`, `dark_blue`, `warm`, `dark_warm`, `purple`, `dark_purple`, `green`, `dark_green`). Each preset defines `bg`, `duration`, and 4 `blobs` with HSL color + start/end positions + radius. The `dark_*` variants share the same hue/positions as their base but with reduced lightness — when adding a new preset, follow this paired-light/dark convention.

Pages instantiate one `GradientBg` per `<canvas>`:

```js
const bgs = [
  new GradientBg('#main_banner_anim', GRADIENT_PRESETS.dark_blue),
  new GradientBg('#projects_slider_anim', GRADIENT_PRESETS.dark_warm),
  // ...
];
window.addEventListener('pagehide', () => bgs.forEach(bg => bg.destroy()));
```

Always call `destroy()` on `pagehide` (existing pages already do this) — leaking GL contexts will eventually break the page.

### Styling
- One source file: `css/style.scss` (~3700 lines, all selectors). It compiles to `css/style.css` + `style.css.map`, both committed.
- Brand colors are SCSS variables near the top: `$black`, `$blue`, `$green`, `$orange`, `$purple`, `$grey`.
- Font is `WixMadeforDisplay` (Regular / Medium / Bold / ExtraBold) served from `resources/fonts/`.
- Typography helpers `@mixin p2`, `@mixin p3` for small text sizes.
- Breakpoint convention used by JS code is `<= 1024` (tablet) and `<= 700` (mobile) — match these when adding responsive behavior.

### Vendored libraries (no npm)
`js/` ships the full source of jQuery 3.7.1, Slick carousel, and Flatpickr (with `uk` and `ru` locales). Load order on every page is: jQuery → Slick → Flatpickr → `loadComponent.js` → `gradient-bg.js` → `gradient-presets.js` → per-page init → `script.js` (deferred). Keep this order — `script.js` and per-page init both depend on jQuery + Slick being ready.

### Common JS patterns in `script.js`
- `flatpickr("#calendar", ...)` is wired through a `MutationObserver` because the calendar markup arrives via `loadComponent` after DOM ready.
- `.select` custom dropdowns, `#help_ways` accordion, and `#projects_slider` Slick init all live here — when adding similar widgets, follow the existing event-delegation + jQuery pattern rather than introducing a new framework.
- `.animate_on_scroll` is observed via `IntersectionObserver` (threshold 0.7) in inline scripts on each page; the class is removed once visible.
