const memory = new Map<string, string>();
/** Storage may be unavailable in private/embedded browsers; play must still work. */
export function readPreference(key: string): string | null {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null; }
  catch { return memory.get(key) ?? null; }
}
export function savePreference(key: string, value: string): void {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* session memory remains usable */ }
}
