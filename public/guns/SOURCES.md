# CS2/CS:GO SVG Silhouettes

Every SVG in `public/guns/svg/` is an auto-traced vector silhouette generated
from official Counter-Strike 2 / CS:GO inventory art:

- Guns: Counter-Strike Wiki files named `CS2 <weapon> Inventory.png`
  (official Valve renders presented by the wiki).
- Butterfly Knife / Karambit: Valve vanilla inventory images from the Steam
  economy CDN.

Generation: alpha channel threshold → boundary tracing → RDP path simplification
→ a single even-odd SVG path with steel gradient, dark outline, and highlight.
The UI ships only these SVG paths; no raster photos are embedded. Monochrome
variants are produced at runtime from the same SVG alpha mask (`source-in` tint),
not grayscale conversion.
