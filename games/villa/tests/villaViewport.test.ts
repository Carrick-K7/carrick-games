import { describe, it, expect } from 'vitest';
import { villaUseCircle } from '../src/villaTouchUi.js';
import { villaRendererSize } from '../src/villaScene.js';
import { VillaGame } from '../src/villa.js';
import { computeShellReserve, rectsOverlap, type HudRect } from '@carrick/game-sdk/layout';

// Edge-to-edge viewport geometry: HUD touch targets must stay ≥44px and inside
// the display safe area at every supported viewport class.
const VIEWPORTS = [
  { width: 320, height: 568, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 320, height: 568, safe: { top: 20, right: 20, bottom: 20, left: 20 } },
  { width: 390, height: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { width: 844, height: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 1280, height: 720, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 2560, height: 1080, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
];

describe('villaUseCircle safe-area placement', () => {
  for (const { width, height, safe } of VIEWPORTS) {
    for (const snooker of [false, true]) {
      it(`stays a ≥44px target inside ${width}x${height} safe area (snooker=${snooker})`, () => {
        const c = villaUseCircle(width, height, 1, snooker, safe);
        expect(c.radius * 2).toBeGreaterThanOrEqual(44);
        expect(c.x + c.radius).toBeLessThanOrEqual(width - safe.right);
        expect(c.y + c.radius).toBeLessThanOrEqual(height - safe.bottom);
        expect(c.x - c.radius).toBeGreaterThanOrEqual(0);
        expect(c.y - c.radius).toBeGreaterThanOrEqual(0);
      });
    }
  }

  it('defaults to zero insets when no safe area is given', () => {
    expect(villaUseCircle(1120, 700, 3, false)).toEqual({ x: 1006, y: 475, radius: 87 });
  });
});

describe('Villa HUD clears the brand/help/menu cluster', () => {
  // Exercise the actual HUD-only methods without creating a canvas, renderer or game loop.
  function hud(width: number, height: number, safe: typeof VIEWPORTS[number]['safe'], touchMode: boolean, immersive: boolean, snookerActive = false) {
    return Object.assign(Object.create(VillaGame.prototype), {
      width, height, viewport: { width, height, dpr: 1, safeArea: safe }, touchMode, immersive,
      state: { snookerActive, seated: null }, position: { x: 0, y: 0, z: 0 }, motion: { offset: 0 },
      isZhLang: () => false, hotspot: () => null, inElevator: () => false, drivingSeat: () => false,
    }) as { buttons(): (HudRect & { id: string; label: string })[]; utilityButtons(): (HudRect & { id: string; label: string })[] };
  }

  for (const { width, height, safe } of [...VIEWPORTS, { width: 1024, height: 768, safe: VIEWPORTS[0].safe }, { width: 1120, height: 700, safe: VIEWPORTS[0].safe }]) {
    for (const touch of [false, true]) {
      for (const immersive of [false, true]) {
        it(`${width}x${height} touch=${touch} immersive=${immersive}: controls stay clear and ≥44px`, () => {
          const shell = computeShellReserve(width, safe);
          for (const snooker of [false, true]) {
            const game = hud(width, height, safe, touch, immersive, snooker);
            const buttons = game.buttons();
            for (const button of buttons) {
              expect(rectsOverlap(button, shell), button.id).toBe(false);
              expect(button.w, button.id).toBeGreaterThanOrEqual(44);
              expect(button.h, button.id).toBeGreaterThanOrEqual(44);
              expect(button.x, button.id).toBeGreaterThanOrEqual(safe.left);
              expect(button.x + button.w, button.id).toBeLessThanOrEqual(width - safe.right);
              expect(button.y, button.id).toBeGreaterThanOrEqual(safe.top);
              expect(button.y + button.h, button.id).toBeLessThanOrEqual(height - safe.bottom);
              for (const other of buttons) if (button !== other) expect(rectsOverlap(button, other), `${button.id}/${other.id}`).toBe(false);
            }
            expect(game.utilityButtons().map(b => b.id)).toEqual(['map', 'terminal']);
            expect(buttons.filter(b => ['map', 'terminal'].includes(b.id))).toHaveLength(2);
            expect(buttons.some(b => ['time', 'home', 'immersion'].includes(b.id))).toBe(false);
          }
        });
      }
    }
  }

  it('makes the location card the map and wraps only the terminal on narrow phones', () => {
    const safe = VIEWPORTS[0].safe;
    expect(hud(320, 568, safe, true, false).utilityButtons()).toMatchObject([
      { id: 'map', x: 12, y: 12, w: 56, h: 44 }, { id: 'terminal', label: 'Terminal', x: 232, y: 68, w: 76, h: 44 },
    ]);
    expect(hud(390, 844, safe, true, false).utilityButtons()).toMatchObject([
      { id: 'map', x: 12, y: 12, w: 56, h: 44 }, { id: 'terminal', x: 90, y: 12, w: 76, h: 44 },
    ]);
    expect(hud(844, 390, VIEWPORTS[3].safe, true, false).utilityButtons()).toMatchObject([
      { id: 'map', x: 59, y: 12, w: 56, h: 44 }, { id: 'terminal', x: 497, y: 12, w: 76, h: 44 },
    ]);
    expect(hud(1280, 720, safe, false, false).utilityButtons()).toMatchObject([
      { id: 'map', x: 24, y: 22, w: 294, h: 44 }, { id: 'terminal', x: 938, y: 22, w: 118, h: 44 },
    ]);
    expect(hud(320, 568, safe, true, true).utilityButtons()).toEqual(hud(320, 568, safe, true, false).utilityButtons());
  });

  it('keeps snooker aim/power/Shot geometry and uses the old immersive slot for Terminal', () => {
    expect(hud(320, 568, VIEWPORTS[0].safe, true, false, true).buttons()).toMatchObject([
      { id: 'map', x: 12, y: 12, w: 56, h: 44 }, { id: 'terminal', x: 208, y: 66, w: 44, h: 44 },
      { id: 'aim-left', x: 12, y: 66, w: 44, h: 44 }, { id: 'aim-right', x: 64, y: 66, w: 44, h: 44 },
      { id: 'power-down', x: 12, y: 118, w: 44, h: 44 }, { id: 'power-up', x: 64, y: 118, w: 44, h: 44 },
      { id: 'reset-activity', x: 12, y: 513, w: 44, h: 44 }, { id: 'shoot', x: 256, y: 66, w: 44, h: 44 },
    ]);
  });
});

describe('cold Villa shell projection', () => {
  function mount(width=390,height=664) {
    const stage={id:'canvasWrapper',closest:()=>({}),getBoundingClientRect:()=>({width,height})};
    const canvas={id:'gameCanvas',isConnected:true,parentElement:stage,style:{},dataset:{},width:2240,height:1400};
    const game=Object.assign(Object.create(VillaGame.prototype), {host:{presentation:{setActions:()=>{}}},canvas,ctx:{setTransform(){}},width:1120,height:700,pixelRatio:2,viewport:null,scene:null});
    return {game,stage,canvas};
  }
  it('seeds the genuine cold projection from the measured stage before prepare paints; it does not claim a running frame',()=>{
    const {game,canvas}=mount();game.sizeFirstWorld();expect([game.width,game.height]).toEqual([390,664]);
    expect(canvas.dataset).toMatchObject({logicalWidth:'390',logicalHeight:'664'});expect(canvas.dataset).not.toHaveProperty('villaRenderer');
    expect(game.viewport).toMatchObject({width:390,height:664,safeArea:{top:0,right:0,bottom:0,left:0}});expect(game.scene).toBeNull();
  });
  it('retains only a painted identical same-turn hardware fit; a notch, resize, restart, or later fit must render',async()=>{
    for(const mode of ['identical','insets','size','dpr','lost','empty','software','running','later']) {
      const {game}=mount();game.sizeFirstWorld();let renders=0;
      const v={...game.viewport,safeArea:{...game.viewport.safeArea}};
      game.scene={lowSpec:mode==='software',setPrimaryAspect(){},renderer:{info:{render:{frame:mode==='empty'?0:1}},getContext:()=>({isContextLost:()=>mode==='lost'})}};
      game.resizeLogicalViewport=()=>{renders++;};game.syncUseButton=game.publishState=()=>{};
      if(mode==='insets')v.safeArea.top=45;if(mode==='size')v.height++;if(mode==='dpr')v.dpr++;if(mode==='running')game.running=true;if(mode==='later')await Promise.resolve();
      game.setViewport(v);expect(renders,mode).toBe(mode==='identical'?0:1);
      if(mode==='identical'){expect(game.viewport).toBe(v);game.setViewport(v);expect(renders).toBe(1);}
    }
  });
  it('does not replace a standalone host, a supplied fit, an in-progress scene, or an unmeasurable stage',()=>{
    for(const mode of ['isolated','unmounted','sized','running','zero','nonfinite']){
      const {game,canvas,stage}=mount(mode==='zero'?0:390,mode==='nonfinite'?NaN:664);
      if(mode==='isolated')stage.id='embedding';if(mode==='unmounted')canvas.isConnected=false;
      if(mode==='sized')game.viewport={width:320,height:568};if(mode==='running')game.scene={};
      game.sizeFirstWorld();expect([game.width,game.height],mode).toEqual([1120,700]);expect(canvas.dataset,mode).toEqual({});
    }
  });
});

describe('villaRendererSize', () => {
  it('keeps the actual viewport aspect at dpr 1', () => {
    expect(villaRendererSize(1280, 720, 1, false)).toEqual({ w: 1280, h: 720 });
    expect(villaRendererSize(844, 390, 1, false)).toEqual({ w: 844, h: 390 });
  });

  it('caps the upscale at 1.5x on high-dpr displays', () => {
    expect(villaRendererSize(390, 844, 3, false)).toEqual({ w: 585, h: 1266 });
  });

  it('bounds total render pixels on very wide fullscreen viewports', () => {
    const { w, h } = villaRendererSize(2560, 1080, 2, false);
    expect(w * h).toBeLessThanOrEqual(4_200_000);
    expect(w / h).toBeCloseTo(2560 / 1080, 1);
  });

  it('preserves the software 0.55 scale below budget and caps only the world raster on large displays', () => {
    expect(villaRendererSize(960,600,1,true)).toEqual({w:528,h:330});
    for(const [width,height] of [[1280,720],[1920,1080],[2560,1080],[3840,2160],[2160,3840]]) {
      const {w,h}=villaRendererSize(width,height,2,true);
      expect(w*h).toBeLessThanOrEqual(230_400);expect(w*h).toBeGreaterThan(228_000);
      expect(Math.abs(w-(width/height)*h)).toBeLessThan(Math.max(1,width/height));
    }
  });
});

