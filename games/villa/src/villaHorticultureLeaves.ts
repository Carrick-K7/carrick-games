import { NatureMesh, add3, polar, type P3 } from './villaNatureGeometry.js';
import { leafUV } from './villaHorticultureAtlas.js';

// Distances and widths along the midrib: the aubergine has real sinuses, the
// tulip a long waxy strap and the rose compound leaves on a separate rachis.
const outlines = {
  egg: [[.13,.40],[.28,.95],[.42,.74],[.55,1],[.69,.70],[.78,.74],[.91,.29]],
  leaflet: [[.25,.85],[.46,1],[.70,.61]],
  strap: [[.16,.73],[.41,1],[.68,.87],[.85,.42]],
  ovate: [[.15,.62],[.38,1],[.62,.89],[.78,.60]],
  spear: [[.25,.76],[.68,1]],
} as const;
export interface Lamina {
  shape: keyof typeof outlines; chart: number; phase: number; reach: number; rise: number; width: number;
  /** Vertical arch and outward bow in metres. Either may turn back before the tip. */
  arch: number; belly?: number; cup?: number; twist?: number; shade?: number; sweep?: number;
}
const broad = [-1, -.49, 0, .48, 1], narrow = [-1, 0, 1];
/** A thin contiguous lamina with a bent midrib, two shoulders and curled rim.
 * Split rows follow both the transverse section and the arc into the leaf tip;
 * a single triangle fan with a raised centre makes wedge-shaped lettuce. */
export function addLamina(m: NatureMesh, root: P3, leaf: Lamina) {
  const { phase: a, chart, width, rise, reach, arch, shape } = leaf, belly = leaf.belly ?? 0;
  const f = Math.cos(a), g = Math.sin(a), wide = shape === 'egg';
  // Broad solanum leaves need transverse shoulders around the central crease.
  const sides = wide && width > .051 ? broad : narrow, cols = sides.length, tone = leaf.shade ?? 1;
  let prev: number[] = [m.point(root, tone * .70, leafUV(chart, 0, 0))];
  for (const [t, w] of outlines[shape]) {
    const arc = Math.sin(t * Math.PI), tilt = Math.cos(t * Math.PI) * Math.PI, forward = t * reach + arc * belly;
    const slope = Math.atan2(rise + tilt * arch, reach + tilt * belly), sn = Math.sin(slope), cs = Math.cos(slope);
    const roll = (leaf.twist ?? .24) * (t - .17), cr = Math.cos(roll), sr = Math.sin(roll);
    const next = sides.map(s => {
      const edge = Math.abs(s), wing = (s < 0 ? -.62 : .38) + a;
      const corrugation = Math.sin(18 * t + wing * 2) * Math.cos(5 * t + wing);
      const scallop = (wide ? .042 : .035) * corrugation;
      const lateral = width * (w * s * (1 + scallop * edge) + arc * (leaf.sweep ?? .085) * Math.sin(a * 2));
      const rib = Math.max(0, 1 - 2.4 * edge) * .061;
      const crimp = wide ? edge ** 2 * .19 * corrugation : .035 * s * Math.sin(12 * t + a);
      const up = w * width * (rib + edge ** 1.6 * (leaf.cup ?? -.18) + crimp);
      const across = lateral * cr - up * sr, normal = lateral * sr + up * cr;
      const dx = forward - normal * sn + (wide ? scallop * width * edge * arc : 0);
      const p: P3 = [root[0] + f * dx - g * across, root[1] + rise * t + arch * arc + cs * normal, root[2] + g * dx + f * across];
      return m.point(p, tone * (.77 + .23 * t + .04 * arc + .047 * (1 - edge)), leafUV(chart, s, t));
    });
    for (let k = 0; k < cols - 1; k++) {
      if (prev.length === 1) m.tri(prev[0], next[k + 1], next[k]);
      else { m.tri(prev[k], prev[k + 1], next[k]); m.tri(prev[k + 1], next[k + 1], next[k]); }
    }
    prev = next;
  }
  const tip = add3(root, polar(a, reach, rise)), end = m.point(tip, tone * .97, leafUV(chart, 0, 1));
  for (let i = 0; i < cols - 1; i++) m.tri(prev[i], prev[i + 1], end);
  return tip;
}

/** A hand-width compound leaflet has a deeply cut unequal margin on each
 * side of the curved rib. Spend corners on the lobes, not its thin underside. */
export function tomatoLeaflet(m:NatureMesh, root:P3, a:number, length:number, y:number, width:number, shade:number, chart:number) {
  const f=Math.cos(a),g=Math.sin(a),twist=.30*Math.sin(2.3*a);
  const point=(t:number,s:number,w:number,k:number)=>{
    const shift=s*width*w,arch=.18*length*Math.sin(Math.PI*t),sweep=.032*length*Math.sin(t*Math.PI+a)*t;
    return m.point([root[0]+f*t*length-g*(shift+sweep),root[1]+y*t+arch+shift*twist-.21*Math.abs(shift)+k*width,
      root[2]+g*t*length+f*(shift+sweep)],shade*(.86+.17*t+.035*(1-Math.abs(s))),leafUV(chart,s,t));
  };
  const base=point(0,0,0,0),mid=point(.50,0,0,.065),tip=point(1,0,0,0);
  for(const side of [-1,1]) {
    const outline=[base,point(.25,side,.78,0),point(.42+side*.037,side,1,0),point(.53+side*.023,side,.68,0),point(.68,side,.77,0),tip];
    for(let i=0;i<outline.length-1;i++) {
      if(side<0)m.tri(mid,outline[i+1],outline[i]); else m.tri(mid,outline[i],outline[i+1]);
    }
  }
}

/** Butter lettuce heads aren't five pointed blades around a stem. Each outer
 * wrapper spreads across a sector of the crown; the next leaves describe a
 * bowl and roll back across the opening. A scalloped transverse END ROW (not
 * a pole) gives the thin, broad hems their folded, overlapping silhouette. */
export function butterLeaf(m: NatureMesh, root: P3, az: number, size: number, whorl: number, chart: number, shade: number, stage: number) {
  const cols = whorl === 2 ? [-1,-.41,.34,1] : broad;
  const loosen = 1-stage, radial = size * [.225, .145+.045*loosen, .084+.019*loosen][whorl] * (1 + .154*Math.sin(2.71*az));
  const lift = size * [.087, .111+.025*stage, .123+.035*stage][whorl] * (1 + .21*Math.cos(1.32*az));
  const reach = [1.33,2.21-.42*loosen,2.84+.18*stage][whorl], spread = [.76,.94,1.05][whorl];
  const rows = whorl === 2 ? [.29,.54,.81,1] : [.22,.44,.66,.84,1];
  const handed = .51*Math.sin(az*1.73) + .21, roll = .65*Math.sin(az+whorl*1.27);
  let prev=[m.point(root,shade*.66,leafUV(chart,0,0))], before: number[] = [0];
  for(const t of rows) {
    // Spend the extra points on the wavy distal edge, not on flat interior.
    const line = t===1 ? [-1,-.82,-.57,-.32,-.10,.14,.39,.65,.85,1] : cols;
    const next=line.map(s=>{
      const edge=Math.abs(s),hem=t**3,shoulder=Math.sin(t*2.16);
      const tuck=t-(.216+.058*Math.sin(az+1.7*s))*hem*edge**1.75;
      const crimp=Math.sin(23*t + az + 2.3*s)*Math.sin(6.4*t+.73*az+3.1*s), ripple=edge**1.7*shoulder*crimp;
      // Each leaf turns to one side as it grows: its shoulder tucks underneath
      // the neighbour, while its opposite edge unfolds OUT of the crown. This
      // keeps a whorl from becoming several co-spherical, intercutting shells.
      const r=radial*Math.sin(reach*tuck) + size*((.010+.011*whorl)*edge*edge*shoulder + .016*ripple + s*roll*.027*t);
      const a=az + spread*s*Math.sin(Math.min(1,t*1.66)*Math.PI/2)*(1-.205*hem+.080*crimp) + (.20+handed)*t*t;
      const y=whorl===0 ? lift*(tuck*.66 + Math.sin(tuck*Math.PI)*.75) : lift*(tuck+.15*Math.sin(tuck*Math.PI));
      const rim=size*(.021*ripple + hem*(.012*Math.sin(14*s+az) + .006*Math.cos(27*s-az)) + .036*s*t*roll + .009*shoulder*(1-edge));
      const p:P3=[root[0]+Math.cos(a)*r,root[1]+y+rim,root[2]+Math.sin(a)*r];
      return m.point(p,shade*(.72+.26*t+.045*(1-edge)+.048*ripple),leafUV(chart,s,tuck));
    });
    if(prev.length===1) for(let j=0;j<next.length-1;j++)m.tri(prev[0],next[j+1],next[j]);
    else {
      let i=0,j=0;
      while(i<prev.length-1 || j<next.length-1) {
        if(i<prev.length-1 && (j===next.length-1 || before[i+1]<=line[j+1])) {m.tri(prev[i],prev[i+1],next[j]);i++;}
        else {m.tri(prev[i],next[j+1],next[j]);j++;}
      }
    }
    before=line; prev=next;
  }
}

/** The rachis and lace-like divisions of a carrot leaf. These narrow facets
 * are intentionally not closed lancets made of eight triangles apiece. */
export function sliver(m: NatureMesh, at: P3, mid: P3, end: P3, half: number, shade = .97) {
  const dx = end[0] - at[0], dz = end[2] - at[2], n = Math.hypot(dx, dz) || 1;
  const offset: P3 = [-dz * half / n, half * .31, dx * half / n];
  const a = m.point(at, shade * .80), b = m.point(add3(mid, offset), shade), c = m.point(end, shade * 1.07);
  const d = m.point([mid[0] - offset[0], mid[1] - offset[1], mid[2] - offset[2]], shade * .94);
  m.tri(a,b,d); m.tri(b,c,d);
}
