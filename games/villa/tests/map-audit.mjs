/** Game-owned manual visual audit. Run after build:game -- villa.
 * Outputs stay in the game's ignored test-results directory. No shell screenshot fixtures
 * or user work are modified. The captured camera/frame is verified, never a
 * cached software-GL frame wearing a new HUD label.
 * VILLA_AUDIT_BASE=http://127.0.0.1:8091 node games/villa/tests/map-audit.mjs [name ...]
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { atelierViews } from './atelier-views.mjs';
import { exteriorViews } from './exterior-views.mjs';
import { interiorViews } from './interior-inspection-views.mjs';
import { renderExteriorStudy } from './exterior-study-render.mjs';
const base = process.env.VILLA_AUDIT_BASE ?? 'http://127.0.0.1:8091';
const out = process.env.VILLA_AUDIT_OUT ?? path.resolve('games/villa/test-results/map-audit');
export const views = [
  ['entrance', 0, 0, 21, 0, 0, .1],
  ['pool', -26, 0, 11, -32, 0, -.08],
  ['orchard', -19.5, 0, 23, -14, 13, -.05],
  ['vegetables', -1, 0, 24, -8, 18, -.18],
  ['garage-apron', 48, 0, 12, 41, -1, -.02],
  ['garage', 49.7, 0, .6, 39, -5, -.05],
  ['sedan', 29.4, 0, 1.5, 32.4, -2.6, -.10],
  ['sedan-rear', 34.4, 0, -6.9, 32.4, -2.6, -.14],
  ['pickup', 40.7, 0, .9, 37.7, -2.6, -.09],
  ['pickup-bed', 40.2, 0, -7.5, 37.7, -3.6, -.25],
  ['suv', 50.25, 0, 1.2, 46.9, -2.6, -.08],
  ['suv-rear', 50.1, 0, -6.9, 46.9, -2.6, -.12],
  ['sedan-cockpit', 32.4, 0, -2.6, 32.4, 4, -.24, 'car'],
  ['pickup-cockpit', 37.7, 0, -2.6, 37.7, 4, -.27, 'pickup'],
  ['suv-cockpit', 46.9, 0, -2.6, 46.9, 4, -.25, 'suv'],
  ['living', -14, 0, 8, -7, 1, -.08],
  ['kitchen', -17, 0, -1.3, -7, -7, -.08],
  ['tea-room', -16, 0, -10.8, -19, -15.8, -.16],
  ['laundry', -4, 0, -11, -9, -16.8, -.1],
  ['gym', 7, 0, -10.5, 11.6, -16, -.08],
  ['snooker', 21, 0, 0, 11, -4, -.15],
  ['cinema', 24, 0, -10, 22.6, -17, -.03],
  ['gaming', 15.6, 0, 7.8, 7, 5, -.03],
  ['empty-lounge', 24, 0, 6.5, 20, -6, -.05],
  ['robot', 3.2, 0, -9, 4.45, -7.7, -.68],
  ['upstairs-hall', 6.9, 3.6, -9, 0, -12, -.08],
  ['master', -12.5, 3.6, 7.7, -17.5, 2.1, -.10],
  ['master-vanity', -20.1, 3.6, 3.3, -22.1, .59, -.15],
  ['master-lounge', -14.9, 3.6, 6.0, -9.4, 6.1, -.10],
  ['guest', -13.6, 3.6, -14.7, -21.3, -11.1, -.09],
  ['guest-entry', -2.7, 3.6, -14.7, -12, -14.7, -.04],
  ['guest-lounge', -16, 3.6, -13.9, -9, -13.8, -.1],
  ['dressing', -14, 3.6, -1.2, -19, -5.5, -.08],
  ['ensuite', -5, 3.6, -3.65, -10, -7, -.08],
  ['study', 15.8, 3.6, -10, 12.5, -16, -.08],
  ['bath', 9.2, 3.6, -.3, 14, -6, -.12],
  ['bath-west', 6.2, 3.6, -4.8, 12, -4.8, -.04],
  ['bath-open', 6.8, 3.6, -4.8, 11, -5.2, -.06],
  ['reading-hall', 26.5, 3.6, 7.5, 20, -4.6, -.03],
  ['massage', 24, 3.6, -10.5, 22.6, -14.5, -.05],
  ['balcony', -6, 3.6, 10.4, -10, 19, -.15],
  ['roof-stairs', .2, 7.2, 3.4, .5, -3, -.3],
  ['roof-west', -2, 7.2, 4, -18, -3, -.1],
  ['roof-east', 6, 7.2, -1, 13, -8, -.06],
  ['roof-flowers', 21, 7.2, 5, 26, -10, -.07],
  ['stream', 9, 0, -30, 0, -38, -.08],
  ['stream-west', -20, 0, -30, -15, -39, -.1],
  ['stream-bridge', 0, 0, -31, 0, -38, -.14],
  ['north-garden', 0, 0, -51, 0, -20, -.02],
  ['north-estate', -4, 0, 28, -8, 46, -.02],
  ['south-fields', -17, 0, 49, -10, 60, -.1],
  ['pond', -2, 0, 69, -14, 80, -.08],
  ['scenic-hills', 29, 0, 114, 20, 131, .02],
  ...atelierViews, ...exteriorViews, ...interiorViews,
];
const selected = process.argv.slice(2);
for(const name of selected) if(!views.some(v=>v[0]===name)) throw new Error(`Unknown audit view: ${name}`);
const poses = views.filter(v => !selected.length || selected.includes(v[0]));
if (!poses.length) throw new Error('No matching audit views');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error' && /THREE\.|WebGL|shader/i.test(e.text()))errors.push(e.text());});
  await page.route('**/__villa-audit', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"><main id="gameApp"><canvas id="gameCanvas"></canvas></main></body></html>' }));
  await page.goto(`${base}/__villa-audit`);
  const release = await page.evaluate(async () => {
    const g=(await(await fetch('/games/index.json',{cache:'no-store'})).json()).games.find(g=>g.id==='villa');
    const descriptor=await(await fetch(g.assetBase+'game.json',{cache:'no-store'})).json();
    const sum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(g.entry,{cache:'no-store'})).arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(g.revision!==descriptor.revision||g.version!==descriptor.version||descriptor.files[descriptor.entry]!==sum)throw Error('Mixed Villa study payload');
    return {...g,entrySHA256:sum};
  });
  if (process.env.VILLA_AUDIT_REVISION && release.revision !== process.env.VILLA_AUDIT_REVISION) throw new Error(`Unexpected Villa revision ${release.revision}`);
  await page.evaluate(async release => {
    const { VillaGame } = await import(release.entry);
    const canvas = document.querySelector('canvas');
    const g = new VillaGame({ canvas, logicalWidth: 960, logicalHeight: 600,
      isDarkTheme: () => false, isZhLang: () => true, isPixelMode: () => false,
      getRecord: () => null, reportScore() {}, requestShellRender() {}, assetUrl: p => release.assetBase + p });
    g.prepare(); g.start(); cancelAnimationFrame(g.animationId);
    g.audio?.setEnabled(false); g.keys.clear();
    g.state.home.timeOfDay = 'day'; g.state.home.darkness = 0;
    window.__auditGame = g;
    const loaded=await g.scene.groundSwatches?.ready;
    if(g.scene.groundSwatches && (!loaded || ['turf','gravel','timber'].some(k=>loaded[k]!=='decoded')))throw Error('Study requires decoded ground swatches: '+JSON.stringify(loaded));
    const rooms=await g.scene.roomSwatches?.ready;
    if(g.scene.roomSwatches && (!rooms || ['oak','limestone','plaster'].some(k=>rooms[k]!=='decoded')))throw Error('Study requires the actual indoor finish samples: '+JSON.stringify(rooms));
  }, release);
  await page.evaluate(async ({time,weather,liveSun,lamps,requireMirrors}) => {
    const g = window.__auditGame;
    if(requireMirrors){
      const v=g.scene.roomMirrors;await v?.ready;
      if(!v || ['master','dressing','ensuite','bath','gym'].some(k=>v.states[k]!=='decoded'))throw Error('Mirror study requires all five photographed room plates: '+JSON.stringify(v?.states));
    }
    if(lamps!==undefined){if(lamps!=='on'&&lamps!=='off')throw Error('Use on/off for the surveyed room switches');
      for(const id of Object.keys(g.state.home.roomLights)){g.state.home.roomLights[id]=lamps==='on';g.state.home.lightLevels[id]=Number(lamps==='on');}g.state.home.revision++;
    }
    // Exercise the production live+survey lighting branches on a software implementation;
    // this optional pass does not disguise the GPU and is not a hardware timing claim.
    if(liveSun){g.scene.renderer.shadowMap.enabled=true;g.scene.renderer.shadowMap.needsUpdate=true;g.scene.scene.environment=g.scene.environment;}
    g.state.home.timeOfDay = time; g.state.home.darkness = time === 'night' ? 1 : time === 'evening' ? .43 : 0;
    g.state.home.weather=weather;g.state.home.rain=weather==='rain'?1:0;
    g.state.evening = g.state.home.darkness > .2;
  }, {time:process.env.VILLA_AUDIT_TIME ?? 'day',weather:process.env.VILLA_AUDIT_WEATHER ?? 'clear',liveSun:process.env.VILLA_AUDIT_SUN==='live',lamps:process.env.VILLA_AUDIT_LAMPS,requireMirrors:process.env.VILLA_AUDIT_MIRRORS==='1'});
  for (const pose of poses) {
    const record = await page.evaluate(({pose, compare, closeView}) => {
      const [name, x, y, z, tx, tz, pitch, driver] = pose, g = window.__auditGame;
      g.state.seated = null; g.state.relaxSeatId = null; g.transition = null;
      // Pose fixtures reset transient feedback with controller state, so a
      // previous cockpit's entry toast cannot label a later bedroom image.
      g.toast = ''; g.toastUntil = 0; g.toastTarget = ''; g.hudHintShown = true;
      const crouched = driver === 'crouch';
      Object.assign(g.motion, { offset: 0, velocity: 0, crouched, stance: crouched ? 1 : 0 });
      Object.assign(g.state.elevator,{phase:driver==='lift'?'open':'closed',door:driver==='lift'?1:0,y:0,floor:0,riding:false});
      for (const road of ['car','pickup','suv']) g.state[`${road}DoorOpen`] = driver===`door-${road}`;
      g.position = { x, y, z }; g.eyeY = y;
      g.yaw = Math.atan2(x - tx, z - tz); g.pitch = pitch;
      // Terrain-sampled outdoor positions settle at the actual support height.
      let support = g.supportAt(x, z, y, 1.75);
      if (support === null && y === 0 && z > 35) {
        // Terrain hills are not reachable from an artificial y=0 probe. Find
        // the actual local support, never photograph from under the road.
        for (let h = -2; h < 15 && support === null; h += .2) support = g.supportAt(x, z, h, 1.75);
      }
      if (support !== null && y === 0) g.position.y = g.eyeY = support;
      const riding = ['car','suv','pickup','scooter','racing'].includes(driver);
      const sitting = driver?.startsWith('sofa-') || driver?.startsWith('stool-') || driver?.startsWith('chair-');
      if (riding || sitting) {
        if (riding) g.takeSeat(driver);
        else {
          g.takeRelaxSeat(driver);
          if (g.state.relaxSeatId !== driver) throw new Error(`${name}: wrong seat`);
          g.yaw = Math.atan2(g.position.x-tx,g.position.z-tz);
        }
        g.transition = null; g.pitch = pitch;
        support = g.supportAt(g.position.x, g.position.z, g.position.y, 1.75);
      }
      for (const [id, hinge] of Object.entries(g.state.wardrobes.wardrobes)) Object.assign(hinge,{open:driver===id,progress:driver===id?1:0});
      Object.assign(g.state.tea,driver==='brew'?{phase:'brewing',fill:.6,elapsed:6}:{phase:'empty',fill:0,elapsed:0});
      g.state.grillLids.fill(driver==='grills');
      const parrot=g.state.pets.pets.find(p=>p.id==='parrot');
      if(parrot) Object.assign(parrot,driver==='airborne'?{y:.62,speed:.54,wingFold:.99,wingPhase:1.3,verticalSpeed:.08}:{y:0,speed:0,wingFold:0,wingPhase:3.4,verticalSpeed:0});
      g.toast=''; g.toastUntil=0;
      const open = name === 'bath-open';
      Object.assign(g.state.bathDoors, { west: open, east: open, progressW: open ? 1 : 0, progressE: open ? 1 : 0 });
      // Auditing the same pose alone or after another room must yield the same sun, water and limbs.
      g.time = name === 'robot' ? 0 : 12;
      g.scene.softwareInputFrames = 0; g.scene.lastDrawAt = -Infinity;
      const before = g.scene.renderer.info.render.frame;
      g.renderFrame();
      const after = g.scene.renderer.info.render.frame;
      if (after <= before) throw new Error(`${name}: stale GL frame`);
      const eye = g.view();
      if (Math.abs(g.scene.camera.position.x - eye.x) > .001 || Math.abs(g.scene.camera.position.z - eye.z) > .001
        || Math.abs(g.scene.camera.position.y - eye.y - (eye.eyeHeight ?? 1.65)) > .001) throw new Error(`${name}: wrong camera`);
      if (driver?.startsWith('door-') && g.scene[`${driver.slice(5)}DoorProgress`] < .99) throw new Error(`${name}: door not open`);
      if (driver === 'grills' && [1,2,3].some(i => g.scene.scene.getObjectByName(`roof-grill-lid-${i}`)?.rotation.x > -1.20)) throw new Error(`${name}: lid not raised`);
      if (crouched && Math.abs(eye.eyeHeight-.9)>.001) throw new Error(`${name}: wrong crouch height`);
      const standable = riding || sitting ? null : g.canFit(1.75);
      if(closeView && !riding && !sitting && (!g.canFit(crouched?1.05:1.75) || support===null)) throw new Error(`${name}: inspection is not reachable`);
      const renderer=g.scene.renderer, drawCalls=renderer.info.render.calls, triangles=renderer.info.render.triangles;
      let uncull=null;
      if(compare){
        const gl=renderer.getContext(), read=()=>{const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
        const actual=read();
        // Same camera, transforms and lighting, NO second simulation update. Use Three's normal
        // visibility rules for the reference: the optimization may not remove a single visible pixel.
        renderer.render(g.scene.scene,g.scene.camera);
        const ref=read();let changed=0;for(let i=0;i<ref.length;i++) if(actual[i]!==ref[i]) changed++;
        uncull={drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,differentChannels:changed};
        if(changed) throw new Error(`${name}: tight culling changed ${changed} output channels`);
      }
      return { name, position: { ...g.position }, camera: g.scene.camera.position.toArray(), yaw: g.yaw,
        pitch:g.scene.camera.rotation.x, fov:g.scene.camera.fov,aspect:g.scene.camera.aspect,time:g.time,light:g.state.home.timeOfDay,weather:g.state.home.weather,liveShadowPass:renderer.shadowMap.enabled,
        floorSupport: support, occupancy: riding || sitting ? driver : crouched ? 'crouching' : 'standing', inspectedState: driver ?? null,
        standable, frame: after, drawCalls, triangles, uncull, png: g.canvas.toDataURL('image/png') };
    }, {pose,compare:process.env.VILLA_AUDIT_COMPARE_VISIBILITY==='1',closeView:[...atelierViews,...exteriorViews,...interiorViews].some(v=>v[0]===pose[0])});
    const { png, ...info } = record;
    if(process.env.VILLA_AUDIT_LAMPS!==undefined)info.roomSwitches=process.env.VILLA_AUDIT_LAMPS;
    await writeFile(path.join(out, `${info.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    const study=process.env.VILLA_AUDIT_STUDY;
    if(study==='clay'||study==='finish'){
      const image=await page.evaluate(renderExteriorStudy,{mode:study,width:1024,height:640});
      if(image.camera.some((v,i)=>Math.abs(v-info.camera[i])>.001))throw Error('Inspection eye changed');
      await writeFile(path.join(out,`${info.name}-${study}.png`),Buffer.from(image.png.split(',')[1],'base64'));
      info.study={mode:study,width:image.width,height:image.height};
    }
    results.push(info); console.log(JSON.stringify(info));
  }
  await page.evaluate(() => window.__auditGame.destroy());
  await writeFile(path.join(out, 'audit.json'), JSON.stringify({ release: { version: release.version, revision: release.revision, entrySHA256:release.entrySHA256 }, results, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
console.log(`Audit images: ${out}`);
