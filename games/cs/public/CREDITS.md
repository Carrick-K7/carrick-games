# Carrick CS v28 port provenance

This Carrick module/asset port adapts the user-provided `CS-v28-project.zip`, original standalone source revision `64a254be2dcb606f028bc4c9f64a1dd1ae71f3a5`. The uploaded archive is provenance, not a runtime dependency.

The following historical attribution, source links and audit descriptions are retained from upstream. Upstream validation statements are **not Carrick port verification or deployment evidence**. The companion `WEAPON_AUDIT.md` is likewise an upstream audit. Original map licensing and provenance remain included below and in `assets/`.

Carrick resolves all resources through each host instance's immutable release `assetUrl` closure; character assets are URL-keyed and explicitly leased to that instance. Runtime Three.js and its GLTF/Skeleton addons come from Carrick's declared `three` dependency, not copied `dist/vendor/` modules; the upstream r180 references below are historical. See `THREE-LICENSE.txt`.

Asset paths shown as `dist/assets/...` below correspond to `assets/...` beside this file in the Carrick release. Source scripts and test names below refer to the original standalone project, not installed Carrick commands. The current bank contains 154 original CS:GO WAVs, whose rights remain with Valve/respective owners; provenance is not a permissive redistribution licence. Quaternius body/hand/animation resources retain their included CC0 notices.

---

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

Original JavaScript gameplay, authored player meshes and most weapon meshes, interface, CS:GO firearm recordings with original-project UI and movement effects, snow particles, and mountain scenery. AK-47, Desert Eagle, P90, MP5-SD and SSG 08 use processed Valve CS:GO Workbench geometry with authored materials and animation rigs; see the visual reference section below. Gameplay includes first-person movement with acceleration and counter-strafing, jumping, crouching, silent walk, hitscan weapons, authored per-weapon recoil paths, movement inaccuracy, headshots, armour, magazines, reload, original weapon pickups, automatic primary pickup when the slot is empty, HE grenades, collision-aware bot navigation, friendly-fire prevention, elimination rounds, persistent round corpses, spectating, scoreboards, pause/resume, touch input, and first-to-seven matches.

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

Earlier clothing and pose references were Valve's [SAS update](https://blog.counter-strike.net/2016/12/17343/) and [Phoenix update](https://blog.counter-strike.net/2017/03/18185/). The current appearance follows the user's supplied character sheet: top-row first figure for the CT olive uniform and bottom-row third figure for the T arctic camouflage. CT has an olive helmet with close-fitting goggles; T has an open winter hood. Both have an authored continuous face surface with brows, nose, cheeks and jaw, replacing the solid fabric head and narrow eye slits. The CT goggles cover the eyes while leaving the lower face exposed. At the user's request, armour is a gameplay statistic: visible armour plates, shoulder webbing, radio antenna, backpack, knee pads and rear belt pouches remain absent. Shallow stitch outlines, a zipper and shoulder seams follow the clothing surface. Character geometry, cloth weave, camouflage, rig and animation are authored here; original Valve character models and textures are not included.

AK-47 and Desert Eagle geometry comes from Valve's public [CS:GO Workshop resources](https://www.counter-strike.net/workshop/workshopresources), specifically [workbench_materials.zip](https://media.steampowered.com/apps/csgo/workshop/workbench_materials.zip?v=103), retrieved 2026-09-05. Geometry remains copyright Valve and is not claimed to be CC0, MIT or an original mesh. The delivered indexed data retains the 2013 CS:GO shape: 13,069 triangles for AK-47 and 8,591 for Desert Eagle. `tools/convert-reference-weapons.py` converts OBJ units/axes and partitions the detachable magazine, bolt, fixed barrel and reciprocating slide. No Valve animation was imported by this model update; firearm audio attribution is documented in the CS:GO audio section below. Materials are authored dark steel/wood grain and brushed silver/checkered rubber, following Valve's default inventory renders. The former procedural Desert Eagle prototype is superseded by this reference geometry.

The earlier synthesized firearm bank is now superseded by the original CS:GO sound bank documented below. Distance filtering, stereo positioning and a master limiter remain part of the playback system.

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

## Earlier synthesized gun-report redesign (superseded)

Earlier releases generated firearm reports in `audio-synthesis.js`. The active audio engine no longer imports it or falls back to generated gun reports. Non-firearm interface and movement cues remain authored effects.

## Unified uniforms, controls and varied Dust II tactics

Version 13 introduced matching long-sleeve tops, trousers and fitted fabric hoods, with navy/blue-grey CT and tan T colours. The reference-sheet appearance below supersedes those colours and closed hoods. Visible armour, knee pads, webbing, belts, holsters, projecting pockets and large gas-mask fittings remain removed. Shoes use continuous heel/instep/toe surfaces with a thin shaped sole; the rig and world scale remain articulated and approximately 1.80 m.

Settings are accessible from the main menu and pause menu. Mouse sensitivity and the separate FOV-scaled scope multiplier persist locally in this browser, with defaults, bounds and storage-failure handling. Both sniper scope levels and rifle optics use the scope multiplier. M opens a tactical-map overlay; Escape first closes settings/map/buy/radio/scoreboard, then handles pause. Opening a map/shop clears combat inputs. Expected native pointer unlocks after closing a panel cannot turn that Escape into pause; hidden tabs still pause.

Grenades queue a .42-second pull-ring animation after weapon deployment, remain held until the last held attack button is released, and only start their fuse on throwing. Quick taps finish the pin action before release. Left/right/both buttons select long/short/intermediate throws. Pause, inventory switch, death and touch cancellation cancel a held throw without consuming a grenade.

Dust II chooses random A/B objectives and rush/split/default openings each round. Four reachable approaches cover long A, short A, upper tunnels and mid-to-B. Bots vary departure delays, travel pace, strafe timing and reachable guard positions. CT support rotations use recent visible contacts reported by teammates. After planting, one CT approaches for defusal while others cover varying nearby positions. The dedicated controls test covers the actual event wiring and state transitions; the Dust II test now explicitly chooses A/B scenarios to retain reproducible physical navigation, plant and defuse coverage despite randomized production plans.

## Earlier field-recording audio (superseded)

The former 46 processed firearm excerpts have been removed from the active asset directory. Earlier releases credited The Free Firearm Sound Library by Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney (CC0, https://opengameart.org/content/the-free-firearm-sound-library), Desert Eagle by vabadus (CC0, https://freesound.org/people/vabadus/sounds/151071/), MP5A3 by Franki-01234 (CC0, https://freesound.org/people/Franki-01234/sounds/201667/), and Glock 17 by gezortenplotz (CC BY 3.0, https://freesound.org/people/gezortenplotz/sounds/34982/). `tools/prepare-firearm-audio.py` remains an archival converter for that older bank; use `tools/import-csgo-audio.py` for the current one.

## Reference-sheet character appearance

The CT olive helmet, goggles, exposed facial features and jacket collar, and the T open arctic hood and matching snow-camouflage clothing, follow the two figures selected by the user. Camouflage is a shared deterministic 256 × 256 local DataTexture with mipmaps and metre-scaled clothing UVs; it needs no network request or image decoding and does not modify map materials. Gloves and boots retain the fitted shapes and articulated arm/knee rig. The existing geometry checks cover standing height, sole contact, hand/forearm alignment and weapon attachment. A separate offline geometry render is used to inspect the authored clothing and head shapes; it is not a browser screenshot or a replacement for device testing.

## Free rigged CT and T characters

The characters adapt **Quaternius Universal Base Characters, Standard** and **Universal Animation Library, Standard**. The two downloaded free packs include CC0 1.0 licence statements, copied into `dist/assets/characters/LICENSE-Quaternius.txt`. Official sources: https://quaternius.com/packs/universalbasecharacters.html and https://quaternius.itch.io/universal-animation-library. The actual free character pack contains the Superhero male/female bodies. These game characters adapt its male mesh; no purchase, subscription or paid generation service was used.

CT wears a navy uniform and an open helmet. T has an exposed textured face, the pack's short parted hair, a khaki shirt with rolled cuffs, brown cargo trousers and brown boots. Both use smoothed continuous garment shells, a close-fitting soft vest and shallow details with inherited skin weights. Trouser calves are less flared. This remains a simplified game-ready interpretation of the user's reference, not Valve character assets or a claim of photographic fidelity.

Each locally bundled GLB has 65 bones and eight selected clips. CT is 3,069,876 bytes / 16,618 triangles / nine body material draws; T is 3,135,872 bytes / 17,971 triangles / nine draws. Skin textures are 1024 px, eyes 256 px and brows/hair 512 px. Geometry, textures and clips are shared within each team, with independent bones and mixers for each actor. Both files preload together before a match. A failed team download retains that team's procedural fallback, without discarding the other loaded model. Map textures are unchanged.

Version 16 replaces the source library's exaggerated ground locomotion with a restrained directional gait: narrow foot spacing, a planted portion of each step, low foot clearance, limited torso bounce and shoulder protraction. Crouch and airborne clips retain the library's lower-body motion with a stabilized upper chest and forward gaze. Two-bone IK preserves limb lengths. Both teams use the retained one-shot fall, independent corpse poses and living-pose reset on respawn. T planting and CT defusing use crouched poses.

Third-person firearms now align their measured rear stock with the actor's right shoulder, instead of sharing the old fixed origin. Long guns have separate support contacts on the rear fore-end; first-person firearm grip geometry is unchanged. Magazine/charging animations pivot around the shoulder and move slightly outward for clearance. Arm IK and anatomical finger flex follow these contacts. The firearm contact test covers both teams, standing/crouched poses and reload/deploy/cycle states, including world translation and rotation. It checks a central torso volume and the shoulder rear plane, in addition to palm reach; this is bounded geometric coverage rather than a claim that no mesh can ever intersect in any situation.

`tools/prepare-character-sample.py BASE.zip ANIMATIONS.zip ct` and the same command ending in `t` reproduce the two assets with Python, NumPy and Pillow. Three.js r180 GLTFLoader, SkeletonUtils and BufferGeometryUtils are vendored with their existing MIT licence and adjusted local import paths. `tests/characters.mjs` covers both shipped rigs, shared resources, independent skeletons, floor contact, crouching, grip reach, retained falls and resets. `tests/character-poses.mjs` adds 400 weapon/body contact samples, directional gait checks and karambit animation reset checks. Gameplay, firearm and Dust II tests run with both rigs preloaded. Side/front geometry is also inspected with an offline renderer; this update does not include a live browser or device render test.

## Karambit game model

The knife slot now displays **Karambit**. Its original authored geometry has an open index ring, a shaped dark handle, fasteners and a separately bevelled curved blade. The ring pivot animates on draw and inspection, then returns to the reverse grip; light slashes and heavy stabs use separate deterministic motion curves. Existing attack keys, range, damage and cooldown rules remain in place. The broad shape and reverse-grip convention reference Valve's Steam listing: https://steamcommunity.com/market/listings/730/G18FB033003. No Valve model, texture or animation file was copied.

## Weapon and ankle repairs (2026-09-06)

P90, MP5-SD and SSG 08 now use their distinct geometry from the same public CS:GO Workbench archive cited above (15,907, 22,170 and 13,553 triangles respectively). Copyright remains Valve; this is not a permissive asset licence. Materials, rigging and motion are authored here. The original AWP model is separate. Shape cross-checks: https://fnherstal.com/en/defence/portable-weapons/fn-p90/ ; https://www.heckler-koch.com/en/Products/Military%20and%20Law%20Enforcement/Submachine%20guns/MP5 ; https://www.steyr-arms.com/en/military-law-enforcement/sniper-and-marksman-rifles/ssg-08/ .

The AK magazine's thirteen disconnected internal detail shells now follow the magazine rather than remaining on the receiver during reload. Its rocking motion uses a local upper attachment pivot. Four first-person firearms reuse the shipped CC0 anatomical glove rig. AK support contacts lie under the wooden fore-end, with no added vertical foregrip; soldier finger flexion uses the anatomical joint axis.

CT/T trousers now have a cut hem, and boot shafts align with the source calf instead of the shoe midpoint. Upper collars follow the calf and lower shafts blend into the foot. Both teams retain the previous clothing materials.

Karambit inspection limits the index hook flexion independently from the other fingers to prevent the handle crossing the palm. Draw, catch and recovery timing is authored against the previously cited CS:GO gameplay reference clips; attacks use separate light/heavy trajectories. No original animation files are imported and exact motion equivalence is not claimed.

## Classic knife appearance

The CS 1.6 style straight knife is an authored mesh with a clipped blade, short toothed spine, separate cutting bevel, compact guard and inset handle scales. Its draw, slashing, stabbing and restrained F inspection are authored for this browser game; original Valve meshes, textures and animation files were not imported for this knife. The existing CC0 anatomical hand rig is reused. Visual reference: https://all-cs.ru/cs16/maps/de/de_dust2_largo_ma_medio.html ; series reference: https://blog.counter-strike.net/2019/10/25884/ .

## Reference gun shapes and handling (2026-09-17)

SG 553, AUG and MAC-10 now use the corresponding geometry in Valve's public CS:GO Workbench archive linked above, retrieved again on 2026-09-17: 12,944, 21,355 and 8,759 triangles respectively. The five previously converted weapon records are unchanged. Original geometry remains copyright Valve. Surface materials, disconnected-shell partitioning, hand contacts and animation are authored here; no original animation tracks or additional texture downloads are introduced. The SG 553 has its rail fore-end and folding-stock silhouette, AUG has the rear magazine and vertical foregrip, and MAC-10 has its compact receiver, folded stock, long grip-fed magazine, front strap and top cocking knob.

All 17 firearms now have separate action contact, stroke and release timings. Charging hands follow the visible part with a curved approach and an action-specific wrist orientation; the spring-driven return is separate from the hand's return. AWP and SSG 08 unlock, pull, push and lock in order, with separate strokes and knob contacts. Non-reciprocating charging handles remain stationary during normal fire. Empty reloads use the same operating side as each weapon's draw, and XM1014 does not pump between shots. Mechanical audio events and visible motion share phase boundaries. Existing ammunition, deploy lockout and firing deadlines remain enforced.

Reference viewing was attempted at https://www.youtube.com/watch?v=G9IGkISMV30 (login/bot-verification block), and accessible CS:GO footage was opened at https://www.bilibili.com/video/BV1Fa4y1K7Lu/ and https://www.bilibili.com/video/BV1pw411Q76D/ . Only sampled frames were inspected: complete frame-for-frame equivalence with Valve's animations is not claimed. The reference meshes establish component positions, not original animation timing.

Validation: `tests/weapon-handling.mjs` checks locking order, visible-mesh hand contact, distinct strokes, reset and reciprocation; `tests/polish.mjs` and `tests/weapons.mjs` exercise actual switch/fire/reload states. `tests/character-poses.mjs` covers 400 CT/T weapon/body samples, including standing and crouching, with maximum idle grip error 20.6 mm. AUG's shoulder placement and MAC-10's compact stance were adjusted to keep both hands within reach. `tests/model-repairs.mjs` protects the earlier magazine and ankle fixes, and `tests/recorded-audio.mjs` verifies the existing original audio files. `tests/render-weapon-handling.mjs` supplies offline geometry/pose images for all firearms; those images are not a production PBR render or a live-browser playtest.

## CS:GO firearm audio

At the user's explicit request, the active bank now contains 112 original CS:GO WAV files from the community extraction at https://github.com/sourcesounds/csgo, pinned to commit `08f1bd6835d4f510d2ccaedeab6bb9f637b388ab`. Copyright remains with Valve/the respective rights holders. These audio assets are not claimed to be CC0, MIT, independently authored recordings, or an official Valve distribution. Original-game identity is based on the extraction repository; source-byte identity is verified against its Git blob hashes, not against a separately installed Steam depot.

`tools/import-csgo-audio.py` verifies the pinned Git blob for each source file before copying it without alteration. `dist/assets/audio/manifest.json` records the exact source URL, commit, blob hash, SHA-256, sample rate, duration and playback gain for every asset. The settings screen's existing sound-credit link lists the actual firearm/file mapping.

All 17 firearms use their own CS:GO family: internal `m3`, `scout`, `sg552`, `tmp` map to Nova, SSG 08, SG 553 and MP9. The MP5-SD uses `mp5/mp5_01.wav`; no MP5A3 blank recording or another weapon substitute remains in the active bank. M4A1-S and USP-S have distinct suppressed/unsuppressed recordings. Playback preserves original pitch and local timbre; per-file gain balances loudness, with a .21 RMS target over the MP5-SD's first 100 ms before master gain. Distance filtering applies only to remote shots.

Original draw, magazine, shell, pump and bolt files follow the existing action timeline. Combined action recordings play once rather than layering synthetic lift/lock clicks. The first 26 downloads are the complete firing bank, followed by 86 handling files. Fetch/decode failures retry, and no synthetic gun report is substituted. Gunshot WAVs total approximately 13.2 MB including all handling sounds.

Validation covers source hashes, PCM structure, weapon/mode routing, MP5 audibility, 24 overlapping voices, source pitch, cleanup, muted playback, download/decode deduplication, failure/recovery, and existing weapon-animation/ammunition rules. This is programmatic validation, not a claim of human listening or device-specific browser audio QA.


## Gameplay and presentation refinement (2026-09-19)

XM1014, M4A1-S and USP-S now use their own geometry from the same Valve CS:GO Workbench archive (https://www.counter-strike.net/workshop/workshopresources), fetched on 2026-09-19. The converted meshes contain 19,496, 23,704 and 12,000 triangles. The eight existing imported weapon records are unchanged. XM1014 has a fixed fore-end, reciprocating bolt, tubular magazine and a separate loading-shell prop. M4A1-S/USP-S have independently removable suppressors with matching bare/suppressed muzzle contacts. Materials and animation remain authored here.

Firearm hands now fit the palm surface and knuckle roots together before skin binding. Their left-hand frame no longer mirrors an already mirrored anatomical mesh. Finger curl differs between support/trigger/manipulation grips; forearms retain a fixed length and distribute wrist turns into the elbow. The two knife grip rigs retain their existing bind geometry. The grounded gait matches planted-foot travel to actor speed, adds low heel-to-toe roll and restrained weight transfer, and eases start/stop and heading changes. The approved CT/T body mesh and texture files are unchanged.

Dust II openings now assign anchors, entry players, pushers, flankers and rotating players. Available CT bots retain an anchor for each site, including a four-bot CT team. Visible combat can advance during an unfinished opening; weapon range and reload state affect closing distance and short firing plants. Recent sighting searches expire. TDM teams cross the map and search reachable junctions instead of parking at bombsites. These decisions do not use hidden enemy positions. Bombsite, navigation hull and objective rules are retained.

Initial pistol, knife, quality, sensitivity and optional hit feedback now share the settings dialog and versioned browser preferences. Initial-pistol changes apply on the next loadout assignment, preserving defusal purchase cost and survivor inventory. Hit feedback has off/visual/full choices, separate body/head/kill marks, and one sound per trigger pull, including shotgun pellets. Round-end firearm/knife and reload inputs keep normal readiness/ammo rules; the round result cannot be awarded twice.

Nine source-identical WAVs were added to the same pinned sourcesounds/csgo revision: knife/knife_deploy1.wav; player/kevlar1–3.wav; player/headshot1–2.wav; radio/ctwin.wav, terwin.wav and rounddraw.wav. The bank now has 121 files. Original 8-bit radio PCM is retained without conversion. All 112 existing firearm records and playback gains are unchanged. Electronic hit beeps and round melodies were replaced. The body-kill sound is this game's mapping of an original impact recording, not a claim that CS:GO had a separate kill-confirmation sample.

Karambit draw reference was played and paused in the browser at https://i.makeagif.com/media/8-02-2015/izMVLN.mp4 (linked source: https://makeagif.com/gif/karambit-marble-fade-fire-ice-izMVLN), with sampled frames at 0.81, 1.12, 1.26, 1.53 and 2.01 seconds. The wrist remains oblique through the ring flick, raises into the frame and settles into the retained reverse grip after the catch. A second existing 2016 clip was opened at https://i.makeagif.com/media/4-27-2016/vv04xi.mp4. This is authored motion based on sampled reference frames, not original animation data or frame-exact reproduction.

Validation: real gameplay fire/reload/readiness and round-end tests; persisted controls and feedback modes; randomized reachable Dust II roles/routes and physical A/B planting/defusing; 714 firearm hand poses; 400 CT/T weapon contacts; 804 karambit poses; original audio hashes and playback routing; CT/T planted-foot travel, stable gaze and stop transitions. Offline geometry frames were inspected for the new guns, hands, draw and both team gaits. No production PBR/browser full-match or human-listening validation is claimed.


## Butterfly knife, Nova and SMG sound revision (2026-09-19)

- Butterfly Knife: original authored, articulated geometry and animation inspired by CS:GO; not an extraction of Valve's animation tracks. Separate safe handle, blade hinge and bite-handle hinge; twin steel liners, open channels, drilled holes, grip inlays, pivot screws, latch, clipped blade, bevel and fuller. Forward closed attack grip; folded draw, staged handle catch and a two-part flip/inspection. The default remains the classic knife.
- Visual references actually examined: [CS:GO inspection screenshot](https://steamcommunity.com/sharedfiles/filedetails/?id=3025184091), [CS:GO Butterfly Knife Fade animation](https://steamcommunity.com/sharedfiles/filedetails/?id=931321295). The latter's 832×468 GIF has 35 frames over 2.45 seconds; its fan hold, flipping sequence and regrip were inspected frame by frame. [Dailymotion slow-motion reference](https://www.dailymotion.com/video/x3ykh9i) was located, but its browser player returned a playback/network error; it was not treated as successfully watched. Reference media is not shipped in the game.
- Nova: 19,260 triangles from Valve's public [CS:GO Workbench resources](https://www.counter-strike.net/workshop/workshopresources), `nova.obj`. The existing eleven reference weapon records are retained byte-for-byte. Original silhouette with black polymer receiver/stock and long ribbed pump; independently rigged fore-end and exposed bolt, stationary barrel/tube and shell-by-shell loading.
- Audio remains byte-identical to `sourcesounds/csgo` revision `08f1bd6835d4f510d2ccaedeab6bb9f637b388ab`. MP9 now uses `mp9_01` through `mp9_04`; MAC-10 uses `mac10_01` through `mac10_03`, replacing the old `*-1` single samples. Butterfly handling uses `bknife_draw01`, `bknife_look01_a/b`, `bknife_backstab01/02` and `knife_slash1/2`. Full sources and hashes remain in `dist/assets/audio/manifest.json`; 133 active WAVs. Copyright remains with Valve/respective owners.
- Verification: 404 butterfly draw/inspect/slash/stab samples, blade/hand intersections, fixed hinge distance, anatomical wrist bounds, action resets and 16:9/4:3 inspection framing; real game settings, deploy lock, HUD names, persistence, inspect sound timing and attack/switch cancellation; Nova pump/bolt/barrel and loading-shell contact; existing classic/karambit and CT/T weapon contacts. Offline geometry renders were reviewed. MP9 and MAC-10 30-round sample mixes at their game rates stay below full scale before the limiter (master-scaled peak 0.476 / 0.514). No claim of a live browser full-match test, subjective listening test or exact proprietary animation reproduction.

## Complete firearm reference audit and utility handling · 2026-09-19

All 17 firearms now use their corresponding Valve CS:GO Workbench geometry, with this project’s materials, rig partitioning and authored animation. This update replaces the remaining M249, Glock-18, AWP, G3SG1 and MP9 simplified meshes. The 12 previously imported geometry records are unchanged. See [WEAPON_AUDIT.md](WEAPON_AUDIT.md) for the per-firearm table and validation limits.

The pinned original recording bank now contains 154 WAV files, including 44 firing variants and original HE grenade handling, bounce and explosion sounds. Files remain byte-identical to the cited source revision. Butterfly actions are reconstructed from the accessible CS:GO frame references, not original Valve animation tracks; complete parity across original random variants has not been established. HE trajectories and timing are adapted to this game’s metre-based map scale.
