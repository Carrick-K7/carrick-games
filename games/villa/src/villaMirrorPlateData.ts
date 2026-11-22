// Bootstrap for the first pinned capture. A missing plate must leave the real silver, not synthetic room art.
import type { MirrorRoom } from './villaMirrorPlateLayout.js';
export const VILLA_MIRROR_SOURCE_SHA256: string = '';
export const VILLA_MIRROR_PLATES: Readonly<Record<MirrorRoom,string>> = { master:'', dressing:'', ensuite:'', bath:'', gym:'' };
