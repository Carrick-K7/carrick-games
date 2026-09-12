/** Optional game-owned QA hooks; these are not shell integration capabilities. */
export function installGameDebug(name: string, hooks: Record<string, (...args: any[]) => unknown>): () => void {
  if (!/^__[A-Z][A-Z0-9_]*__$/.test(name)) throw new Error('Use a namespaced game debug hook');
  const scope = window as unknown as Record<string, unknown>;
  let live = true;
  const guarded: Record<string, (...args: unknown[]) => unknown> = Object.fromEntries(Object.entries(hooks).map(([key, run]) => [key, (...args: unknown[]) => {
    if (!live || scope[name] !== guarded) return undefined;
    return run(...args);
  }]));
  scope[name] = guarded;
  return () => {
    live = false;
    if (scope[name] === guarded) delete scope[name];
  };
}
