import * as T from 'three';
import {buildWeapon} from './csWeaponModels.js';
import {buildSoldier} from './csSoldierModels.js';
export {attachSoldierWeapon,poseSoldierWeapon} from './csSoldierModels.js';
export const WEAPONS={
  c4:{name:'C4 Explosive',type:'包点内按住左键安放 · 5 切换 · G 丢弃',mag:1,reserve:0,damage:0,rate:0,reload:0,spread:0,recoil:0,range:0,auto:false,utility:true},
  ak47:{name:'AK-47',type:'步枪 · 全自动',mag:30,reserve:90,damage:35,rate:.105,reload:2.4,spread:.006,recoil:.019,range:100,auto:true,wood:true},
  m4a1:{name:'M4A1-S',type:'消音步枪 · 全自动',mag:25,reserve:100,damage:31,rate:.092,reload:2.2,spread:.0045,recoil:.013,range:100,auto:true,silencer:true},
  awp:{name:'AWP',type:'一击毙命 · 栓动狙击步枪',mag:5,reserve:30,damage:115,rate:1.45,reload:3.15,spread:.0015,recoil:.055,range:130,auto:false,scope:true,boltAction:true,oneHitKill:true},
  mp5:{name:'MP5-SD',type:'消音冲锋枪 · 全自动',mag:30,reserve:120,damage:23,rate:.075,reload:1.9,spread:.009,recoil:.01,range:70,auto:true,silencer:true},
  tmp:{name:'MP9',type:'冲锋枪 · 全自动',mag:30,reserve:120,damage:26,rate:.07,reload:2.1,spread:.01,recoil:.009,range:65,auto:true},
  p90:{name:'P90',type:'冲锋枪 · 50 发弹匣',mag:50,reserve:100,damage:21,rate:.07,reload:2.6,spread:.011,recoil:.01,range:70,auto:true},
  mac10:{name:'MAC-10',type:'冲锋枪 · 全自动',mag:30,reserve:100,damage:24,rate:.075,reload:2,spread:.014,recoil:.015,range:60,auto:true},
  sg552:{name:'SG 553',type:'突击步枪 · 右键瞄准',mag:30,reserve:90,damage:31,rate:.11,reload:2.5,spread:.006,recoil:.016,range:100,auto:true,optics:true},
  aug:{name:'AUG',type:'突击步枪 · 右键瞄准',mag:30,reserve:90,damage:30,rate:.092,reload:2.5,spread:.005,recoil:.014,range:100,auto:true,optics:true},
  scout:{name:'SSG 08',type:'轻型狙击步枪 · 右键开镜',mag:10,reserve:60,damage:78,rate:1.1,reload:2.6,spread:.002,recoil:.035,range:125,auto:false,scope:true,boltAction:true},
  g3sg1:{name:'G3SG1',type:'半自动狙击步枪 · 右键开镜',mag:20,reserve:60,damage:65,rate:.32,reload:3,spread:.003,recoil:.024,range:120,auto:false,scope:true},
  m3:{name:'Nova',type:'泵动霰弹枪 · 近距离散射',mag:8,reserve:32,damage:16,rate:.9,reload:3.1,spread:.065,recoil:.045,range:35,auto:false,pellets:8,pumpAction:true},
  xm1014:{name:'XM1014',type:'半自动霰弹枪 · 近距离散射',mag:7,reserve:32,damage:14,rate:.3,reload:3,spread:.07,recoil:.035,range:35,auto:true,pellets:7},
  m249:{name:'M249',type:'轻机枪 · 100 发弹箱',mag:100,reserve:200,damage:30,rate:.085,reload:4,spread:.013,recoil:.02,range:100,auto:true},
  he:{name:'HE Grenade',type:'左键远投 · 右键近投',mag:1,reserve:0,damage:95,rate:1.5,reload:0,spread:0,recoil:0,range:9,auto:false,utility:true},
  armor:{name:'Kevlar + Helmet',type:'补满护甲',mag:0,reserve:0,damage:0,rate:0,reload:0,spread:0,recoil:0,range:0,auto:false,utility:true},
  deagle:{name:'Desert Eagle',type:'大口径手枪 · 半自动',mag:7,reserve:35,damage:51,rate:.28,reload:2,spread:.008,recoil:.04,range:90,auto:false,pistol:true},
  usp:{name:'USP-S',type:'消音手枪 · 半自动',mag:12,reserve:48,damage:26,rate:.17,reload:1.8,spread:.006,recoil:.016,range:80,auto:false,pistol:true,silencer:true},
  glock:{name:'Glock-18',type:'手枪 · 半自动',mag:20,reserve:60,damage:22,rate:.15,reload:1.9,spread:.008,recoil:.013,range:80,auto:false,pistol:true},
  knife:{name:'Knife',type:'左键挥砍 · 右键重刺',mag:0,reserve:0,damage:40,rate:.5,reload:0,spread:0,recoil:0,range:1.8,auto:false}
};
export function makeWeapon(id='ak47',hands=false){return buildWeapon(id,WEAPONS[id],hands);}
export const SOLDIER_HITBOX={neck:1.52,top:1.81,halfWidth:.115,halfDepth:.155};
export function makeSoldier(team){return buildSoldier(team,makeWeapon);}
