# AGENTS.md - Carrick Games Development Guide

This is the repository's development authority. `README.md` is for external readers; `DESIGN.md` is the visual and interaction authority. Keep only these three root project documents; do not add deployment, heartbeat, memory or visual-style documents without explicit approval.

**Release evidence:** this document records contracts and required closure, not proof of a verified deployment. Use exact-SHA CI results and live component descriptors. A documentation-only delegation does not authorize builds, commits, pushes or production mutation.

**Last reconciled with production:** 2026-10-29 (Asia/Shanghai; Red Homestead early-access first release). `red-homestead` **0.1.0** at `828382c7ef76d9f72e9d89f91a116de384a9ba81` (API 1, target generation 1, sequence 272001) was published by the successful **Game red-homestead** cell in [exact-SHA Actions run 40730332718](https://github.com/Carrick-K7/carrick-games/actions/runs/40730332718). The actual plan selected shared verification because the repository inventory/input-profile tests changed, but **only Red Homestead was publication-eligible**. The common gate passed 2,881 units, 219 release contracts and all 417 full-source browser cases. The game cell passed 395 game/transitive-SDK units and 17 pinned-Shell browser cases.

- **CI outcome is not globally green:** all 29 game cells and the common gate succeeded; the verification-only Shell cell failed at browser-test collection because the [picker](<tests/picker-layout.spec.ts>), [accessibility](<tests/shell-accessibility.spec.ts>) and [design](<tests/shell-design.spec.ts>) fixtures still require the intentionally delisted Sudoku entry in a published catalog. Shell was not published. This is a remaining independent test-fixture issue, not a failed Red Homestead deployment; do not describe the whole run as successful or re-list Sudoku to hide it.
- **Public closure:** at 01:55+08, all seven new game payloads, all ten unchanged Shell 0.4.1 payloads at `56be6ba31edc24169d8468a1ada640e9639cd576` (generation 4), and all ten retained Shell 0.4.0 payloads at `831408bdee7070d459bf0190e4db8154ded6da0c` passed HTTP/MIME/SHA-256 inventory checks. Root HTML, descriptors/manifests/catalog identity and three missing-resource 404s passed. The six pre-existing game descriptors/entry digests remain reachable; their catalog entries and all 22 delist tombstones are unchanged. Catalog generation is 114, with seven active IDs: `cs`, `gacha`, `minesweeper`, `parking`, `red-homestead`, `texashold`, `villa`. No other game or Shell was republished.
- **Behavior and scope:** all 16 exact-release live-browser checks passed, including native build/deploy, session ending, homestead reload/backups, failed-storage feedback, stale-tab write fencing, 320px touch, worker decoding without uploads, actual imported terrain/source pixels, Snow theater selection, and missing-material recovery. Public art and three built-in maps are authored practice content; users may import local classic resources into real gameplay. This is not a complete original RA2 recreation: full bridges/scenery, exact art offsets/animation and VPL lighting remain incomplete. Proprietary reference bytes were not committed or published. No native Windows Edge installation or physical-phone performance claim is made.
- **Local evidence and operations:** the initial local full browser pass was 411/416: two shared input-release failures in the new game were fixed on the release SHA, and three WebKit cases could not launch because local shared libraries were missing. The corrected local game/contract/input checks passed, including the full-catalog touch repro; the clean CI installation then passed the full 417-case gate, including WebKit. No host packages/services, credentials, deployment tooling, hidden-game state or retained artifacts were changed. Recheck public identities before relying on this dated evidence.

**Earlier release evidence (CS reference reconstruction):** 2026-10-25 (Asia/Shanghai; reference-led CS architecture and butterfly handling). CS `1.6.1` at `d642a2cc0af8ba0676eb7dc4487c09f6b518165e` (API 1, target generation 17, sequence 270001) passed exact-SHA [Actions run `40165214000`](https://github.com/Carrick-K7/carrick-games/actions/runs/40165214000): 219 release-contract tests, 1,230 CS/transitive-SDK unit tests and all 60 selected browser cases. The real affected/pinned-counterpart plan published only CS, with no shared full gate or Shell publication.

- **Feature and correction history:** CS `1.6.0` at `cbbfa16e809a54f3188312dc6ba1d5026bd5d9a9` passed [run `40163743196`](https://github.com/Carrick-K7/carrick-games/actions/runs/40163743196) (219 contracts, 1,229 units, 60 browser cases) and published at generation 16/sequence 269001. Its complete public audit and 19 live browser checks passed. Acceptance then found stale help text still claiming randomized inspect variants; `1.6.1` corrects that bilingual metadata and adds a scope regression. Map/motion source and all inventoried non-code payloads are unchanged in this follow-up. Do not describe the successful `1.6.0` deployment as a failed CI run.
- **Public closure:** the final release's 223 files, all 223 retained `1.6.0` files and all ten unchanged Shell `0.4.1` files at `56be6ba31edc24169d8468a1ada640e9639cd576` (generation 4) passed HTTP/MIME/full SHA-256 checks. Only the [entry bundle](<https://games.carrick7.com/games/cs/1.6.1/d642a2cc0af8ba0676eb7dc4487c09f6b518165e/entry.js>) differs among payloads from `1.6.0`; 222 payloads are identical. The earlier `1.6.0` audit also verified all 223 retained `1.5.2` files. Root HTML, current/immutable manifests, exact descriptor/catalog identity, missing-resource 404s and audit-time stability passed. Catalog generation advanced 111→112→113; the other five active entries, all 22 tombstones and owner-delist markers remain unchanged. Nothing was relisted or pruned.
- **Behavior and limits:** all 19 final published-module/live-shell browser checks passed, covering saved-butterfly reload/firearm isolation, four maps advancing 60 simulation seconds with real bots, reference keyposes and portrait/tablet framing, map resources/static budgets, native map-card controls, and held/failed/late image handling. These are software Chromium/emulated-touch checks, not native Windows Edge installation, physical-device FPS or exhaustive combat proof. The [reference manifest](<games/cs/tests/csReferenceEvidence.json>) records what was actually inspected: maps remain authored browser adaptations rather than surveyed competitive or Source 2 replicas; two draws and one inspect family are supported, not the complete original random-variant set or measured native animation timing. Read-only review identified free-handle/finger intersections and portrait sweep clipping before release; both exact repros were independently rechecked after correction, without relaxing geometric limits. Including sky, static budgets remain Inferno 46,432 triangles/11 draws and Mirage 32,796/12, with bounded owned decoration textures.
- **Operations:** the final read-only daily doctor captured at 13:46:29+08 reported all five Games checks healthy, but overall unknown: 89 healthy, zero warning, zero critical and ten observation-limited unknowns. No host remediation, services, credentials, permissions, dependency-audit fixes or immutable-resource cleanup were performed. Recheck public identities and dated health evidence before relying on this record.

**Earlier release evidence (progressive asset loading):** 2026-10-24 (Asia/Shanghai; CS progressive asset loading). CS `1.5.2` at `78d7fd4f6db0ba370d1f93fce9a3572533d74c5a` (API 1, target generation 15, sequence 267001) passed exact-SHA [Actions run `40100628477`](https://github.com/Carrick-K7/carrick-games/actions/runs/40100628477): 219 release-contract tests, 1,192 CS/transitive-SDK unit tests and all 56 selected browser tests. The actual affected/pinned-counterpart workflow published only CS. Initial candidate `2111b7173abea6003de7296e62ba5c219290a358` did not publish: its paused-resize test treated asynchronous texture progress as frozen match state. The correction retains equality for every match field and separately validates bounded, non-resetting download progress; the complete gate then passed. Eight production-browser checks passed using the normal live shell and actual published-module fixtures: English/Chinese nonblack startup with held characters, 320px touch entry before photos arrive, colored preview placeholders, playable failed-photo fallback, in-place completion without resetting the match, retained old-world rendering during mandatory map loading, and disposal of late callbacks. These are software-Chromium checks, not physical-device FPS or native Windows Edge installation evidence. Public root/manifest/catalog identity, MIME, complete SHA-256 inventories and missing-resource 404s passed for all 223 new files, all 223 retained CS `1.5.1` files at `77aa720771d65cdd7d91fa59335e90744e461863`, and all 10 unchanged Shell `0.4.1` files at `56be6ba31edc24169d8468a1ada640e9639cd576` (generation 4). Only `entry.js` differs among the game payloads; 222 files are byte-identical. Catalog generation advanced 110→111; the other five active entries, all 22 tombstones and explicit owner-delist markers are unchanged. No hidden game was relisted. The read-only daily doctor reported all five Games checks healthy but overall unknown: 88 healthy, one disk warning at 79.4%, zero critical and ten observation-limited unknowns. No host remediation, credential/service changes or dependency-audit fixes were performed. Recheck live public identities before relying on this dated evidence.

**Earlier release evidence (owner-requested catalog delisting):** 2026-10-24 (Asia/Shanghai; owner-requested catalog delisting). AimLab (`aimlab`), CS Kimi (`cs-kimi`) and Sudoku (`sudoku`) were delisted by the owner-only [manual run `40075669782`](https://github.com/Carrick-K7/carrick-games/actions/runs/40075669782) at application source `ef40a094b03914443395737725d7ca7cec211d1e`. Its only active job completed in 19 seconds; all application build/test/publication jobs were skipped. Catalog generation advanced **107→110**, leaving six active IDs: `cs`, `gacha`, `minesweeper`, `parking`, `texashold`, `villa`. Each new tombstone has `delisted: true`, generation 3, sequence 202002 and retained handled SHA `809eafa18ec4d0d16b35e99046c15a9e267793bd`. The six remaining entries, 19 earlier tombstones and Shell `0.4.1` at `56be6ba31edc24169d8468a1ada640e9639cd576` (generation 4) were unchanged. No game or Shell runtime was republished.

- **Verified implementation:** [run `40070572413`](https://github.com/Carrick-K7/carrick-games/actions/runs/40070572413) passed at exact source `ef40a094b03914443395737725d7ca7cec211d1e`: 2,461 unit tests, 219 release-contract tests, all 389 full-source browser cases, and every selected Shell/game pinned-counterpart cell. Its real plan selected 29 verification-only targets and no publication. The Ops publisher at `bc942bafd5076b770909a41b0539cbd46cd855f8` passed 470 local tests and [Ops CI `40064351013`](https://github.com/Carrick-K7/carrick-ops/actions/runs/40064351013), then only that reviewed root-owned helper was atomically installed with an exact prior backup and hash checks. No credentials, ownership/modes, Caddy configuration or business services changed.
- **Failure evidence retained:** initial source `572174db97828f26e82c0ad040b2f86f80a40baf` failed [run `40064600005`](https://github.com/Carrick-K7/carrick-games/actions/runs/40064600005) with 386/389 browser cases passing. Two Villa fixture catalog routes needed strict `unrouteAll({ behavior: 'wait' })` cleanup; a native elevator-click failure did not reproduce in five local repetitions. Follow-up kept its real click, exact floor assertion and existing timeouts, added bounded observation-only diagnostics, and preserved shared-gate failure artifacts. No gameplay code, golden expectations, retries or assertions were weakened. The follow-up full run passed all 389 cases.
- **Public acceptance and limits:** root HTML, manifest/catalog identity, MIME and SHA-256 passed for all nine retained files of the three delisted releases and ten unchanged Shell files; four missing-resource probes returned 404. Eight live-browser checks covered desktop/touch-phone library contents, recoverable old hashes and removed last-game preference fallback. Post-operation daily doctor reported all five Games checks healthy, but overall remained unknown (88 healthy, one warning, zero critical, ten observation-limited unknowns). This is not whole-host recovery, exhaustive live gameplay, physical-device performance or native Windows Edge installation proof. Recheck the public endpoints before relying on these dated identities. Earlier automatic re-list behavior described in historical records is superseded by the current explicit-delist policy.

**Earlier release evidence (saved-butterfly startup freeze):** 2026-10-24 (Asia/Shanghai; saved-butterfly startup freeze). CS `1.5.1` at `77aa720771d65cdd7d91fa59335e90744e461863` (API 1, target generation 14, sequence 260001) passed exact-SHA [Actions run `40037046838`](https://github.com/Carrick-K7/carrick-games/actions/runs/40037046838): 155 release-contract tests, 1,183 CS/transitive-SDK unit tests and all 50 selected browser tests. The confirmed fault was a saved butterfly preference incorrectly activating knife-only pose interpolation on firearms/HE/C4, causing `Quaternion.fromArray(undefined)` and stopping the game loop. The runtime fix checks both actual weapon ID and knife model; it does not lower graphics quality or alter map assets. Public identity, MIME and complete SHA-256 checks passed for 223 new files, 223 retained CS `1.5.0` files at `8d84ca5bbfd8b5433a3f60b3567b91f5d97204de`, and 10 unchanged shell `0.4.1` files at `56be6ba31edc24169d8468a1ada640e9639cd576` (generation 4). Only `entry.js` differs among the 223 game inventory paths; the other 222 payloads are identical. Missing new/retained game and shell JavaScript returned 404. Live-shell saved-preference reload, pistol startup, butterfly inspection and pistol return passed; actual published-module Snow and Dust fixtures each advanced 60 simulation seconds with nine real skinned bots and periodic fresh frames. The first live native-input attempt exceeded a five-second actor-readiness assertion while its trace returned nine actors; confirmation with a 20-second observation budget passed, without changing runtime code or the tested state assertions. These are not physical-device FPS benchmarks or exhaustive combat coverage. Catalog generation advanced 106→107; the other eight entries and all 19 tombstones remain unchanged. Only CS was published. The read-only daily doctor reported all Games checks healthy, but overall status remained unknown: 87 healthy, one warning, zero critical, 11 unknown; disk usage was 78.3%, and inventory-policy mismatch/unavailable observations remained. The earlier NEXUS research/backup criticals were no longer present; this release performed no host remediation. Existing development dependency audit findings were not addressed. Native Windows Edge installation and physical-device frame rates remain untested; re-check public identities before relying on this evidence.

**Earlier release evidence (classic maps):** 2026-10-23 (Asia/Shanghai; CS classic maps and photographic materials). CS `1.5.0` at `8d84ca5bbfd8b5433a3f60b3567b91f5d97204de` (API 1, target generation 13, sequence 258001) passed exact-SHA [Actions run `39972222686`](https://github.com/Carrick-K7/carrick-games/actions/runs/39972222686): 155 release-contract tests, 1,162 CS/transitive-SDK unit tests, and all 47 selected CS/generic-release browser tests. The actual affected/pinned-counterpart workflow selected and published **only CS**. Public checks verified root HTML, manifest/catalog identities, HTTP content types and every SHA-256 inventory entry for all 223 new CS files, all 192 retained CS `1.4.3` files at `9bcf457181a4c7208c087040dc81d5e0b2ba414f`, and all 10 unchanged shell `0.4.1` files at `56be6ba31edc24169d8468a1ada640e9639cd576` (shell generation 4). Missing immutable game/shell JavaScript returned 404. Normal live-shell desktop and touch-phone-layout checks selected and entered both Inferno and Mirage in active defusal matches with nine bots, then returned through game settings; no browser errors or cross-release CS asset requests occurred. These checks are not a full-map combat playtest or a physical-device FPS benchmark. Catalog generation advanced 105→106; the eight other active entries and all 19 delist tombstones are unchanged. No shell or other game was republished or relisted. The supplementary read-only daily doctor reported Games healthy but was **not globally green**: 56 healthy, 4 critical and 3 unknown, with pre-existing NEXUS research-service/backup failures and NEXUS/listener observation limitations. No host services, credentials, configuration or backup data were changed. Existing development-tool dependency audit findings were not addressed by this scoped release. Native Windows Edge installation and real-phone frame rates remain untested. This is release evidence for the identities stated here; re-check the public catalog and manifest before relying on it.

**Earlier release evidence (shell picker):** 2026-10-15 (Asia/Shanghai; explicit menu game picker). Shell `0.4.1` at `56be6ba31edc24169d8468a1ada640e9639cd576` was published by the successful Shell job in [Actions run `38588428551`](https://github.com/Carrick-K7/carrick-games/actions/runs/38588428551): API 1, target generation 4, sequence 254001. That exact revision passed the selected full-source gate (2,232 unit tests, 155 release tests, 350 browser tests) and the pinned-published-games Shell gate (36 unit tests, 126 browser tests). The overall run was **not green**: three verification-only game cells exposed retired switch-target assumptions (Chess/Gacha) and a fixture-route teardown race (Villa). Verification-only follow-up `ab928e974c7aea96298dc49737d9365bb248bbd5` closed all three failures in successful [run `38598784203`](https://github.com/Carrick-K7/carrick-games/actions/runs/38598784203), using the released Shell as the pinned counterpart. It selected only Chess/Gacha/Villa verification and published no component; the live Shell remains the exact `56be6ba31edc24169d8468a1ada640e9639cd576` release. Public checks verified root HTML/manifest/catalog identity, 273 inventoried file digests (10 new Shell, 10 retained Shell `0.4.0`, 253 across the nine unchanged games), resource responses and eleven missing-resource 404s. Eight production-browser scenarios covered desktop/320px touch, English/Chinese, light/dark, the explicit chooser/current-game/arrow target, same-instance Continue, switching games and in-place preferences. Catalog generation is 103; all nine active game entries and all 19 delist tombstones are unchanged from the pre-release generation 102 snapshot. Current game identities include CS `1.4.2` and Texas Hold'em `1.1.0` at `a1dfc6c7f76258c905a4f13544e2ef5e54908e4b`, Gacha `1.1.1` at `4b7833156952dc8f11d7817c9c267b42aeb4ebaf`, and Villa `1.10.1` at `8d8e040eafd392a3650cf6c06325aff4d860ef6c`. No game was republished or relisted, no golden image was regenerated, and no host service/credential was changed. Native Windows Edge installation remains untested. Recheck live descriptors before relying on this evidence.

**Earlier release evidence:** 2026-10-09 (CS simple Escape settings and quieter weapon HUD). CS `1.4.1` at `9b1e09b0a89959a8a1bcc39ab0777c807dd428c6` (API 1, target generation 10, sequence 246001) passed exact-SHA Actions run `37953272882`. Public identity, content types and SHA-256 inventories passed for all 192 current CS files, 192 retained CS `1.4.0` files at `9817858d0abb7bdc06904a6e6020d215f1f28883`, and 10 files of the unchanged pinned shell `0.4.0` at `831408bdee7070d459bf0190e4db8154ded6da0c` (shell generation 3). Missing game/shell resources returned 404. The normal live shell verified map artwork, hover targets and arena entry without permanent decorative weapon artwork. Game-owned live-release fixtures verified real automatic reload timing/ammunition/progress, no weapon action/mode prose or numeric equipment strips, complete high-ammo/vitals/HE/C4 values on deep-safe phone/landscape, stable visible touch targets and game-clock-only remaining captions. Native input checks covered direct simple settings on Escape/touch pause, repeats and no recapture on Escape, folded-control capture cancellation, and score/radio return to collapsed settings without resuming the match. These deterministic fixture checks are not a full-map combat playtest. The supplementary daily host doctor passed with 45 healthy checks and no warning/critical/unknown checks; this release changed no host credentials or services. Existing dev-tool dependency audit findings were not addressed by this scoped HUD release. Catalog generation is 99 with the same 9 active IDs (`aimlab`, `cs`, `cs-kimi`, `gacha`, `minesweeper`, `parking`, `sudoku`, `texashold`, `villa`); all eight non-CS entries and all 19 delist tombstones are unchanged. No other game or shell was republished or independently gameplay-reverified in this pass. The earlier delist operations advanced catalog generation 73→89→92, left each removed game's tombstone at generation 3/sequence 202002, and retained immutable files; a future runtime publish can legitimately re-list a delisted game. Villa remains `1.10.0` at `da8256e0464256636f739575538fb64527b69100`. This line is a claim like any other: re-check live `/games/index.json` and `/manifest.json` before trusting it, and update it whenever a statement here is verified or corrected.

## Workspace Ownership

```text
apps/shell/
  package.json          @carrick/shell; independent shell SemVer
  index.html
  src/                  Thin host, remote catalog, release loader, preferences and UI
  public/brand/         Exact original SVG and genuine installation PNGs
  public/app.webmanifest  Browser installation identity, not deployment metadata
  tests/                Shell-owned unit tests
games/<id>/             29 @carrick/game-<id> workspaces
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
- Targeted validation walks the selected workspace and its **transitively declared libraries**, not unrelated game source or `game.json`. A malformed unrelated game cannot block a targeted game build/typecheck. Root workspace, shared toolchain or external lock changes may deliberately cause conservative fan-out; a broken root install is not independent-game isolation. The root `package.json` is compared by structure: its `devDependencies`, `engines`, `workspaces` and any unrecognized field are runtime inputs for every component, so adding one root devDependency makes all 28 games and the shell runtime-affected. Each eligible component that publishes needs a higher SemVer; intentionally delisted games remain verification-only and do not need a publication bump. Version failures stay in their own target cells. A `scripts`-only edit is verification, never runtime, because CI installs with `npm ci` and builds with `node scripts/build.mjs`. Prefer a component-local `devDependencies` entry over a root one.
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
- Exactly three permanent **real 44px-high shell targets**: the brand mark at 44×44 (top/left 12px plus safe area for fixed games; right 116px for CS/CS Kimi/Villa/Texas Hold’em), help at right 64px and menu at right 12px. Preserve the exact 22px teal gamepad. **No brand text is persistent**: the full stacked "Carrick Games" wordmark appears only on the `…` menu and the library, while the mark keeps its accessible name. All hide during pointer capture; responsive HUDs reserve the existing top-right utility cluster and 64px content clearance.
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

One `.github/workflows/deploy.yml` DAG handles PR verification and main publication, plus an owner-only manual `workflow_dispatch` for game delisting. Manual operations never enter the application build/test/publish jobs. Use component-level concurrency with `cancel-in-progress: false` and game matrix `fail-fast: false`, not a workflow-wide queue or steady-state all-games-success barrier.

- Main runtime diffs are computed independently from **each target's `handledRevision`** to the candidate. Test-only selection uses the current push event's `before` or the PR merge-base, never the last verification watermark and never the union of other targets' source baselines.
- A docs/test-only change does not itself publish an artifact. A later docs push can still select previously unhandled runtime changes for non-delisted targets; do not silently lose failed releases. Intentional delists exclude pending auto-publication and publication-only version gates, while relevant current edits remain testable. Old test changes must not keep fanning out forever.
- Shared libraries affect their real declared reverse consumers transitively. Recognized workspace-only lock records can be scoped; root workspace/toolchain/config or uncertain/external lock changes conservatively fan out. Shared verification changes may require a full check without runtime publication.
- Runtime version failures belong to the target cell, not a global version-validation gate. Known older candidates whose descendant is already handled are skipped; unavailable or diverged source history is fenced, not guessed.
- A queued target may replan **before testing only** for a safe newer known intent: a prior automatic ancestor won, the candidate sequence is newer, and the candidate SemVer exceeds the newly handled version. A rollback, inactive target, newer intent or unknown ancestry must not acquire fresh fences. Never blindly refresh CAS after tests.
- Pin published counterpart artifacts and validate their complete inventories before testing. Publish exactly the verified bytes/identity, recheck relevant newer source/test/dependency changes, and retain the tested counterpart fence. Same identity with different bytes is rejected; identical retries may be no-ops after health checks.
- The one-time full-suite bootstrap gate has already run and is not a standing dependency on every component succeeding. Its seeding rules return only for a deliberate disaster-recovery re-bootstrap: test every candidate and every reused partial seed, seed games before the modern shell, and publish exactly the tested `(id, version, revision, apiVersion)` identity set — no missing or extra entry, and no force-bump or rebuild substitution for an unchanged seed. Main bootstrap with intentional delists is rejected before builds and requires a separate explicit recovery plan; the source-wide gate must not silently reseed hidden games. Unmarked null-history failed-first seeds remain retryable.

## Deployment and Operational Reference

The private `/root/projects/carrick-ops` checkout / `Carrick-K7/carrick-ops` repository owns the restricted publisher, site mounts, rollback and doctor. Read its **actual `RUNBOOK.md`** before operational work. Application CI streams one static release archive through its own restricted SSH key; it must never overwrite root Caddy, systemd, firewall, another site's files or another application's deployment tooling.

The root-owned `/usr/local/libexec/carrick-deploy-games` wrapper accepts these modern archive commands:

```text
deploy-game <id> <version> <40sha> <expectedTargetGeneration> <sequence> <expectedShellGeneration>
deploy <40sha> <expectedShellGeneration> <sequence> <expectedCatalogGeneration>
remove-game <id> <expectedTargetGeneration> <sequence> <expectedShellGeneration>
```

`remove-game` is the ops-owned delist command: it moves that game's catalog entry to `tombstones[id]` with `delisted: true`, so the game leaves `/games/index.json` and every shell picker while immutable files remain retained. Ordinary `deploy-game` cannot undo an intentional delist; an explicit `activate-game` with a retained version/SHA can. Legacy tombstones with a valid non-null `handledRevision` and no marker remain delisted; unmarked null-history tombstones are failed first publications and may retry. Any present marker other than literal `true` is invalid. Both CI and the locked publisher enforce this distinction, and failure compensation preserves complete prior tombstone data.

Automatic push/PR jobs never remove games. The repository owner's explicit `workflow_dispatch` on `main` accepts `game_ids` and uses the existing restricted publisher/credentials; no separate account, key or local privilege bypass is introduced. The owner must also be the triggering actor, and only attempt 1 is accepted: inspect an uncertain result, then start a new dispatch for a new intent instead of rerunning an old operation. All IDs are validated before any write. One snapshot supplies target/Shell generations and target sequence + 1; already-delisted targets only recheck state, and no failure refreshes fences or retries writes automatically. Batch operations stop at the first failure/unknown and report each result without undoing earlier successes. The manual job does not install dependencies, build games or run application tests. Before/after identities and outcomes stay in the Actions run; never print credentials. Example:

```bash
gh workflow run deploy.yml --repo Carrick-K7/carrick-games --ref main \
  -f game_ids='aimlab cs-kimi sudoku'
```

This is an explicit owner operation, not scheduled-agent authority. An accepted dispatch or successful SSH exit is not closure: inspect the exact run and public catalog. Unknown or failed SSH stays non-successful even if a snapshot currently looks removed, because server-side checks may still compensate. Current public-check failure compensation remains; it may restore the previous state. Old direct hashes can show recoverable load errors rather than automatically redirecting. See the Ops Games protocol for installation, compensation and recovery.

App-side invariants: a game's **target generation** comes from its catalog entry, then `tombstones[id]`, then zero. Its tested **counterpart generation** is `catalog.shell.generation`, so an unrelated game's publication cannot invalidate it. The shell's **target generation** is `catalog.shell.generation`, while its tested **counterpart generation** is the top-level `catalog.generation`, because every published game is its tested counterpart. Generations are canonical nonnegative safe integers and deployment sequence is positive. The older modern forms without the final counterpart argument are rejected; `deploy <sha>` is legacy-only and never a modern fallback.

Everything else about the publisher — staged validation before the short promotion lock, sealing the artifact, re-reading state under that lock to check target CAS, sequence, counterpart and API compatibility, merging **only the target** into the catalog, the recovery journal, and the pinned legacy release — belongs to the RUNBOOK. Read it there instead of acting from this summary. Two consequences this repository relies on: a failed activation restores only the affected target and advances its generation while preserving sequence and handled history, and a crash is not a success until the public checks pass after recovery. Retain **every** immutable game and shell release: no pruning, automatic GC or quiet cleanup — removing old browser resources needs a separately agreed session/reload policy and authorization.

Games live physically at `/var/www/games.carrick7.com/games/<id>/<version>/<sha>/`; modern shell releases at `releases/<sha>/` are also served through `/shell/<sha>/`. `current` supplies shell HTML, not the ownership base for every game's assets. `/games/index.json` is the mutable discovery document.

Required GitHub secrets, under their existing names: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_URL`, `DEPLOY_SSH_KEY` (a repository-specific restricted deployment private key) and `DEPLOY_KNOWN_HOSTS` (pinned host-key lines for `DEPLOY_HOST`).

Do not print private keys or commit temporary credentials. Workflow `SSH_KEY`/`SSH_HOST`/`SSH_USER` are environment mappings of these secrets, not new secret names.

### Host preparation, observation and rollback

These are ops-side operations owned by the RUNBOOK and the `carrick-ops` scripts. This repository never performs them, and the application workflow must not run them. In outline, so an agent recognises the boundary: doctor and plan are read-only, scheduled observation does not authorize repair, and exit 2 means an observability failure rather than ill health. Host preparation uses only the Games-scoped `apply-deploy-tools.sh`/`apply-caddy.sh` variants — never all-service or all-site — and preserves the root Caddyfile, unrelated site snippets, systemd and firewall. Rollback uses the fenced `activate-game`/`activate-shell` wrappers, never direct symlink changes: it advances activation generation while preserving `handledRevision` and sequence, does not rewind history or restore a whole catalog, lets queued old fences fail, and leaves a separately planned newer release free to proceed — so pause that component's CI promotion first if a rollback must stay pinned, and never rerun an old intent with fresh fences to undo it. Run the daily doctor and an exact descriptor/entry or shell-manifest public smoke afterwards. Exact commands and arguments live in the RUNBOOK.

## Agent Release Closure

**Standing user authorization (2026-10-24):** After requested Carrick Games development is complete and validated, proceed with the intended commit, push and formal deployment without asking for a separate deployment confirmation each time. Honor any narrower instruction in the current request. This does not authorize unrelated worktree changes, bypassing verification or publication fences, relisting hidden games, rollback, or host/service/credential changes. Docs-only and investigation-only requests retain their scoped handoff unless release is explicitly requested.

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
