import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVillaVehicle } from '../src/villaVehicle.js';
import { createVillaPickupModel } from '../src/villaPickupModel.js';
import { createVillaSuvModel } from '../src/villaSuvModel.js';
import { createVillaScooterModel } from '../src/villaScooterModel.js';
import { createVillaActivities } from '../src/villaActivities.js';
import { createVillaDrivingCourse, VILLA_ENTRY_SPUR, VILLA_FRONT_LINK, villaRoadCrossSection } from '../src/villaDrivingCourse.js';
import { VILLA_SCENIC_ROAD } from '../src/villaDriving.js';

type Point = [number, number, number];
function cast(frame: THREE.Object3D, targets: THREE.Object3D[], from: Point, dir: Point, far: number) {
  return new THREE.Raycaster(frame.localToWorld(new THREE.Vector3(...from)),
    new THREE.Vector3(...dir).transformDirection(frame.matrixWorld), .00001, far).intersectObjects(targets,true);
}
function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => materials.add(m)); } });
  materials.forEach(m => m.dispose()); root.clear();
}
const specs = [
  { id:'sedan', root:'villa-vehicle', prefix:'vehicle', deck:.628, cup:-.005, outer:.96, radius:.347, hub:.355, axle:1.46, spokeRuns:5,
    pocket:{z:.171, x:.801, lip:.540}, hinge:[.96,0,.9] },
  { id:'pickup', root:'villa-pickup', prefix:'pickup', deck:1.138, cup:.13, outer:1.2, radius:.397, hub:.41, axle:1.725, spokeRuns:6,
    pocket:{z:.187, x:.913, lip:.867}, hinge:[1.02,0,1.21] },
  { id:'suv', root:'villa-suv', prefix:'suv', deck:1.011, cup:-.07, outer:.99, radius:.407, hub:.42, axle:1.45, spokeRuns:10,
    pocket:{z:-.053, x:.816, lip:.704}, hinge:[.99,0,1.05] },
] as const;

describe.each(specs)('$id built trim, through the final material batches', spec => {
  const scene = new THREE.Group(); let car: THREE.Object3D, open: (yes:boolean)=>void;
  beforeAll(()=>{
    if(spec.id==='sedan') { const model=createVillaVehicle(scene);open=yes=>{model.update(0,{...createVillaActivities(),carDoorOpen:yes});}; }
    else if(spec.id==='pickup') { const model=createVillaPickupModel(scene);open=yes=>{model.update(0,{pickupDoorOpen:yes});}; }
    else { const model=createVillaSuvModel(scene);open=yes=>{model.update(0,{suvDoorOpen:yes});}; }
    car=scene.getObjectByName(spec.root)!;open(false);scene.updateMatrixWorld(true);
  });
  afterAll(()=>dispose(scene));
  it('has a well below the console lip, not a disk or a second lid under the aperture',()=>{
    const cabin=scene.getObjectByName(`${spec.prefix}-cabin`)!;
    const height=(x:number)=>{const hit=cast(car,[cabin],[x,spec.deck+.05,spec.cup],[0,-1,0],.2)[0];
      expect(hit).toBeDefined(); return car.worldToLocal(hit.point.clone()).y;};
    expect(height(.006)).toBeCloseTo(spec.deck-.077,3);
    expect(height(.051)-height(.006)).toBeGreaterThan(.075);
    expect(height(.091)).toBeCloseTo(spec.deck+.001,3);
  });
  it('keeps a deep storage pocket and turned lip on the moving driver leaf, closed and open',()=>{
    const leaf=scene.getObjectByName(`${spec.prefix}-driver-door`)!, {x,z,lip}=spec.pocket;
    for(const opened of [false,true]) {
      open(opened);scene.updateMatrixWorld(true);
      const depth=(xx:number)=>cast(leaf,[leaf],[xx-spec.hinge[0],lip+.023,z-spec.hinge[2]],[0,-1,0],.23)[0]?.distance;
      const centre=depth(x);
      expect(centre).toBeDefined();expect(centre!).toBeGreaterThan(.09);
      // Search a short transverse row rather than aiming at one triangle's edge.
      const nearby=Array.from({length:17},(_,i)=>depth(x+(i-8)*.005)).filter((d):d is number=>d!==undefined);
      expect(Math.min(...nearby)).toBeLessThan(.043); expect(centre!-Math.min(...nearby)).toBeGreaterThan(.065);
    }
    open(false);scene.updateMatrixWorld(true);
  });
  it('has model-specific open windows between the spokes, with no fake disk at the wheel face',()=>{
    const body=scene.getObjectByName(`${spec.prefix}-body`)!;
    for(const sign of [-1,1]){
      const filled=Array.from({length:150},(_,i)=>{
        const a=i*Math.PI*2/150, r=spec.radius*.57;
        return cast(car,[body],[sign*(spec.outer+.02),spec.hub+Math.cos(a)*r,spec.axle+Math.sin(a)*r],[-sign,0,0],spec.id==='pickup'?.22:.14).length>0;
      });
      const metal=filled.filter(Boolean).length;
      expect(metal).toBeGreaterThan(12);expect(metal).toBeLessThan(100);
      expect(filled.filter((v,i)=>v&&!filled[(i+filled.length-1)%filled.length])).toHaveLength(spec.spokeRuns);
    }
  });
});

it('uses the same verge endpoints on the bent front road and the entry spur as the rendered asphalt',()=>{
  const scene=new THREE.Group();createVillaDrivingCourse(scene);
  try {
    const actual=new Set<string>(),key=(x:number,z:number)=>`${Math.fround(x)}/${Math.fround(z)}`;
    scene.traverse(o=>{if(!(o instanceof THREE.Mesh)||(o.material as THREE.Material).name!=='estate-road-asphalt')return;
      const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)actual.add(key(p.getX(i),p.getZ(i)));});
    for(const path of [VILLA_FRONT_LINK,VILLA_ENTRY_SPUR])for(let i=0;i<path.length;i++){
      const [lo,hi]=villaRoadCrossSection(path,i,VILLA_SCENIC_ROAD.width);
      expect((lo.x+hi.x)*.5).toBeCloseTo(path[i].x,8);expect((lo.z+hi.z)*.5).toBeCloseTo(path[i].z,8);
      expect(Math.hypot(hi.x-lo.x,hi.z-lo.z)).toBeCloseTo(VILLA_SCENIC_ROAD.width,8);
      expect(actual.has(key(lo.x,lo.z))).toBe(true);expect(actual.has(key(hi.x,hi.z))).toBe(true);
    }
  } finally {dispose(scene);}
});

describe('step-through pressings',()=>{
  it('crowns the mudguard over a separate free-turning tyre and leaves the footwell open',()=>{
    const scene=new THREE.Group();createVillaScooterModel(scene);scene.updateMatrixWorld(true);
    try {
      const fork=scene.getObjectByName('scooterSteeringFork')!,guard=scene.getObjectByName('scooterHandlebars')!,wheel=scene.getObjectByName('scooterFrontWheel')!;
      const top=(x:number)=>fork.worldToLocal(cast(fork,[guard],[x,.37,.003],[0,-1,0],.17)[0].point.clone()).y;
      expect(top(.001)-top(.061)).toBeGreaterThan(.008);
      const under=cast(fork,[guard],[.007,.241,.013],[0,1,0],.08)[0],tyre=cast(fork,[wheel],[.007,.241,.013],[0,-1,0],.06)[0];
      expect(under).toBeDefined();expect(tyre).toBeDefined();expect(under.distance+tyre.distance).toBeGreaterThan(.031);
      const body=scene.getObjectByName('scooterBody')!;
      expect(cast(body,[body],[.40,.54,.025],[-1,0,0],.80)).toHaveLength(0);
      const front=(x:number)=>body.worldToLocal(cast(body,[body],[x,.631,.68],[0,0,-1],.46)[0].point.clone()).z;
      expect(front(0)-front(.191)).toBeGreaterThan(.08);
    } finally { dispose(scene); }
  });
});
