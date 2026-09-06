# CS

A browser FPS fan recreation of the classic Counter-Strike fight-yard experience. This is an independent browser game, not Valve's Counter-Strike 2 or the Source 2 engine. Matches run locally in the browser against nine bots; there is no online multiplayer or external account service.

## Original fy_snow map

- Original map: **fy_snow**, by **Punkki**.
- Attribution / map listing: https://gamebanana.com/mods/86704
- Map description and rules: https://www.gamemaps.com/details/12542
- Original BSP source: https://cstrike.csmegagaming.com/maps/fy_snow.bsp.ztmp
- The downloaded file uses bzip2 compression; `dist/assets/fy_snow.bsp` is the decompressed GoldSrc BSP30 map (546,304 bytes).
- The browser reader imports the original world polygons, six embedded map textures, collision hulls, 32 spawn points, and all 58 armoury entities. External WAD textures use a local material fallback; the original external skybox is replaced by a 3D snowy environment.
- Map geometry and embedded textures remain attributable to their original creators. Counter-Strike names and brands belong to their respective owners. No Valve executable, Source 2 engine, CS2 weapon model, or CS2 audio asset is included.

## Browser implementation

Original JavaScript gameplay, authored player meshes and most weapon meshes, interface, licensed field recordings with synthesized fallback audio, snow particles, and mountain scenery. AK-47 and Desert Eagle use processed Valve CS:GO Workbench geometry with authored materials and animation rigs; see the visual reference section below. Gameplay includes first-person movement with acceleration and counter-strafing, jumping, crouching, silent walk, hitscan weapons, authored per-weapon recoil paths, movement inaccuracy, headshots, armour, magazines, reload, original weapon pickups, automatic primary pickup when the slot is empty, HE grenades, collision-aware bot navigation, friendly-fire prevention, elimination rounds, persistent round corpses, spectating, scoreboards, pause/resume, touch input, and first-to-seven matches.

The thirteen firearm types in the original BSP are represented at their exact 50 firearm points, along with four HE grenades and four armour points (58 armoury entities total). Source X/Y placement, facing and count are retained; geometry is rested just above the corresponding original floor. The two AWPs remain at GoldSrc origins `576 -720 -220` and `576 1104 -220`, in the rear balcony centre on each team's side. They can be reached through the side stairs; an AWP marker on the radar makes them easier to locate. No additional pistol pickup points are injected. The player can choose a default faction pistol or Desert Eagle before the match; bots retain faction pistols.

Characters are authored anatomical meshes with tailored torso and trouser cross sections, articulated knees, tapered arms, individual gloves, layered clothing and distinct faction equipment. Height is about 1.80 m. Arm joints solve to the held gun's actual grip and support-hand anchors, including magazine and bolt interactions. On defeat the carried weapon drops, the articulated model settles on the ground, and the body remains until round reset or the TDM corpse lifetime. Bots take primary weapons from the map at the start of each round. Snow elimination enters overtime at zero. Dust II uses a separate timed bomb-defusal state machine.

Public mechanical references: Valve Developer Community pages for [player hull dimensions](https://developer.valvesoftware.com/wiki/Player_Entity), [Source map dimensions](https://developer.valvesoftware.com/wiki/Dimensions_%28Half-Life_2_and_Counter-Strike%3A_Source%29), and [weapon accuracy](https://developer.valvesoftware.com/wiki/Weapon_Accuracy_and_Vector_Projectiles). These references informed scale and behaviour only; the implementation and assets are original.

The map's visible Chinese name is **雪地竞技场**; its internal `fy_snow` asset identifier remains stable for the map registry. AWP uses the requested one-hit elimination rule on any registered enemy hit, including an armoured target and bot shots at lower difficulty. This is an intentional game rule, not a claim about every hit location in stock CS:GO.

`weapon-models.js` builds separate receivers, detachable magazines, scope rings/lenses, open trigger guards, stock profiles, bolts, pistol slides, pump grips and belt-feed covers. `weapon-motion.js` animates these parts and the hands through extraction, insertion and chambering, with distinct top-magazine, belt-fed and shell-loading sequences. AWP cycles its bolt after each shot, ejects a case and prevents firing/scoping until chambering finishes. Weapon-local deadlines persist through quick switching. Animation and mechanical sound events follow game time, so they pause with the match. The sequences are authored approximations in the browser engine; no original Valve animation file was imported. See Valve Developer Community's [animation events reference](https://developer.valvesoftware.com/wiki/Animation_Events) for the public separation of fire/reload activities and timed animation events.

## Three.js

Three.js r180, MIT License. Local browser modules are shipped in `dist/vendor/`; see `dist/vendor/THREE-LICENSE.txt`.

## Validation

JavaScript syntax and local asset references checked. Programmatic checks validate the 1.80 m operator envelope and firearm-family overall proportions in addition to the earlier BSP, spawn, armoury, navigation, collision, match, magazine, bot, round-reset, friendly-fire, scoring, and grenade checks. Browser rendering and pointer-lock behaviour require testing on the player's browser and were not inspected in an automated browser during this build.

`node tests/weapons.mjs` exercises the actual game modules and BSP with a minimal non-rendering DOM adapter: AWP damage against armour, friendly-fire prevention, bolt travel and lockout, scope recovery, quick-switch timing, reload interruption, ammunition conservation, empty-slide release, per-shell loading, bot reload completion, reset/finite transforms for all twenty rigs, corpse retention and Chinese map labels.

## Shooting, controls and team deathmatch update

First-person projectiles use each articulated model's actual muzzle attachment. A projection conversion reconciles the independent world and view-model cameras; traces target the crosshair ray and are checked against both barrel obstruction and the world geometry. Bot tracers originate at their held weapon muzzle. Seventeen authored recoil profiles separate angular pitch, lateral patterns, first-shot response, automatic-fire accumulation, movement inaccuracy and recovery timing. They are independently implemented game responses, not extracted Valve recoil data.

## CS:GO visual reference and gun-report update

Character clothing and pose references are Valve's [SAS update](https://blog.counter-strike.net/2016/12/17343/) and [Phoenix update](https://blog.counter-strike.net/2017/03/18185/). CT uses a fitted navy combat jacket, hood, round-lens gas mask and grey knee pads. T uses the olive balaclava, tan shirt with rolled sleeves, olive trousers and tan shoes. At the user's request, armour is a gameplay statistic: visible front/back armour plates, shoulder webbing, radio antenna, backpack and rear belt pouches have been removed. Shallow sewn pockets, a zipper and shoulder seams follow the clothing surface. The character mesh, cloth weave, rig and animation are authored here; original Valve character models and textures are not included.

AK-47 and Desert Eagle geometry comes from Valve's public [CS:GO Workshop resources](https://www.counter-strike.net/workshop/workshopresources), specifically [workbench_materials.zip](https://media.steampowered.com/apps/csgo/workshop/workbench_materials.zip?v=103), retrieved 2026-09-05. Geometry remains copyright Valve and is not claimed to be CC0, MIT or an original mesh. The delivered indexed data retains the 2013 CS:GO shape: 13,069 triangles for AK-47 and 8,591 for Desert Eagle. `tools/convert-reference-weapons.py` converts OBJ units/axes and partitions the detachable magazine, bolt, fixed barrel and reciprocating slide. No Valve animation or original audio is imported. Materials are authored dark steel/wood grain and brushed silver/checkered rubber, following Valve's default inventory renders. The former procedural Desert Eagle prototype is superseded by this reference geometry.

The fallback synthesized firearm reports have six stable variations each. The revised design removes pitched sine-wave body resonance, using a short bipolar pressure front, broadband crack, irregular filtered gas jets, action clacks and 32 irregular outdoor reflection taps. Suppressed reports use a separate reduced transient and decay. Distant bot fire loses high-frequency energy while keeping stereo bearing. Audio buffers are reused, short mechanical cues follow the existing animation timeline, and a compressor controls overlapping reports. These are authored synthesized sounds, not CS:GO recordings.

Legacy BSP armoury IDs stay internal for compatibility. Visible names now use **MP5-SD, MP9, SG 553, SSG 08, Nova, Desert Eagle, M4A1-S, USP-S, Glock-18**, and the other matching CS:GO weapon names. The compact MP9 has a separate model and MP5-SD carries its integrated suppressor. Naming reference: Valve's [Operation Riptide](https://www.counter-strike.net/operationriptide/) and [Operation Broken Fang](https://counter-strike.net/brokenfang) weapon collections.

Core action bindings use WASD, Space, Shift, Ctrl, R, E, G (drop), Q (actual last inventory), F (inspect), 1–4, 6 (HE grenade), mouse wheel, Tab and Escape. C/Z/X open radio menus. Right-click provides two scope levels, knife secondary attack, grenade underhand throw, Glock burst selection and USP-S/M4A1-S suppressor attachment. Grenades can be held before releasing a mouse button; both buttons blend throw strength. Holding Space does not repeatedly jump. Source command semantics reference: Valve Developer Community's [CS:GO console commands](https://developer.valvesoftware.com/wiki/List_of_Counter-Strike%3A_Global_Offensive_console_commands_and_variables) and [lastinv definition](https://developer.valvesoftware.com/wiki/Console_Command_List). Dust II adds B purchasing, C4 on slot 5, and E planting/defusing; voice, chat and online services remain outside this local bot game.

Preparation freezes all translation, jumping and crouching for four seconds while allowing looking and inventory actions. Bots split into reachable left, middle and right routes, rotate assignments across rounds/respawns and retain their opening waypoints before pursuing opponents. The map registry remains ready for additional map entries.

The added **team deathmatch** mode allows 30, 50 or 100 team kills to win. Each enemy death scores once. Players and bots respawn after three game-time seconds with 1.2 seconds of protection, cancelled on attacking. Death bodies persist separately for about 20 seconds while new actors rejoin. Original ground pickups refresh eight seconds after collection; dropped inventory preserves ammunition and expires after 25 seconds. Respawn selection penalizes nearby and visible enemies and crowded spawn points. Elimination mode retains its first-to-seven-round rules.

`node tests/gameplay.mjs` validates camera/muzzle projection for every firearm, physical model bounds, distinct recoil responses, prep movement lock, reachable squad routes, inventory/key interactions, suppression and burst controls, single-count kills, pause-aware respawns, body persistence, weapon refresh, kill-limit victory and elimination mode isolation. It also simulates 70 seconds of continuous AI combat on the actual BSP, checking repeated respawns and bounded dropped objects. These are non-rendering engine tests; visual fidelity and device-specific pointer lock were not browser-tested.

## Focus handling and operator proportions

Secondary mouse input and context menus are intercepted during gameplay at window capture level, so a locked pointer retargeted away from the canvas still receives the guard. A short, secondary-click-related pointer unlock or blur clears held inputs without opening pause; Escape, hidden tabs and sustained focus loss still pause normally. Clicking the play surface can reacquire pointer lock. `tests/input-focus.mjs` covers both unlock/blur orderings, Escape, resume, programmatic release and persistent versus temporary focus loss; `tests/gameplay.mjs` also exercises the actual mouse-to-scope and pause wiring.

The crosshair retains four 4 px arms, 1 px strokes, a 2 px resting gap and no centre dot. Current player proportions supersede the previous scaled-head prototype; the standing hit volume follows the new hood/head envelope.

`node tests/refinement.mjs` checks the exact 58 source armoury points, counts and facing transforms; both side-stair routes using the real collision hull and movement (without teleportation or jumping); AWP pickup distance and line of sight; 1.80 m character height and arm lengths; reference weapon mesh and magazine animation integrity; and all 102 stereo report variants, finite samples, unclipped peaks and reduced suppressed energy.


## Dust II / 炙热沙城Ⅱ

The second map uses the **classic Counter-Strike 1.6 `de_dust2` BSP**, by **DaveJ**, with textures credited to **MacMan** in its original readme. It is the GoldSrc layout, not the 2017 CS:GO art remake or the Source 2 map. This browser game remains a local 5v5 bot adaptation with authored rendering, movement, sound and objective logic.

- Original map package / attribution: https://en.ds-servers.com/maps/goldsrc/cstrike/de_dust2.html
- Package: https://en.ds-servers.com/maps/goldsrc/cstrike/de_dust2.zip
- BSP: 2,057,288 bytes; SHA-256 `15945389528d113562ede0a2c80647ebfa799079ed1c05a25379bcf84e4e9286`.
- Original `cs_dust.wad`: 1,055,884 bytes; SHA-256 `f6f5b83318d5445a0c44b1c783dfcb04dba568e5670c9271cf1f93071787fa19`.
- Valve's later CS:GO art reference, useful for distinguishing editions: https://www.counter-strike.net/dust2/

The reader retains original polygons and collision hulls, 20 CT and 20 T spawn points, both bomb-target brushes, both team buy zones and the ten solid target crates. It also renders brush decorations. Sandstone, doors, site markings and crates use embedded textures plus `cs_dust.wad`; a few external Half-Life utility/light textures use a local neutral material fallback. Snow particles, mountains and cold lighting are replaced by desert atmosphere when switching. Map loading is transactional: the previous map stays available if a new asset fails, and the old scene and resources are disposed after a successful switch.

Dust II defaults to **经典爆破**: T carries C4 to A or B, holds the primary attack with slot 5 (or E) for 3.2 seconds, and CT holds E for 10 seconds or 5 with a kit. The planted bomb counts down 40 seconds independently of the 1:55 round clock. Dropped C4 is automatically recoverable by living T teammates. Releasing interaction, moving, leaving range, death, and pause cancel progress. Killing the last T after a plant does not prematurely award CT the round. Defuse, explosion, unplanted timeout and team elimination have separate conditions and award a round once. This adaptation retains a four-second freeze and first-to-seven match length.

Defuse kit timing reference: https://developer.valvesoftware.com/wiki/Item_defuser
Bomb entity reference: https://developer.valvesoftware.com/wiki/Weapon_c4

B opens an in-spawn purchase menu during freeze or the first 20 active seconds. The first round starts at $800 with faction pistols; purchases, kill/round rewards, loss bonuses, equipment retention, armour/helmet upgrades and defuse kits carry into subsequent rounds. Weapon definitions, simplified damage/armour and authored recoil remain those of this browser game; this is not a claim to reproduce every competitive economy edge case or CS:GO simulation detail. Dust II also supports the existing infinite-respawn TDM, with faction rifles on spawn and free equipment swaps inside the buy zones. Dust II has no original ground armoury entities; no fy_snow-style weapon pads are invented there.

Bots take separate long-A, short-A and tunnel openings, escort the carrier, plant, hold a planted site and rotate to defuse. Navigation retains stacked floors instead of projecting tunnels onto their roofs. Stair and narrow-passage links are validated by simulating the real movement hull. The precomputed navigation asset is generated from the original map by `node tools/generate-dust-navigation.mjs`; it avoids rebuilding the graph on every client load.

`tests/dust2.mjs` executes actual map loading, scene replacement, shop restrictions, C4 inventory/keys, interrupted and paused interaction, both site's plant/defuse/fuse/timeout rules, bot movement and objective completion, scoring, TDM isolation and failed-load recovery. Existing weapon, focus, 70-second fight-yard combat and model/audio checks remain in place. These are non-rendering engine checks; no live browser visual or device-specific input test was performed for this update.
## Surface, movement and weapon-handling refinement

At the user's request, map materials have been restored to the previous BSP/WAD palette textures and material settings. The added JPEG surface assets, ImageBitmap decoding and normal/roughness replacement layer have been removed. Both maps use their original local material-loading path again. The remaining character, purchase-menu, movement and weapon-handling improvements are retained, as is the display-resolution setting of up to 2× device pixel ratio with a 4.5-million-pixel budget.

Movement traces the standing or crouching collision hull down to its nearest support after each horizontal substep. A blocked uphill step now resolves the minimum supported height, instead of lifting the body by 0.46 m and letting gravity drop it again. Downhill adhesion is limited to step height; jumps and larger ledges release ground contact. The Dust II navigation cache was regenerated with this movement implementation.

`weapon-deploy.js` defines individual draw durations and action/grip profiles for all 17 firearms, plus raise motions for knife, grenade and C4. Handgun slides, bolt-rifle handles, the Nova fore-end and per-family charging handles move during drawing, with timed mechanical cues. Drawing locks firing/reloading/scoping until ready, conserves ammunition and preserves a weapon's existing cycling/chambering deadline through quick switches. AWP, SSG 08 and G3SG1 have no ordinary crosshair when unscoped; their scope overlay retains its own reticle when scoped. These remain authored browser-game animations, not extracted CS:GO animation sequences.

The buy menu groups stock into handguns, SMGs, rifles, sniper rifles, heavy weapons and grenades/equipment. Faction restrictions, prices, buy zones and deadlines still apply. Selection stays in the current category after a purchase; buying armour does not restart a draw animation.

`node tests/movement.mjs` checks real snow and Dust II inclines with both hulls, both directions, walking/running and 30/60/120 Hz updates, plus idle stability and jump release. `node tests/polish.mjs` checks all 17 draw rigs and hand contacts, actual draw lockout/ammunition/reticle transitions and every buy category for both factions. Earlier AWP side-stair, objective/bot-route, ammunition, input-focus and continuous-combat checks also pass. Validation is non-rendering; no browser visual check was performed.

## Earlier synthesized gun-report redesign

The previous iteration generated firearm waveforms locally. The field-recording update below supersedes that primary sound path; no CS 1.6 or CS:GO sound recordings are bundled or fetched. Valve's Steam Subscriber Agreement (https://store.steampowered.com/subscriber_agreement/, reviewed 2026-09-05) includes limited fan-art permissions, but we did not establish a clearly applicable permission for redistributing original game audio in this standalone browser game. This update uses the user-authorized original-audio alternative; it does not assert that all fan reuse is prohibited.

The new reports use sample-rate-correct filters, six cached variations, shorter non-tonal muzzle events, differentiated gas decay and suppressor response. Automatic actions have two brief unpitched contact sounds; bolt-action/pump handling stays on the animation timeline. The master compressor threshold is raised to preserve individual report transients while controlling overlapping voices. Audio remains self-contained with no download or decode dependency. Numerical and mocked Web Audio checks cover signal integrity and playback routing; these checks do not substitute for listening on the user's device.

## Unified uniforms, controls and varied Dust II tactics

Both factions now use matching long-sleeve tops, trousers and fitted fabric hoods, with navy/blue-grey CT and tan T colours. Visible armour, knee pads, webbing, belts, holsters, projecting pockets and large gas-mask fittings are removed. Shoes use continuous heel/instep/toe surfaces with a thin shaped sole; the rig and world scale remain articulated and approximately 1.80 m.

Settings are accessible from the main menu and pause menu. Mouse sensitivity and the separate FOV-scaled scope multiplier persist locally in this browser, with defaults, bounds and storage-failure handling. Both sniper scope levels and rifle optics use the scope multiplier. M opens a tactical-map overlay; Escape first closes settings/map/buy/radio/scoreboard, then handles pause. Opening a map/shop clears combat inputs. Expected native pointer unlocks after closing a panel cannot turn that Escape into pause; hidden tabs still pause.

Grenades queue a .42-second pull-ring animation after weapon deployment, remain held until the last held attack button is released, and only start their fuse on throwing. Quick taps finish the pin action before release. Left/right/both buttons select long/short/intermediate throws. Pause, inventory switch, death and touch cancellation cancel a held throw without consuming a grenade.

Dust II chooses random A/B objectives and rush/split/default openings each round. Four reachable approaches cover long A, short A, upper tunnels and mid-to-B. Bots vary departure delays, travel pace, strafe timing and reachable guard positions. CT support rotations use recent visible contacts reported by teammates. After planting, one CT approaches for defusal while others cover varying nearby positions. The dedicated controls test covers the actual event wiring and state transitions; the Dust II test now explicitly chooses A/B scenarios to retain reproducible physical navigation, plant and defuse coverage despite randomized production plans.

## Licensed field-recording audio

The primary reports are now 46 locally bundled, processed stereo WAV excerpts at 48 kHz, mapped to all 17 firearms, including separate MP5/M4/USP suppressor variants. Audio downloads begin during map loading; decoding and caching follow the user gesture. Failed or delayed assets use the original synthesized fallback and may retry after a later gesture. MP5-SD has an audible near-report mix rather than the previous very quiet synthesized transient. Suppressor timbres are designed from recordings, not claimed as real suppressor recordings.

The Free Firearm Sound Library is CC0 by Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney (https://opengameart.org/content/the-free-firearm-sound-library; original licence statement https://web.archive.org/web/20141217041948/http://freefirearmsfx.com/). Additional sounds are Desert Eagle .50AE shot by vabadus (https://freesound.org/people/vabadus/sounds/151071/, CC0), MP5A3 blank-firing field recording by Franki-01234 (https://freesound.org/people/Franki-01234/sounds/201667/, CC0), and glock17_02.wav by gezortenplotz (https://freesound.org/people/gezortenplotz/sounds/34982/, CC BY 3.0 https://creativecommons.org/licenses/by/3.0/). The latter three use their publicly served high-quality MP3 previews, converted for the browser. Changes include excerpt selection, highpass filtering, optional suppressor lowpass/envelope shaping, stereo narrowing, small pitch changes on documented substitutes, fade-out and level normalization. No endorsement is implied.

Exact weapon/source correspondence and substitutes are published at `dist/assets/audio/CREDITS.html`, linked from Settings. Exact excerpts, lengths and hashes are in `dist/assets/audio/manifest.json`; `tools/prepare-firearm-audio.py` reproduces the processing from the credited source downloads. AK-47, Desert Eagle and Nova have direct-model recordings; MP5, M4 and Glock use the documented related variants. Other firearms use explicitly identified same-calibre or same-category substitutes. This is not a claim to have acquired exact-model recordings for all 17 weapons. Numerical, event-adapter and physical navigation checks were run; no browser render or human/device listening check was performed.
