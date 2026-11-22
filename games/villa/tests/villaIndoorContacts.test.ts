import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {VILLA_INDOOR_CONTACT_GRID as g} from '../src/villaInteriorContactGrid.js';
import {createIndoorContacts} from '../src/villaInteriorContacts.js';
import {unpackSurvey} from '../src/villaSolarSurvey.js';
import {isFixedRoomPart,nearestSurvey} from './villaInteriorContactBake.js';
import {easedInteriorBlank} from '../src/villaEasedPanel.js';
const at=(x:number,z:number)=>Math.floor((z-g.z0)/g.p)*g.w+Math.floor((x-g.x0)/g.p);
describe('indoor fixed furniture receivers',()=>{
  it('heights correspond to the actual underside and the direction of the floor intercept, not a painted collider bound',()=>{
    const tris=new Float32Array([0,.60,0, .80,.60,0, 0,.60,.8, .8,.60,.8, 0,.60,.8, .8,.60,0, -1,.025,-1, 2,.025,-1, 0,.025,2]);
    const above=nearestSurvey(tris,0,0),oblique=nearestSurvey(tris,-.93,.93);
    expect(above[at(.43,.30)]).toBeCloseTo(.6,4);expect(above[at(1.02,.30)]).toBe(9);
    expect(oblique[at(1.04,-.25)]).toBeCloseTo(.6,4);expect(oblique[at(.30,.54)]).toBe(9);
  });
  it('never accepts hinged doors, the brush, carried seats, pets, or alpha masks as a stationary room/floor blocker',()=>{
    const p=new THREE.Group(),m=new THREE.MeshStandardMaterial(),b=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),m);b.castShadow=true;b.geometry.userData.villaRigidBatch=true;b.name='Batched villa details';p.add(b);p.name='Villa furnishings · oak, linen & terracotta';expect(isFixedRoomPart(b)).toBe(true);
    for (const n of ['Kitchen/fridge-door-chill','bath-door-leaf-west-0','vacuum/body','villa-swing-seat','villa-pets','interactiveRacingWheel']){p.name=n;expect(isFixedRoomPart(b)).toBe(false);}
    p.name='villa-suite-fittings';m.transparent=true;expect(isFixedRoomPart(b)).toBe(false);m.transparent=false;m.alphaTest=.31;expect(isFixedRoomPart(b)).toBe(false);b.geometry.dispose();m.dispose();
  });
  it('places measured shadow beneath solid furniture and keeps the adjacent clear aisle bright at that same world floor',()=>{
    const map=createIndoorContacts(unpackSurvey),bytes=map.image.data! as Uint8Array,off=g.w*g.h;
    const probe=(x:number,z:number,f=0)=>[bytes[2*(off*f+at(x,z))],bytes[2*(off*f+at(x,z))+1]];
    try{expect(map.format).toBe(THREE.RGFormat);expect(map.minFilter).toBe(THREE.LinearFilter);expect(bytes.byteLength).toBeLessThan(1.4e6);
      expect(probe(-17.5,2.1,1)[0]).toBeLessThan(193);expect(probe(-17.5,2.1,1)[1]).toBeLessThan(90);
      expect(probe(-15.4,6.5,1)[0]).toBeGreaterThan(219);expect(probe(23.5,5.25,0)).toEqual([255,255]);
    }finally{map.dispose();}
  });
  it('uses a closed 44-triangle mill blank with six full bearing planes and finite angled arrises, not an unreturned flat face',()=>{
    const geom=easedInteriorBlank(1,.4,.2,.015),mat=new THREE.MeshStandardMaterial(),m=new THREE.Mesh(geom,mat);
    const shot=(x:number,z:number)=>new THREE.Raycaster(new THREE.Vector3(x,.4,z),new THREE.Vector3(0,-1,0)).intersectObject(m)[0];
    try{expect(geom.getAttribute('position').count/3).toBe(44);expect(shot(0,0)!.point.y).toBeCloseTo(.2,6);expect(shot(.496,.074)!.point.y).toBeCloseTo(.189,5);expect(shot(.496,.093)).toBeUndefined();expect(shot(.501,0)).toBeUndefined();
      expect(new THREE.Raycaster(new THREE.Vector3(0,-.5,0),new THREE.Vector3(0,1,0)).intersectObject(m)[0]?.point.y).toBeCloseTo(-.20,6);
    }finally{geom.dispose();mat.dispose();}
  });
});
