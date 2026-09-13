# AGENTS.md - Carrick Games Development Guide

This is the repository's development authority. `README.md` is for external readers; `DESIGN.md` is the visual and interaction authority. Keep only these three root project documents; do not add deployment, heartbeat, memory or visual-style documents without explicit approval.

**Release evidence:** this document records contracts and required closure, not proof of a verified deployment. Use exact-SHA CI results and live component descriptors. A documentation-only delegation does not authorize builds, commits, pushes or production mutation.

**Last reconciled with production:** 2026-09-13, games and shell both at revision `809eafa18ec4d0d16b35e99046c15a9e267793bd`. This line is a claim like any other: re-check live `/games/index.json` and `/manifest.json` before trusting it, and update it whenever a statement here is verified or corrected.

## Workspace Ownership

```text
apps/shell/
  package.json          @carrick/shell; independent shell SemVer
  index.html
  src/                  Thin host, remote catalog, release loader, preferences and UI
  public/brand/         Exact original SVG and genuine installation PNGs
  public/app.webmanifest  Browser installation identity, not deployment metadata
  tests/                Shell-owned unit tests
games/<id>/             28 @carrick/game-<id> workspaces
  package.json          Own SemVer and explicit runtime dependencies
  game.json             Pure localized discovery/presentation metadata
  src/index.ts          Public release entry and ABI exports
  src/                  Own mechanics, rendering, helpers and private diagnostics
  public/               Own assets, icon.svg and 640×400 cover.webp
  tests/                Own unit/browser mechanics, UI fixtures and audits
packages/game-sdk/
  src/game.ts           GameHost, BaseGame, lifecycle and shell snapshots
  src/catalog.ts        API-1 data/module contracts and resource validation
  src/render.ts         HiDPI renderer, palettes and coordinate helpers
  src/layout.ts         Shared geometry/layout primitives
  src/fx.ts             Existing canvas effects
  src/storage.ts        Safe shared score persistence
  src/levelselect.ts    Shared level-selection helpers
  tests/                SDK-owned unit tests
packages/weapon-art/     Pure icon/silhouette library: Gacha and CS Kimi
scripts/                Discovery, boundaries, builds, affected selection and CI
tests/                  Generic shell/browser/release contracts
  support/              Reusable fixtures, not game-specific mechanics
  release/              Node release-orchestration regression tests
package-lock.json       The single npm-workspaces lockfile
vite.config.ts          Development catalog and Vitest configuration
playwright.config.ts    Built-preview browser tests
.github/workflows/deploy.yml  One component-oriented deployment DAG
dist/                   Generated local release store; not source
```

Use **Node.js ≥22.18.0** and npm workspaces (`apps/*`, `games/*`, `packages/*`) with one root install/lockfile. Do not add per-game lockfiles or runtime dependencies. The sole existing external runtime exception is `three`, declared only by `cs`, `cs-kimi` and `villa`, for real 3D rendered into the shared canvas contract. Other runtime dependencies require explicit user approval and documentation here.

- No game-to-game imports, including disguised helper reuse. Share genuinely reusable ABI/geometry/art in a declared `packages/*` dependency instead.
- Runtime source imports may not escape their workspace, use absolute source paths or fetch network code. Every bare library import must be declared in that workspace's `dependencies`, including internal libraries and transitive library-to-library edges.
- Targeted validation walks the selected workspace and its **transitively declared libraries**, not unrelated game source or `game.json`. A malformed unrelated game cannot block a targeted game build/typecheck. Root workspace, shared toolchain or external lock changes may deliberately cause conservative fan-out; a broken root install is not independent-game isolation. The root `package.json` is compared by structure: its `devDependencies`, `engines`, `workspaces` and any unrecognized field are runtime inputs for every component, so adding one root devDependency makes all 28 games and the shell runtime-affected and each of them needs a higher SemVer in the same push, or no cell can publish. A `scripts`-only edit is verification, never runtime, because CI installs with `npm ci` and builds with `node scripts/build.mjs`. Prefer a component-local `devDependencies` entry over a root one.
- `packages/weapon-art` is pure/asset-free. Gacha's inventory photos and URL-aware cache remain in `games/gacha`; CS Kimi must not import them. Preserve CS map/audio licensing and provenance under `games/cs/public/`. CS retains the engine port from the carrick-cs standalone app in `games/cs/src/cs*.js`, with `cs.ts` as its `BaseGame` adapter and `csHud.ts` drawing the HUD; CS Kimi's renderer remains game-owned in `games/cs-kimi/src/counterstrikeScene3d.ts`.
- Renderer-private diagnostics, screenshots and mechanics/UI fixtures belong to their game. Generic tests may use the shared public contract and optional JSON-safe `getDiagnostics()` snapshots, never expose a private Three.js scene or import game implementations into the shell/SDK/generic fixtures.
- Keep narrow changes narrow. This UI migration modernizes shell presentation and the shared result panel, not every game's world, palette or gameplay.

## Release Identity and ABI

| Value | Meaning |
|---|---|
| `schemaVersion: 1` | Descriptor/catalog JSON shape; not behavioral compatibility. |
| `apiVersion: 1` / shell `apiVersions: [1]` | Explicit runtime protocol epoch. Require exact supported membership; never `gameApi <= hostVersion`. |
| Package `version` | Independent component SemVer, taken from its `package.json`. SDK SemVer is not the ABI epoch. |
| `revision` | Full 40-character lowercase source commit SHA. |
| Target `generation` | Activation/CAS fence, advanced by promotions, rollbacks and failure recovery. |
| Catalog `generation` | Aggregate catalog activation fence; not an individual game's target fence. |
| `sequence` | Monotonic CI intent order: `github.run_number * 1000 + github.run_attempt`. |
| `handledRevision` | Last successfully auto-promoted source baseline; not necessarily the active revision after rollback, and never a test-verification watermark. |

The permanent discovery endpoint is **`/games/index.json` API 1**. An incompatible future protocol needs an explicit retained catalog/compatibility migration, not an in-place reinterpretation that breaks old shells.

A game release is `/games/<id>/<SemVer>/<40sha>/entry.js` plus its own CSS, chunks, bundled SDK/libraries, assets, icon and `cover.webp` under the same immutable base. Its generated `game.json` descriptor includes identity, runtime API, release-relative entry/styles, complete SHA-256 `files` inventory and localized `meta`. The source `game.json` is metadata only, not the generated release descriptor.

The independently versioned shell is retained at `/shell/<40sha>/...`; `/` serves its current HTML and `/manifest.json` reports current deployment metadata. Shell manifests inventory all files and declare supported runtime APIs. Generated local `dist/` merely assembles a preview store; production promotion is owned by ops, not by copying the whole local store over the server.

No immutable release may depend at runtime on another game's release or a mutable root asset namespace. Resolve game-owned files with the host's **per-instance** `assetUrl(relativePath)` closure, captured when that instance is created. Pass it into asynchronous loaders and cache by immutable URL. Never set a module-global asset base that a later game/version can overwrite. Module top-level evaluation must be side-effect-free with respect to the active game; `create(host)` is the instance boundary.

## Adding or Updating a Game

1. Create `games/<id>/{package.json,game.json,src/index.ts,src/,public/,tests/}`. Use a lowercase hyphenated ID and package name `@carrick/game-<id>`, with `private: true`, `type: "module"`, an independent SemVer and declared dependencies. Update the root lockfile through npm as needed; do not hand-maintain a second registry.
2. Export the release ABI from `src/index.ts`, reading the package version:

   ```typescript
   import { ExampleGame } from './example.js';
   import type { GameHost } from '@carrick/game-sdk/game';
   import packageJson from '../package.json';

   export const id = 'example';
   export const version = packageJson.version;
   export const apiVersion = 1 as const;
   export function create(host: GameHost) { return new ExampleGame(host); }
   // Optional: export the original class for this game's own browser tests.
   export { ExampleGame } from './example.js';
   ```

   The shell validates module ID/version/API against discovery before constructing it. `BaseGame` lives in `@carrick/game-sdk/game`; use `prepare()`, `start()` and `restart()`. Override protected `onStart()` for start-specific behavior, not `start()`. An optional constructor fallback using `createDefaultGameHost()` is for isolated game-owned browser tests, not production asset routing.

   | Game method | Purpose |
   |---|---|
   | `constructor(host)` | Pass the shell host to `BaseGame`. |
   | `init()` | Initialize/reset mechanics before play. |
   | `update(dt)` | Advance simulation; `dt` is seconds. |
   | `draw(ctx)` | Render the current frame. |
   | `handleInput(event)` | Keyboard/mouse/touch gameplay. |
   | `destroy()` | Inherited cleanup, extended when the game owns extra resources. |

3. Supply **pure data** in `game.json`; no loaders, functions, markup or central icon-map references. For example:

   ```json
   {
     "id": "example", "group": "casual", "order": 30,
     "name": "Example", "nameZh": "示例",
     "desc": "One sentence description.", "descZh": "一句话介绍。",
     "canvasSize": { "width": 400, "height": 400 },
     "icon": "icon.svg",
     "cover": { "src": "cover.webp", "width": 640, "height": 400 },
     "controls": {
       "keyboard": [{ "keys": ["←", "→"], "action": "Move", "actionZh": "移动" }],
       "touch": [{ "icon": "tap", "action": "Tap to move", "actionZh": "点击移动" }],
       "sections": [{
         "id": "details", "title": "More controls", "titleZh": "更多操作",
         "notes": [{ "text": "Use the canvas.", "textZh": "在画布中操作。", "audience": "all" }]
       }]
     }
   }
   ```

   `order` controls ordering, not directory or array position. Localize names/descriptions/actions/notes. Use no more than three essential rows for the current device, then titled `controls.sections` with keyboard/touch entries and notes scoped by `audience: all|keyboard|touch`. Keep advanced controls available without a persistent shortcut wall. Known groups are `casual`, `action`, `puzzle`, `tabletop`; unknown valid groups fall back to Other without a shell change. Icon and cover paths are relative to `public/`'s release root, not `/public/...` URLs. Covers are real 640×400 game frames; follow `DESIGN.md`, not generated game illustrations.
4. Put mechanics, UI, renderer audits and browser fixtures in this game's `tests/`. Generic lifecycle/selection/storage/input contracts stay in root `tests/` and reusable support in `tests/support/`; SDK behavior tests stay in `packages/game-sdk/tests/`. Do not add mechanics to a root all-games spec.
5. Use the real targeted checks below. Discovery, loaders and icons are data-driven: **adding a game does not require editing a central game registry, shell loader or icon map**.
6. A runtime-input change—including metadata, covers/assets or a consumed shared runtime library—requires a higher game SemVer than that target's handled source version. Update its workspace/lock record. Shell runtime changes require the shell's own version bump. Docs/tests alone do not need a runtime bump. Retrying an unchanged already-seeded bootstrap artifact reuses its original version/revision; never force-bump just to retry.

## Runtime and Input Rules

- Keep the persistent `#gameApp` and shared canvas. All shell/game DOM overlays and native accessibility targets belong inside that root; never reparent the canvas to simulate fullscreen.
- Direct `#id` selection wins, otherwise use the last **successfully loaded** game, then Gacha/first available. Preserve existing hash compatibility, safe browser storage, scores, language/theme and resize behavior. Do not save a failed selection as the last successful game.
- Refresh `/games/index.json` when the library opens; preserve query, category, scroll and focus. Never automatically swap the running release. Its card's Continue action always returns to that same instance; expose a separate explicit **Update … (restart)** action for a newer catalog version.
- Preflight and validate candidate JavaScript **and CSS** while keeping the old paused instance intact. Tear it down only immediately before `create`/`prepare`/`start`. Stale async discovery, imports, actions and intent completions must not overrule newer selection/dismissal intent.
- Before teardown, load/validation failure may offer Resume of the intact old instance. After teardown, failed create/prepare/start means that old session is gone: offer an honest Restart, not a fictional recovery. Retry, resume-or-restart, choose another game and reload must remain usable. Restart/demo/contextual-action failures also need recoverable error paths rather than dead controls or misleading running state. These in-flight paths require tests before closure.
- Games autoplay after successful preparation; no shell start gate. A game's own arena/mode menu remains allowed. `#gameCanvas[data-game-running]` must reflect live state. Pointer lock and audio still require browser gestures; 3D games capture on the first trusted canvas click.
- Browser fullscreen is browser-owned: no Fullscreen API, app fullscreen button, F alias or F11 interception. Ordinary window, visual-viewport, rotation, height-only and DPR changes remain responsive.
- The shell supplies `GameViewport` width/height, DPR and safe area through `setViewport()`. Fixed boards keep their logical dimensions; only opt-in responsive games call protected `resizeLogicalViewport()` after updating cameras/HUDs. Never reinitialize gameplay during resize. Keep `setDisplayScale()` compatibility, including Gacha.
- Use `this.canvasPoint(clientX, clientY)` for mouse and touch. Never derive logical coordinates from `canvas.width / rect.width`: the backing store is HiDPI. Use `this.isDarkTheme()` and `this.isZhLang()` for game branches.
- `setPresentationPaused()` freezes simulation and SDK-managed delays for shell overlays. Use `gameNow()` for gameplay clocks and managed timeouts for delayed gameplay. Opening releases held keys/fire/touches and pointer capture; game-local `onShellOverlayChange(open)` coordinates manual pause ownership. Closing clears only presentation pause and focuses play, preserving a prior manual pause.
- Only a **trusted dismissal of an overlay for the same still-live instance** may restore its prior pointer capture. Escape, internal/programmatic closes, game switches and stale callbacks never recapture. Overlay-to-overlay navigation never stacks panels.
- Report terminal scores once with `this.submitScoreOnce(this.score)`. Use `submitScore()` only for intentionally multiple submissions. Standard results use `drawResultOverlay()` and `isRestartInput()` (Space/Enter/click/tap). CS's retained interactive terminal HUD uses `publishResult()` rather than a duplicate result panel. Gacha/Villa have no terminal overlay.

## UI and Branding Guardrails

`DESIGN.md` owns exact dimensions, tokens and acceptance checks. The essential constraints are:

- No sidebar, hero, start gate, fullscreen toggle, shell style-mode switch, favorites, recommendations or sort controls. The on-demand library uses real 16:10 covers, full wrapping names and one Play/Continue card target; not the old requirement to fit all 28 games on one screen.
- Exactly three permanent **real 44px-high shell targets**: brand 96×44 at top/left 12px plus safe area for fixed games (right 116px for CS/CS Kimi/Villa), help at right 64px and menu at right 12px. Preserve the exact 22px teal gamepad and full stacked name. All hide during pointer capture; responsive HUDs reserve the 200×44px cluster and 64px content clearance.
- Choose a game leads the menu; contextual actions/restart/demo/level follow. Theme/language keep it open. Help is read-only with ≤3 essentials then disclosures, device-scoped notes and no redundant Return/Controls buttons. Brand/help/menu navigation preserves focus and pause ownership, with `siteBrand` included in help's focus scope/`aria-owns`.
- Gacha keeps progress and Draw plus one native 104×44 Collection target; stats/sound move into the menu. Its top-band/counter accommodation remains game-owned, not a new global header. Villa's HUD utility access is only map/location and terminal; time/weather belong in the terminal, Home/Immersive in the menu. Genuine gameplay actions and feedback remain game-owned.
- Preserve `apps/shell/public/brand/logo.svg`'s exact original path and `#0d9488`. Keep genuine 192/512 PNGs and a separate maskable 512 PNG with the mark inside the central 40%-radius safe circle. No new runtime tooling dependency is needed to generate them.
- `apps/shell/public/app.webmanifest` keeps Carrick Games for both names, `/` for id/start URL/scope, standalone display, teal theme color and the retained icon background `#f6f7f5`. Build rewrites icon URLs to `/shell/<sha>/brand/...`; modern resources must not use legacy `/brand/`. `/manifest.json` stays deployment metadata. No service worker/offline claim; native Windows Edge installation remains untested and existing installs may need a cache refresh/reinstall.

## Verification Commands and Ownership

Run commands from the repository root with Node.js ≥22.18.0. Read `package.json` and scripts before inventing aliases.

```bash
npm ci
npm run typecheck
npm run test:unit
npm run test:release
npm run build
npm run test:e2e
```

Run the whole list after the final change has landed, before an application release. A docs-only or investigation task ends with its scoped handoff instead: it must not build, run artifact-producing tests, commit, push or deploy. When work is split across subtasks, the parent release owner performs the final verification once every in-flight change has landed.

**Reference ownership:** a screenshot or golden reference belongs to the component that owns the surface it captures, and it may assert only what that component owns or declares — never another component's metadata, artwork or version. A game release must not invalidate a shell reference, and a reference that anyone may regenerate is no longer an independent check: assert the other side's content semantically (see `tests/control-guide.spec.ts`) instead of widening the picture. Mask what the owner does not own; do not let the checked party edit its own expectation.

For focused local iteration:

```bash
npm run typecheck -- snake
npm run check:boundaries -- snake
npm run build:game -- snake
npm run build:shell
npm run preview -- --host 127.0.0.1 --port 8080
```

Always pass an ID to `build:game`; omitting it is not a safe one-game command. A shell-only build does not create a game catalog. Local `dist/` can contain retained preview artifacts; it is not proof of a verified production pairing. `npm run test:e2e` builds first, because Playwright only previews whatever `dist/` already holds: a stale store would be tested instead of the current checkout. `npm run dev` serves the source shell with workspace discovery. Playwright starts its own built preview on `http://localhost:8080` and never reuses an existing listener, so a second checkout holding that port fails the run loudly instead of being tested by mistake; set `CG_PREVIEW_PORT` to run two checkouts' suites side by side. Install Chromium/WebKit with `npx playwright install chromium webkit` when needed (CI uses `--with-deps`). The software-GL 3D suite intentionally uses one worker; do not mask failures by raising parallelism.

**Releases use the actual orchestrator**, never an unconditional all-component gate or a hand-selected test subset. In the workflow environment with exact checkout/event context:

```bash
node scripts/ci.mjs plan
node scripts/ci.mjs verify snake
# Or the selected shell cell:
node scripts/ci.mjs verify shell
# Only when the plan selects the shared full gate:
node scripts/ci.mjs verify all
```

`plan` writes `.ci/plan.json`; `verify` consumes the selected plan (or `verify <id> --plan <path>`). These are not standalone offline commands: they pin/download published artifacts, prepare the built preview and require the plan's revision and selected target. The game cell checks its own unit/browser tests, transitive declared-library unit tests and the generic release contract against a **pinned published shell**. The shell cell checks shell/transitive-library units and generic browser contracts against **pinned published games**, never freshly built unrelated source games. `prepare` alone is not verification. Only the guarded CI `publish <id|shell>` step publishes.

## CI Selection and Publication Safety

One `.github/workflows/deploy.yml` DAG handles PR verification and main publication. Use component-level concurrency with `cancel-in-progress: false` and game matrix `fail-fast: false`, not a workflow-wide queue or steady-state all-games-success barrier.

- Main runtime diffs are computed independently from **each target's `handledRevision`** to the candidate. Test-only selection uses the current push event's `before` or the PR merge-base, never the last verification watermark and never the union of other targets' source baselines.
- A docs/test-only change does not itself publish an artifact. A later docs push can still select previously unhandled runtime changes; do not silently lose failed releases. Old test changes must not keep fanning out forever.
- Shared libraries affect their real declared reverse consumers transitively. Recognized workspace-only lock records can be scoped; root workspace/toolchain/config or uncertain/external lock changes conservatively fan out. Shared verification changes may require a full check without runtime publication.
- Runtime version failures belong to the target cell, not a global version-validation gate. Known older candidates whose descendant is already handled are skipped; unavailable or diverged source history is fenced, not guessed.
- A queued target may replan **before testing only** for a safe newer known intent: a prior automatic ancestor won, the candidate sequence is newer, and the candidate SemVer exceeds the newly handled version. A rollback, inactive target, newer intent or unknown ancestry must not acquire fresh fences. Never blindly refresh CAS after tests.
- Pin published counterpart artifacts and validate their complete inventories before testing. Publish exactly the verified bytes/identity, recheck relevant newer source/test/dependency changes, and retain the tested counterpart fence. Same identity with different bytes is rejected; identical retries may be no-ops after health checks.
- The one-time full-suite bootstrap gate has already run and is not a standing dependency on every component succeeding. Its seeding rules return only for a deliberate disaster-recovery re-bootstrap: test every candidate and every reused partial seed, seed games before the modern shell, and publish exactly the tested `(id, version, revision, apiVersion)` identity set — no missing or extra entry, and no force-bump or rebuild substitution for an unchanged seed.

## Deployment and Operational Reference

The private `/root/projects/carrick-ops` checkout / `Carrick-K7/carrick-ops` repository owns the restricted publisher, site mounts, rollback and doctor. Read its **actual `RUNBOOK.md`** before operational work. Application CI streams one static release archive through its own restricted SSH key; it must never overwrite root Caddy, systemd, firewall, another site's files or another application's deployment tooling.

The root-owned `/usr/local/libexec/carrick-deploy-games` wrapper accepts these modern archive commands:

```text
deploy-game <id> <version> <40sha> <expectedTargetGeneration> <sequence> <expectedShellGeneration>
deploy <40sha> <expectedShellGeneration> <sequence> <expectedCatalogGeneration>
```

App-side invariants: a game fences its **shell generation** (its catalog entry, then `tombstones[id]`, then zero), so an unrelated game's publication cannot invalidate it. The shell fences **catalog generation** (`catalog.shell.generation`, not the top-level catalog generation), because every published game is its tested counterpart. Generations are canonical nonnegative safe integers and the deployment sequence is positive. The older modern forms without the final counterpart argument are rejected; `deploy <sha>` is legacy-only and never a modern fallback.

Everything else about the publisher — staged validation before the short promotion lock, sealing the artifact, re-reading state under that lock to check target CAS, sequence, counterpart and API compatibility, merging **only the target** into the catalog, the recovery journal, and the pinned legacy release — belongs to the RUNBOOK. Read it there instead of acting from this summary. Two consequences this repository relies on: a failed activation restores only the affected target and advances its generation while preserving sequence and handled history, and a crash is not a success until the public checks pass after recovery. Retain **every** immutable game and shell release: no pruning, automatic GC or quiet cleanup — removing old browser resources needs a separately agreed session/reload policy and authorization.

Games live physically at `/var/www/games.carrick7.com/games/<id>/<version>/<sha>/`; modern shell releases at `releases/<sha>/` are also served through `/shell/<sha>/`. `current` supplies shell HTML, not the ownership base for every game's assets. `/games/index.json` is the mutable discovery document.

Required GitHub secrets, under their existing names: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_URL`, `DEPLOY_SSH_KEY` (a repository-specific restricted deployment private key) and `DEPLOY_KNOWN_HOSTS` (pinned host-key lines for `DEPLOY_HOST`).

Do not print private keys or commit temporary credentials. Workflow `SSH_KEY`/`SSH_HOST`/`SSH_USER` are environment mappings of these secrets, not new secret names.

### Host preparation, observation and rollback

These are ops-side operations owned by the RUNBOOK and the `carrick-ops` scripts. This repository never performs them, and the application workflow must not run them. In outline, so an agent recognises the boundary: doctor and plan are read-only, scheduled observation does not authorize repair, and exit 2 means an observability failure rather than ill health. Host preparation uses only the Games-scoped `apply-deploy-tools.sh`/`apply-caddy.sh` variants — never all-service or all-site — and preserves the root Caddyfile, unrelated site snippets, systemd and firewall. Rollback uses the fenced `activate-game`/`activate-shell` wrappers, never direct symlink changes: it advances activation generation while preserving `handledRevision` and sequence, does not rewind history or restore a whole catalog, lets queued old fences fail, and leaves a separately planned newer release free to proceed — so pause that component's CI promotion first if a rollback must stay pinned, and never rerun an old intent with fresh fences to undo it. Run the daily doctor and an exact descriptor/entry or shell-manifest public smoke afterwards. Exact commands and arguments live in the RUNBOOK.

## Agent Release Closure

Respect the user's action scope: a docs-only or investigation task ends with its scoped handoff, not an unauthorized commit/push/deploy. For an approved application release, do not call it DONE after editing, local tests, a commit or a push alone.

1. Complete all intended source/UI/cover/audit work, then release through the actual affected/pinned-counterpart orchestrator and the own, transitive-declared-library and generic checks it selects — never an unconditional all-component gate or a hand-selected subset. After the final change has landed, pass `npm run typecheck`, `npm run test:unit`, `npm run test:release`, `npm run build` and the E2E set the plan selects.
2. Commit only intended changes; exclude unrelated/pre-existing **`.test-env/`** and other user work. Do not hide or remove it to make status appear clean.
3. Push the intended commit to `main` only within the authorized release scope.
4. Monitor `deploy.yml` for the **exact pushed SHA**:

   ```bash
   sha=$(git rev-parse HEAD)
   gh run list --repo Carrick-K7/carrick-games --workflow deploy.yml --commit "$sha" --limit 3
   gh run watch <run-id> --repo Carrick-K7/carrick-games --exit-status
   ```

5. Publicly verify what this run published: current HTML, `/manifest.json`, `/games/index.json`, and each published component's immutable entry, descriptor, styles, assets and icon. Validate HTTP status, content type, complete identity and inventory digests rather than merely accepting a 200 response. Prove a missing artifact is 404 rather than HTML fallback, and confirm earlier retained releases are still reachable for rollback. Cover the changed targets and their tested counterparts without claiming unrelated components were republished.
6. Report the commit SHA, exact Actions run/result, component identities and smoke/audit outcomes. Explicitly state any remaining blocker or untested platform. Native Windows Edge installation remains untested until actually exercised. No premature DONE or release tag.

Optional annotated tags are **per component**, only from the pushed, verified commit after closure (for example `game-snake-v1.0.1` or `shell-v0.3.0`). Read actual workspace versions first; there is no root monolith version to bump/tag for every game. Never tag an unverified or locally-only revision. Keep source/design descriptions distinct from deployment evidence throughout.
