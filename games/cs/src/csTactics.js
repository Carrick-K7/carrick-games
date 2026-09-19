import * as T from 'three';

const asVector=n=>new T.Vector3(n.x,n.y,n.z);
function axes(world,team){const average=t=>world.spawns[t].reduce((p,s)=>p.add(s.pos),new T.Vector3()).multiplyScalar(1/world.spawns[t].length),home=average(team),away=average(team==='ct'?'t':'ct'),forward=away.clone().sub(home).setY(0).normalize();return{home,forward,right:new T.Vector3(-forward.z,0,forward.x)};}

// Routes start at walkable flank waypoints and cross into the other half before
// switching to pursuit. They do not repeatedly replan the same shortest middle path.
export function assignRoute(world,actor,index,rotation=0,mode='defusal'){
  if(world.theme==='desert'){assignDustRoute(world,actor,index,rotation,null,null,Math.random,mode);return;}
  const {forward,right}=axes(world,actor.team),lane=[-1,1,0,-1,1][(index+rotation)%5],width=world.size*.275;
  actor.lane=lane;actor.route=[];actor.routeIndex=0;actor.path=[];actor.pathTime=0;
  let from=actor.pos;
  for(const progress of [-world.size*.18,world.size*.08]){
    const desired=world.center.clone().addScaledVector(right,lane*width).addScaledVector(forward,progress);desired.y=actor.pos.y;
    const candidates=world.nodes.filter(n=>Math.abs(n.y-actor.pos.y)<.7).sort((a,b)=>asVector(a).distanceToSquared(desired)-asVector(b).distanceToSquared(desired));
    for(const n of candidates.slice(0,30)){const v=asVector(n),path=world.path(from,v);if(path.length){actor.route.push(v);from=v;break;}}
  }
  actor.routeUntil=0;
}
export function routeDestination(actor,opponents){
  while(actor.routeIndex<actor.route.length&&Math.hypot(actor.pos.x-actor.route[actor.routeIndex].x,actor.pos.z-actor.route[actor.routeIndex].z)<1.15&&Math.abs(actor.pos.y-actor.route[actor.routeIndex].y)<.5)actor.routeIndex++;
  if(actor.routeIndex<actor.route.length)return actor.route[actor.routeIndex];
  return [...opponents].sort((a,b)=>actor.pos.distanceToSquared(a.pos)-actor.pos.distanceToSquared(b.pos))[0]?.pos;
}
export function chooseRespawn(world,actor,actors){
  let best=world.spawns[actor.team][0],bestScore=-Infinity;
  for(const spawn of world.spawns[actor.team]){
    const eye=spawn.pos.clone().add(new T.Vector3(0,1.61,0));let closest=80,exposure=0,crowding=0;
    for(const other of actors){if(!other.alive||other===actor)continue;const distance=spawn.pos.distanceTo(other.pos);if(other.team!==actor.team){closest=Math.min(closest,distance);if(world.lineClear(eye,other.pos.clone().add(new T.Vector3(0,1.3,0))))exposure+=Math.max(0,36-distance);}else if(distance<2)crowding+=20;}
    const score=closest-exposure*2-crowding;if(score>bestScore){bestScore=score;best=spawn;}
  }
  return best;
}

const DUST_ROUTES={long:[[640,64,-64],[1280,640,-64],[1440,1760,-16]],short:[[-320,800,-64],[256,1376,0],[512,1856,96]],tunnels:[[-1536,192,0],[-1664,1056,32],[-1984,1664,32],[-1856,2048,0]],midB:[[-320,800,-64],[-448,1472,-64],[-1280,1952,-64],[-1856,2048,0]]};
const pick=(items,random)=>items[Math.min(items.length-1,Math.floor(random()*items.length))];
function shuffle(items,random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function createDustPlan(world,random=Math.random,defenderCount=5){
  const mobile=shuffle([{site:'A',role:'push'},{site:'B',role:'flank'},{site:pick(['A','B'],random),role:'rotate'}],random).slice(0,Math.max(0,defenderCount-2));
  const defenders=shuffle([{site:'A',role:'anchor'},{site:'B',role:'anchor'},...mobile],random);
  return {site:pick(world.bombSites,random).id,style:pick(['rush','split','default'],random),entry:Math.floor(random()*2),order:shuffle([0,1,2,3,4],random),defence:defenders.map(d=>d.site),roles:defenders.map(d=>d.role)};
}
export function dustGuardPoint(world,actor,site,random=Math.random){
  const candidates=world.nodes.filter(n=>{const d=Math.hypot(n.x-site.x,n.z-site.z);return d>2.5&&d<7&&Math.abs(n.y-site.y)<1;});
  for(const n of shuffle(candidates,random).slice(0,18)){const p=asVector(n);if(world.path(actor.pos,p).length)return p;}
  return site.clone();
}
export function assignDustRoute(world,actor,index,rotation=0,targetSite=null,plan=null,random=Math.random,mode='defusal'){
  const order=plan?.order[index%5]??Math.floor(random()*5),attack=actor.team==='t',hunt=mode!=='defusal';
  const siteId=attack?(targetSite||pick(['A','B'],random)):(plan?.defence[index%5]||pick(['A','B'],random));
  actor.objectiveSite=siteId;actor.lane=order%3-1;actor.route=[];actor.routeIndex=0;actor.path=[];actor.pathTime=0;actor.guardPoint=null;actor.guardUntil=0;actor.tacticAt=0;actor.lastSeen=null;
  actor.role=hunt?'hunt':attack?['entry','entry','support','flank','lurk'][order]:plan?.roles?.[index%5]||['anchor','push','anchor','flank','rotate'][order];
  actor.pace=.96+random()*.16;actor.openingWait=hunt?0:attack?(plan?.style==='rush'?random()*.35:random()*1.35):random()*.4;
  actor.combatOffset=random()*8;actor.searchUntil=0;actor.patrolAt=0;
  const options=siteId==='B'?['tunnels','midB']:['long','short'];
  const entry=plan?.style==='rush'?(siteId==='B'?'tunnels':options[plan.entry||0]):plan?.style==='split'?options[order%2]:pick(options,random);
  actor.routeName=attack?entry:hunt?'hunt-'+entry:actor.role==='anchor'?'guard-'+siteId:actor.role+'-'+entry;
  const pushing=!attack&&(hunt||['push','flank'].includes(actor.role));
  const sources=attack?DUST_ROUTES[entry]:pushing?[...DUST_ROUTES[entry]].reverse().slice(0,hunt||actor.role==='flank'?4:2):[];
  let from=actor.pos;for(const raw of sources){const desired=world.convert(raw),n=world.closest(desired);if(!n)continue;const p=asVector(n);if(world.path(from,p).length){actor.route.push(p);from=p;}}
  const site=world.bombSites.find(s=>s.id===siteId);if(site&&!pushing){const n=world.closest(site.pos);if(n){const p=attack?asVector(n):dustGuardPoint(world,actor,site.pos,random);if(world.path(from,p).length){actor.route.push(p);if(!attack)actor.guardPoint=p;}}}
  if(hunt&&!attack){const home=pick(world.spawns.t,random).pos,n=world.closest(home);if(n)actor.route.push(asVector(n));}
}

// Search known junctions, not the live coordinates of hidden opponents.
export function dustSearchPoint(world,actor,random=Math.random){
  const junctions=shuffle(Object.values(DUST_ROUTES).flat(),random);
  for(const raw of junctions){const n=world.closest(world.convert(raw));if(!n)continue;const p=asVector(n),d=p.distanceTo(actor.pos);if(d>7&&d<45&&world.path(actor.pos,p).length)return p;}
  return dustGuardPoint(world,actor,world.bombSites.find(s=>s.id===actor.objectiveSite)?.pos||world.center,random);
}

export function dustCombatMove(actor,target,weapon,speed,time,id=''){
  const dx=target.x-actor.pos.x,dz=target.z-actor.pos.z,d=Math.max(.01,Math.hypot(dx,dz));
  const preferred=weapon.scope?23:weapon.pellets?6.5:['mp5','tmp','p90','mac10'].includes(id)?9:weapon.pistol?10:15;
  const aggressive=['entry','push','flank','hunt'].includes(actor.role),period=(time+(actor.combatOffset||0))%2.6;
  // Short firing plants alternate with committed advances. Opening routes no
  // longer forbid forward movement as soon as an opponent is visible.
  let forward=d>preferred?(aggressive?.90:.66):d>preferred*.65&&aggressive?.40:0;
  if(period>1.85&&period<2.30)forward*=.12;
  if(actor.reload>0)forward=d<preferred*.65?-.46:.1;
  if(d<2.3)forward=-.28;
  const lateral=(weapon.scope?.12:period>1.85?.10:.34)*(actor.strafe||1);
  return {x:(dx/d*forward-dz/d*lateral)*speed,z:(dz/d*forward+dx/d*lateral)*speed};
}
