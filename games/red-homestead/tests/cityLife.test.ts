import { describe,it,expect } from 'vitest';
import { CityLife } from '../src/cityLife.js';
import { createWorld, deployBase, build, stepWorld } from '../src/simulation.js';
function village() {
  const world=createWorld({mode:'session',mapId:'cedar-bay',economy:'creative'});deployBase(world);
  build(world,'house',4,10);build(world,'apartment',7,12);build(world,'park',3,14);build(world,'market',12,14);
  for(let i=0;i<600;i++)stepWorld(world,.1);
  return world;
}
describe('bounded peaceful resident presentation',()=>{
  it('shows people only after housing and population exist without changing any economic state',()=>{
    const world=village(),before=structuredClone(world),life=new CityLife();
    for(let i=0;i<600;i++)life.update(world,.1);
    expect(life.residents.length).toBeGreaterThan(0);expect(life.residents.length).toBeLessThanOrEqual(20);
    expect(world).toEqual(before);
    for(const resident of life.residents) {expect(resident.x).toBeGreaterThanOrEqual(0);expect(resident.y).toBeLessThan(world.height);expect(resident.path.length).toBeLessThan(180);}
  });
  it('drops old visual routes when changing or destroying a city',()=>{
    const life=new CityLife(),world=village();for(let i=0;i<100;i++)life.update(world,.1);expect(life.residents.length).toBeGreaterThan(0);
    life.update(createWorld({mode:'session',mapId:'snow-meadow',economy:'classic'}),.1);expect(life.residents).toEqual([]);
    life.reset();expect(life.residents).toEqual([]);
  });
});
