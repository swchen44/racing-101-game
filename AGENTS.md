# Repository Guidelines

## Project Structure & Module Organization

This is a static Three.js racing game using browser ES modules. `index.html` contains menus, HUD markup, CSS, and the Three.js import map. `js/main.js` coordinates rendering and race lifecycle; `js/config.js` defines tracks, vehicles, modes, and leaderboard settings. Other `js/` modules own physics, AI, audio, controls, and effects. `js/cars/` contains procedural car builders and shared helpers. `assets/` holds track thumbnails and PWA icons; `docs/` contains guides and screenshots. `sw.js` and `manifest.webmanifest` provide PWA support.

## Build, Test, and Development Commands

There is no package manifest, compilation step, or npm script suite. Run commands from the repository root:

- `python3 -m http.server 8080`: serve locally; open `http://localhost:8080` in a WebGL2 browser. ES modules require HTTP.
- `zip -r midnight-circuit-itch.zip index.html manifest.webmanifest sw.js js assets -x "*.DS_Store"`: package the playable files for itch.io. See `docs/ITCH-PUBLISH.md` for publishing instructions.
- `git diff --check`: check patch whitespace before submitting.

Initial loading requires network access for CDN dependencies.

## Coding Style & Naming Conventions

Follow existing JavaScript: two-space indentation, semicolons, single-quoted strings, and explicit `.js` extensions for relative imports. Use camelCase for functions and variables, PascalCase for classes, and UPPER_SNAKE_CASE for shared constants. Keep module filenames lowercase. No formatter or linter is configured.

Keep tuning in `js/config.js`; register car builders in `js/cars/index.js` with the `build(def) → { mesh, parts }` contract. Update both languages in `js/i18n.js` for UI strings. Release replaced scene resources through `disposeObject()` and preserve shared textures.

## Testing Guidelines

No automated test framework, test naming convention, or coverage threshold is configured. Validate changes in-browser: exercise affected modes, tracks, controls, race completion, and restart; check console errors. Test UI changes on desktop and mobile landscape. Use `window.__game` for race setup and teleport-based checks. For PWA changes, verify online loading followed by offline reload, and update `sw.js` precache entries and cache version as needed.

## Commit & Pull Request Guidelines

History uses concise Chinese and English summaries, sometimes prefixed with a subsystem or `chore:`; no strict Conventional Commits policy is evident. Use focused, descriptive commits. PRs should explain behavior changes, link relevant issues, list browser checks and limitations, and include screenshots for visual changes.

## Configuration

For leaderboard changes, read `SETUP-LEADERBOARD.md`. Frontend configuration uses public anon credentials; keep privileged service-role keys out of client files.
