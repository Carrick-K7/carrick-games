export const DEFAULT_SETTINGS=Object.freeze({sensitivity:.8,scopeSensitivity:1});
const limit=(value,fallback,min,max)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function normalizeSettings(value={}){return {sensitivity:limit(value?.sensitivity,.8,.1,4),scopeSensitivity:limit(value?.scopeSensitivity,1,.1,2)};}
export function loadSettings(){try{return normalizeSettings(JSON.parse(localStorage.getItem('cs.controls.v1')));}catch{return {...DEFAULT_SETTINGS};}}
export function saveSettings(value){try{localStorage.setItem('cs.controls.v1',JSON.stringify(normalizeSettings(value)));return true;}catch{return false;}}
// Preserve the current unscoped feel; apply the scope multiplier to FOV-scaled input.
export function lookSensitivity(settings,scoped=false,fov=76){return settings.sensitivity*(scoped?settings.scopeSensitivity*fov/76:1);}
