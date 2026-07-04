# Phokus UI Lab

Phokus UI Lab is a browser-only development mode for visual work on the real
Phokus frontend. It runs the same `App.tsx`, Zustand store, components, and CSS
as the Tauri app, but installs Tauri JavaScript mocks before the app imports.

This gives UI agents and contributors a stable browser target without launching
the Rust backend or a Tauri window.

## Run It

```bash
pnpm dev:ui
```

Then open:

```text
http://127.0.0.1:1422
```

The script runs Vite in the custom `ui` mode:

```bash
vite --mode ui --host 127.0.0.1 --port 1422 --strictPort --open
```

The normal app development commands are unchanged:

```bash
pnpm dev:app   # Tauri app + Rust backend
pnpm dev:vite  # frontend dev server for Tauri dev
```

## Scenarios

UI Lab reads `?scenario=` from the URL. If no scenario is provided, it uses
`rich`.

| URL | Purpose |
| --- | --- |
| `/?scenario=rich` | Default realistic library with folders, albums, ratings, favorites, tags, images, and videos |
| `/?scenario=empty` | First-run state with no folders or media |
| `/?scenario=busy` | Background workers with pending thumbnail, metadata, embedding, caption, and tagging jobs |
| `/?scenario=duplicates` | Duplicate Finder opened with duplicate groups already available |
| `/?scenario=album` | Gallery opened directly into an album |
| `/?scenario=errors` | Broken thumbnails, folder scan errors, failed embeddings, failed tagging, and metadata issues |
| `/?scenario=huge` | Large mock library for virtualization and layout checks |

Examples:

```text
http://127.0.0.1:1422/?scenario=duplicates
http://127.0.0.1:1422/?scenario=errors
http://127.0.0.1:1422/?scenario=huge
```

## Changelog Previews

The What's New modal adapts its layout to release size (compact single column
for small releases, a two-pane section rail for large ones). UI Lab reads
`?changelog=` to override which entry the modal shows:

| URL | Purpose |
| --- | --- |
| `/?changelog=unreleased` | The in-progress `[Unreleased]` notes — large release, rail layout |
| `/?changelog=small` | Synthetic hotfix-sized entry — compact single-column layout |
| `/?changelog=0.1.1` | Any specific released version |

Open the modal via the demo panel: `Ctrl+Shift+D` → Open "What's new" modal.

## How It Works

`src/main.tsx` bootstraps the app asynchronously. In `ui` mode it imports
`src/dev/setupMockTauri.ts` first, then imports the real `App`.

That order matters because static imports are hoisted. The Tauri mocks must be
installed before `App`, the store, the title bar, or visual components import
Tauri APIs.

The mock setup installs:

- `mockWindows("main")` for window APIs used by the title bar
- `mockConvertFileSrc("windows")` as a baseline Tauri file URL mock
- `mockIPC(..., { shouldMockEvents: true })` for `invoke`, `listen`, and `emit`

The in-memory backend lives in:

```text
src/dev/mockBackend.ts
src/dev/mockFixtures.ts
src/dev/mockScenarios.ts
src/dev/applyMockScenario.ts
```

Happy-path fixture media is generated from existing onboarding images and
website screenshots into:

```text
public/dev-media/fixture-*.webp
```

The pack is deliberately small and deterministic, but varied enough for browser
screenshots: square, portrait, landscape, monochrome, tinted, framed, and
interface-like crops. Synthetic or deliberately broken fixture paths can still
use the `mock://` scheme described below.

## Mock Media

Visual components should use `mediaSrc(...)` instead of calling
`convertFileSrc(...)` directly:

```ts
import { mediaSrc } from "../lib/mediaSrc";

const src = mediaSrc(image.thumbnail_path);
```

In normal Tauri modes, `mediaSrc` delegates to `convertFileSrc`. In UI Lab,
root-relative asset URLs such as `/dev-media/fixture-01.webp` are returned
as-is. Paths beginning with `mock://` are also served from `public/dev-media`:

```text
mock://thumb-1.svg -> /dev-media/thumb-1.svg
```

Use `mediaSrc` when adding components that render thumbnails, album covers,
preview images, or video posters.

## Adding A Mock Command

If the browser console logs an unmocked command, add it to
`src/dev/mockBackend.ts`.

Prefer returning realistic data for commands that affect visible UI. For actions
that would touch the machine, return a safe no-op:

```ts
case "open_app_data_folder":
  return null;
```

When adding fixture data, keep it shaped like the real store/Rust contracts.
Most frontend-facing types are exported from `src/store.ts`, so the mocks can
stay type-checked against the real UI.

## Adding A Scenario

1. Add the scenario name to `MockScenario` and `SCENARIOS` in
   `src/dev/mockScenarios.ts`.
2. Adjust fixture creation in `src/dev/mockFixtures.ts`.
3. If the scenario should open a specific view, add that behavior in
   `src/dev/applyMockScenario.ts`.
4. Visit `http://127.0.0.1:1422/?scenario=your-scenario` and check for console
   errors.

## What UI Lab Is For

UI Lab is intended for:

- visual iteration on the real app shell
- layout and responsive checks
- state-heavy views like Explore, Timeline, Duplicates, albums, and Settings
- AI-agent screenshot/browser inspection
- safe UI work without filesystem or Rust-side effects

It is not a replacement for Tauri app testing. Validate native behavior with
`pnpm dev:app` when touching:

- file or folder pickers
- filesystem permissions
- real thumbnail/video loading
- window drag, minimize, maximize, or close behavior
- Rust backend performance
- updater installation
- WebView2-specific behavior

## Verification

Useful checks after changing UI Lab:

```bash
pnpm exec tsc --noEmit
pnpm build:vite
pnpm dev:ui
```

Then smoke-test at least:

```text
http://127.0.0.1:1422/?scenario=rich
http://127.0.0.1:1422/?scenario=empty
http://127.0.0.1:1422/?scenario=duplicates
http://127.0.0.1:1422/?scenario=errors
http://127.0.0.1:1422/?scenario=huge
```
