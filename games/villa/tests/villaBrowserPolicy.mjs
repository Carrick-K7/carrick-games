// Test-side only. A short path must be proven by the real release plan; an
// unfamiliar file or an absent/wrong baseline costs time, never coverage.
import { isDeepStrictEqual } from 'node:util';

const SHA = /^[0-9a-f]{40}$/;
const art = new Set(['public/cover.webp','public/icon.svg']);
const outdoors = new Set(['src/villaLawnFinish.ts','src/villaRiparianMotion.ts','src/villaStreamSurfaceChart.ts','src/villaPoolCirculation.ts']);
const full = reason => ({ tier:'full', proposed:'full', reason });

function versionOnly(before, after) {
  if (!before || !after || typeof before.version !== 'string' || typeof after.version !== 'string') return false;
  const {version:old, ...a}=before, {version:next, ...b}=after;
  return old !== next && isDeepStrictEqual(a,b);
}
function villaVersionLock(before, after) {
  const key='games/villa';
  const left=before?.packages?.[key], right=after?.packages?.[key];
  if (!versionOnly(left,right)) return false;
  return isDeepStrictEqual(before,{...after,packages:{...after.packages,[key]:left}});
}

/** Only emit a narrow proposal for reviewed, leaf-level assets. The lock and
 * manifest must have a *proven* version-only edit; syntax/route/gameplay edits
 * and new test or policy files are never made cheap by a file-name prefix. */
export function classifyVillaInputs(reasons, beforeAndAfter) {
  if (!Array.isArray(reasons) || !reasons.length) return 'full';
  const locals=new Set(); let lock=false;
  for (const r of reasons) {
    if (typeof r!=='string') return 'full';
    const m=/^(?:pending|trigger):runtime:villa:games\/villa\/(.+)$/.exec(r);
    if(m) locals.add(m[1]);
    else if(/^(?:pending|trigger):workspace-lock:villa$/.test(r)) lock=true;
    else return 'full';
  }
  let copyOnly=false;
  try {
    if (lock && !villaVersionLock(...beforeAndAfter('package-lock.json'))) return 'full';
    if (locals.delete('package.json') && !versionOnly(...beforeAndAfter('games/villa/package.json'))) return 'full';
    if (locals.delete('game.json')) {
      const stripCopy=({name,nameZh,desc,descZh,...rest})=>rest;
      const [a,b]=beforeAndAfter('games/villa/game.json');
      if (!isDeepStrictEqual(stripCopy(a),stripCopy(b))) return 'full';
      copyOnly=true;
    }
  } catch { return 'full'; }
  if ((!copyOnly && !locals.size) || [...locals].some(file=>!art.has(file)&&!outdoors.has(file))) return 'full';
  return [...locals].some(file=>outdoors.has(file)) ? 'outdoor' : 'core';
}

/** Main starts in observation mode: run the full suite on the first three
 * target generations of this rollout. A periodic full pass remains on every
 * fifth target generation. Retried runs and accumulated/unhandled changes do
 * not get to select fewer tests. This policy cannot produce a publish receipt. */
export function chooseVillaTier({plan, head, cleanBeforeChange, attempt, paired, beforeAndAfter}) {
  const v=plan?.targets?.find(t=>t.id==='villa'), live=plan?.snapshot?.catalog?.games?.find(g=>g.id==='villa');
  if (!SHA.test(head??'') || !paired || !v || !live || plan.schemaVersion!==1 || head!==plan.revision ||
    !['main','pr'].includes(plan.mode) || plan.full!==false || plan.bootstrap!==false || plan.sourceOnly!==false ||
    v.full!==false || v.error || v.hidden || !SHA.test(v.baseline??'') || attempt!==1 ||
    !Number.isSafeInteger(v.expectedGeneration) || v.expectedGeneration<1 || live.generation!==v.expectedGeneration) return full('full, retried or unverifiable plan');
  if (!cleanBeforeChange || live.revision!==live.handledRevision || (plan.mode==='main' && v.baseline!==live.handledRevision)) return full('unhandled changes, rollback or unknown preceding push');
  const proposed=classifyVillaInputs(v.reasons,beforeAndAfter);
  if(proposed==='full') return full('cross-cutting, test or unclassified inputs');
  // The audit was accepted with Villa at generation 18. Check new proposals
  // against complete published-candidate runs before trusting them on main.
  if (plan.mode==='main' && live.generation<21) return {tier:'full',proposed,reason:'rollout comparison'};
  if (plan.mode==='main' && (live.generation+1)%5===0) return {tier:'full',proposed,reason:'periodic full regression'};
  return {tier:proposed,proposed,reason:'only reviewed Villa leaf inputs'};
}
