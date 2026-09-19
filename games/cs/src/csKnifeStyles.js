// All appearances use the same knife inventory slot and combat rules.
export const DEFAULT_KNIFE_MODEL='classic';
export const KNIFE_MODELS=Object.freeze({classic:'经典匕首',karambit:'爪刀',butterfly:'蝴蝶刀'});
export const normalizeKnifeModel=value=>Object.hasOwn(KNIFE_MODELS,value)?value:DEFAULT_KNIFE_MODEL;
export const knifeName=value=>KNIFE_MODELS[normalizeKnifeModel(value)];
