# Gun / Knife Sprite Sources

All images in this folder were collected from Wikimedia Commons, then normalized
with PIL (transparent background, cropped to content + 4px pad, height 256, muzzle
pointing right). License per source is listed below. Images that require
attribution are marked — use the listed author to give credit if reused.

| iconId | 来源 URL | 许可 |
|--------|----------|------|
| butterfly | https://commons.wikimedia.org/wiki/File:Balisong_open.png | CC BY-SA 3.0 (attrib: Ken Iso) |
| awp | https://commons.wikimedia.org/wiki/File:L115A3_sniper_rifle.jpg | OGL v1.0 (UK MoD / Andrew Linnett) |
| g3sg1 | https://commons.wikimedia.org/wiki/File:H%26K_G3FS.jpg | Public domain (US ATF) |
| ak47 | https://commons.wikimedia.org/wiki/File:AK-47_assault_rifle.jpg | Public domain |
| m4a4 | https://commons.wikimedia.org/wiki/File:M4A1-flattop.png | Public domain (US Gov / PEO Soldier) |
| m4a1s | https://commons.wikimedia.org/wiki/File:PEO_M4_Carbine_RAS_M68_CCO.png | Public domain (US Army / PEO Soldier) |
| p90 | https://commons.wikimedia.org/wiki/File:FN_P90_Standard_Submachine_Gun_Right_Side.jpg | CC BY-SA 2.0 (attrib: FN Herstal) |
| mp5 | https://commons.wikimedia.org/wiki/File:Heckler_Koch_MP5.jpg | Public domain (MP5 SD3 suppressed) |
| ump45 | https://commons.wikimedia.org/wiki/File:HKUMP45.JPG | CC BY-SA 3.0 (attrib: Asams10) |
| mac10 | https://commons.wikimedia.org/wiki/File:MAC10.jpg | Public domain |
| glock | https://commons.wikimedia.org/wiki/File:Glock_17_(transparent_background).jpg | Public domain (US ATF) |
| deagle | https://commons.wikimedia.org/wiki/File:Desert-Eagle-p1030134.jpg | CC BY-SA 2.0 fr (attrib: Rama) |
| p250 | https://commons.wikimedia.org/wiki/File:Sig_Sauer_P320_X-Carry_Danish_Configuration-removebg-preview.png | CC0 |
| fn57 | https://commons.wikimedia.org/wiki/File:FN_Five_Seven.jpg | Public domain (US ATF) |

## Attribution required (CC BY-SA / OGL)
- **butterfly / karambit / ump45 / deagle**: CC BY-SA license — credit the authors above.
- **awp**: OGL v1.0 (UK Open Government Licence) — credit UK Ministry of Defence / Andrew Linnett.

## Notes
- **karambit / usp**: sourced images were rejected in visual review (wireframe render /
  diagonal photo with loose bullets). These two render with the hand-drawn vector
  icon instead (see src/games/gachaWeaponIcons.ts).
- **karambit** was rendered to PNG from `Karambit_knife_icon.svg` (cairosvg) because a
  clean public-domain side-view karambit photograph was not available; the result is a
  clean CC BY-SA silhouette.
- **m4a1s**: indexed as "M4A1-S" (suppressed); a clean public-domain suppressed-M4
  image was not available, so it uses a distinct M4A1 carbine variant (PEO Soldier image)
  as the fallback the task allows. **m4a4** uses `M4A1-flattop.png`.
- **usp**: suppressed-USP variant was not available as a clean public-domain asset; uses
  the public-domain HK USP .45 (Federal-side profile). Right/left orientation is heuristic.
- **mp5**: the source is the **MP5 SD3** (integrally suppressed), matching the icon intent.
