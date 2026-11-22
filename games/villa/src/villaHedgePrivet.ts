import * as THREE from 'three';
import type { FurnitureKit } from './villaFurnitureForms.js';
import { NatureMesh, add3, collar, mix3, polar, stemAtHeight, type P3 } from './villaNatureGeometry.js';
import { newTip, plantSeed, plantSurface, prepareShootFinish, ShootRanks } from './villaHedgeShoots.js';

/** A clipped parcel of old privet, grown from four staggered stools along the
 * border. Each fans out into shoulder wood carrying short decussate shoots;
 * the shears set their ends, not an opaque support surface under the leaves. */
export function prunedPrivet(k: FurnitureKit, halfWidth: number, height: number, variant: number, finish: THREE.Material) {
  const { m, put } = k, random = plantSeed(variant + .71), bark = new NatureMesh(), tips = new NatureMesh();
  const ranks = new ShootRanks('privet'), bias = random() - .5, color = finish === m.leaf ? 0 : 1;
  prepareShootFinish(m.leafLight, 'privet');
  function shoot(a: P3, b: P3, width: number) {
    const roll = random() * 6.28;
    ranks.shoot(a, b, width, roll, (color + Math.floor(random()*3)) % 4);
  }
  for (let i = 0; i < 4; i++) {
    const z = (i-1.5)*.353 + (random()-.5)*.051, wobble = (random()-.5)*.11, sway = (random()-.5)*.126;
    const spine: P3[] = [[wobble-sway*.84,-.012,z+(random()-.5)*.12],[wobble+sway,.185,z+.041],
      [wobble-sway,.576+(random()-.5)*.071,z-.035], [wobble+sway*.31,.816+(random()-.5)*.081,z-.021]];
    // Living leaders taper under the new growth. Only the cut shoulder wood
    // below exposes flat end grain; don't cap every hidden splice.
    bark.stem(spine.map((p,n)=>collar(p,[.031,.022,.013,0][n])), 4, .14, i*.63, true);
    // Straggling lower growth alternates with exposed bark and daylight down
    // to the soil. Where a renewal shoot diverges, last year's cut stays bare.
    const low = stemAtHeight(spine,.046+.045*random()), lowSide = i%2 ? 1 : -1;
    const spur = add3(low,[lowSide*(.12+random()*.10), .036+random()*.051, (random()-.5)*.156]);
    bark.stem([collar(low,.014),collar(spur,.006)], 3, .03, 0, true);
    shoot(spur, add3(spur,[lowSide*.109,.092+random()*.12,(random()-.5)*.24]), .101);
    for (const side of [-1,1]) {
      const root = stemAtHeight(spine,.146 + .13*random()), shoulderZ = z + (random()-.5)*.145;
      const elbow: P3 = [side*(.20+.053*random()), .408+(random()-.5)*.085, mix3(root,[0,0,shoulderZ],.60)[2]];
      const cut: P3 = [side*(.340+.077*random()), .687+(random()-.5)*.070, shoulderZ];
      bark.stem([collar(root,.019),collar(elbow,.012),collar(cut,.0058)], 3, .09, .4, true);
      for (let j = 0; j < 6; j++) {
        const along = (j + .15 + .49*random())/6;
        const a = along<.47 ? mix3(root,elbow,along/.47) : mix3(elbow,cut,(along-.47)/.53);
        const hand = j % 2 ? 1 : -1, face = .923 + .054*Math.sin(2*z + variant + i*.41);
        const zTip = z + hand*(.122+.084*random());
        // Lower whips run out along the heel. Higher ones turn back towards
        // the crown, giving a shallow battered side and irregular clipped lip.
        const b: P3 = [side*(j===5 ? .30+.12*random() : face*(.434+.067*random())),
          j === 5 ? .922 + z*bias*.061 + .068*random() : .323+.112*j+.095*random(), zTip];
        shoot(a, b, .110 + .040*random());
        if (j === 4) {
          if ((i+side)%3 === 0) bark.stem([collar(a,.0075),collar(b,0)], 3, 0, 0, true);
          newTip(tips,b,polar(side*1.22+z,.076,.026),.017,hand*.81);
        }
      }
    }
    for (let j = 0; j < 3; j++) {
      const a = stemAtHeight(spine,.63+.081*j), sign = j%2 ? -1 : 1;
      const b: P3 = [wobble + sign*(.073+.12*random()),.943 + .065*random() + bias*z*.09,z+(j-1)*.132];
      shoot(a,b,.123+.025*random());
      if (j===2) newTip(tips,b,polar(i+variant,.078,.031),.021,.37);
    }
  }
  const parts = [[plantSurface(bark,true),m.walnut],[ranks.geometry(),m.leafLight],[plantSurface(tips,false),m.leaf]] as const;
  // Keep the planted parcel off the window glass and the aisle. Scale the
  // WHOLE bent stems and their attached leaves, never flatten tips on a box.
  let xMax=0, zMax=0, yMax=0;
  for (const [g] of parts) { g.computeBoundingBox(); const b=g.boundingBox!; xMax=Math.max(xMax,b.max.x,-b.min.x); zMax=Math.max(zMax,b.max.z,-b.min.z); yMax=Math.max(yMax,b.max.y); }
  for (const [g,mat] of parts) put(g.scale(halfWidth*.99/xMax, height/yMax, .812/zMax),mat,0,0,0);
}
