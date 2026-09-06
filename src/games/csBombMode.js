import * as T from 'three';

export const BOMB_RULES=Object.freeze({roundTime:115,plantTime:3.2,fuseTime:40,defuseTime:10,kitTime:5,buyTime:20});
const flatDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Match-time state only. Rendering, inventory and audio consume returned events;
// pausing the game does not advance a timer or leave an interaction running.
export class BombRound {
  constructor(world){this.world=world;this.status='inactive';this.events=[];this.action=null;this.pos=new T.Vector3();this.carrier=null;this.winner=null;this.reason='';}
  reset(actors,round=1,targetSite=null){
    const attackers=actors.filter(a=>a.team==='t'&&a.alive);
    this.carrier=attackers.find(a=>a.isPlayer)||attackers[(round-1)%attackers.length];
    this.status=this.carrier?'carried':'inactive';this.pos.copy(this.carrier?.pos||new T.Vector3());
    this.remaining=BOMB_RULES.roundTime;this.fuse=BOMB_RULES.fuseTime;this.elapsed=0;this.action=null;this.site=null;this.winner=null;this.reason='';this.events=[];this.blockedFor=null;this.blockedUntil=0;
    this.targetSite=this.world.bombSites.find(s=>s.id===targetSite)||this.world.bombSites[Math.floor(Math.random()*this.world.bombSites.length)];
  }
  siteAt(pos){return this.world.bombSites.find(s=>s.box.containsPoint(pos.clone().add(new T.Vector3(0,.35,0))))||null;}
  canReach(actor,pos,range){return actor.alive&&flatDistance(actor.pos,pos)<=range&&Math.abs(actor.pos.y-pos.y)<1.3&&this.world.lineClear(actor.pos.clone().add(new T.Vector3(0,1.03,0)),pos.clone().add(new T.Vector3(0,.12,0)));}
  canPlant(actor){return this.status==='carried'&&this.carrier===actor&&actor.alive&&actor.team==='t'&&actor.grounded&&!!this.siteAt(actor.pos);}
  canDefuse(actor){return this.status==='planted'&&actor.team==='ct'&&actor.grounded&&this.canReach(actor,this.pos,1.9);}
  drop(actor){if(this.status!=='carried'||actor!==this.carrier)return false;this.pos.copy(actor.pos);this.pos.y=(this.world.ground(actor.pos.x,actor.pos.z,actor.pos.y+.2)??actor.pos.y)+.06;this.carrier=null;this.status='dropped';this.action=null;this.blockedFor=actor;this.blockedUntil=this.elapsed+1;this.events.push({type:'dropped',actor});return true;}
  collect(actors){if(this.status!=='dropped')return;const eligible=actors.filter(a=>a.team==='t'&&!(a===this.blockedFor&&this.elapsed<this.blockedUntil)&&this.canReach(a,this.pos,1.45)).sort((a,b)=>a.pos.distanceToSquared(this.pos)-b.pos.distanceToSquared(this.pos));if(eligible[0]){this.carrier=eligible[0];this.status='carried';this.action=null;this.events.push({type:'picked',actor:this.carrier});}}
  cancel(actor){if(!actor||this.action?.actor===actor)this.action=null;}
  win(team,reason){if(this.winner)return;this.winner=team;this.reason=reason;this.action=null;this.events.push({type:'win',team,reason});}
  resolve(actors){if(this.winner||this.status==='inactive')return;const ct=actors.some(a=>a.alive&&a.team==='ct'),t=actors.some(a=>a.alive&&a.team==='t');if(!ct)this.win('t','反恐精英已被消灭');else if(!t&&this.status!=='planted')this.win('ct','恐怖分子已被消灭');}
  tick(dt,actors,requests=new Set()){
    if(this.winner||this.status==='inactive')return this.drain();this.elapsed+=dt;
    if(this.carrier&&!this.carrier.alive)this.drop(this.carrier);this.collect(actors);
    if(this.status==='carried')this.pos.copy(this.carrier.pos);
    const plantedAtStart=this.status==='planted';
    if(!plantedAtStart)this.remaining=Math.max(0,this.remaining-dt);
    if(this.status==='carried'){
      const a=this.carrier,valid=requests.has(a)&&this.canPlant(a)&&(a.moveSpeed||0)<.2;
      if(!valid)this.action=null;
      else{
        if(this.action?.actor!==a||flatDistance(this.action.origin,a.pos)>.12)this.action={actor:a,kind:'plant',progress:0,duration:BOMB_RULES.plantTime,origin:a.pos.clone()};
        this.action.progress+=dt;
        if(this.action.progress>=BOMB_RULES.plantTime&&this.remaining>0){this.site=this.siteAt(a.pos);this.status='planted';this.carrier=null;this.pos.copy(a.pos);this.pos.y=(this.world.ground(a.pos.x,a.pos.z,a.pos.y+.2)??a.pos.y)+.06;this.fuse=BOMB_RULES.fuseTime;this.action=null;this.events.push({type:'planted',actor:a,site:this.site.id});}
      }
    }else if(plantedAtStart){
      const candidates=actors.filter(a=>requests.has(a)&&this.canDefuse(a)&&(a.moveSpeed||0)<.2),previous=this.action?.actor;
      const a=candidates.includes(previous)?previous:candidates[0];
      if(!a)this.action=null;
      else{
        if(this.action?.actor!==a)this.action={actor:a,kind:'defuse',progress:0,duration:a.defuseKit?BOMB_RULES.kitTime:BOMB_RULES.defuseTime,origin:a.pos.clone()};
        const needed=this.action.duration-this.action.progress;
        if(needed<=dt+1e-8&&needed<=this.fuse+1e-8){this.status='defused';this.events.push({type:'defused',actor:a});this.win('ct','炸弹已拆除');}
        else this.action.progress+=dt;
      }
      if(!this.winner){this.fuse=Math.max(0,this.fuse-dt);if(this.fuse<=0){this.status='exploded';this.events.push({type:'exploded'});this.win('t','炸弹已爆炸');}}
    }
    if(!this.winner&&this.remaining<=0&&this.status!=='planted')this.win('ct','时间耗尽 · 包点防守成功');
    this.resolve(actors);return this.drain();
  }
  drain(){const events=this.events;this.events=[];return events;}
}
