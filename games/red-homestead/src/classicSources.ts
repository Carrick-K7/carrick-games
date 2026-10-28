import type { LocalSourceFiles } from './classicTypes.js';
import { mixFilenameId, parseMix } from './ra2/mix.js';
import type { MixArchive } from './ra2/mix.js';

export class ClassicSourceError extends Error {
  readonly name = 'ClassicSourceError';
  readonly recoverable = true;
}
export const SOURCE_LIMITS = Object.freeze({ files: 16384, inputBytes: 512 * 1024 * 1024,
  archiveDepth: 4, archives: 128, indexedBytes: 1024 * 1024 * 1024, entries: 262144, lookupNames: 65536 });

/** Paths are labels, never filesystem access. Do not silently choose between equal basenames. */
export function normalizeSourceName(path: string): string {
  if (typeof path !== 'string' || !path || path.length > 4096 || /[\x00-\x1f\x7f]/.test(path)) {
    throw new ClassicSourceError('Invalid local resource name');
  }
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.some(part => part === '..')) throw new ClassicSourceError(`Unsafe local resource path: ${path}`);
  const name = parts[parts.length - 1].normalize('NFC').toLowerCase();
  if (!name || name === '.' || name.length > 255 || /[<>:"|?*]/.test(name)) {
    throw new ClassicSourceError(`Invalid local resource name: ${path}`);
  }
  return name;
}

// MIX stores hashes, not filenames. Only these explicit known archive names are traversed;
// arbitrary entries are never probed as executable content, recursively sniffed or extracted.
const ARCHIVE_NAMES = [
  'ra2.mix', 'ra2md.mix', 'language.mix', 'langmd.mix', 'local.mix', 'localmd.mix',
  'cache.mix', 'cachemd.mix', 'conquer.mix', 'conqmd.mix', 'generic.mix', 'genermd.mix',
  'isotemp.mix', 'isosnow.mix', 'isourb.mix', 'isoubn.mix', 'isodes.mix', 'isolun.mix',
  'isotem.mix', 'isosno.mix', 'temperat.mix', 'snow.mix', 'urban.mix', 'urbann.mix',
  'desert.mix', 'lunar.mix', 'tem.mix', 'sno.mix', 'urb.mix', 'ubn.mix', 'des.mix', 'lun.mix',
  'isogen.mix', 'isogenmd.mix', 'isotemmd.mix', 'isosnomd.mix', 'isourbmd.mix', 'isoubnmd.mix', 'isodesmd.mix', 'isolunmd.mix',
  'temperatmd.mix', 'snowmd.mix', 'urbanmd.mix', 'urbannmd.mix', 'desertmd.mix', 'lunarmd.mix',
  ...Array.from({ length: 99 }, (_, i) => ['expand', 'expandmd', 'ecache', 'ecachemd']
    .map(prefix => `${prefix}${String(i + 1).padStart(2, '0')}.mix`)).flat(),
];
const ARCHIVE_IDS = new Map(ARCHIVE_NAMES.map(name => [mixFilenameId(name), name]));
interface Source { bytes: Uint8Array; label: string }
interface Archive { archive: MixArchive; label: string }

/** Read-only local selection, with zero-copy MIX views. The caller must not mutate input bytes.
 * get/has throw on ambiguity (including loose-versus-archive), rather than impose a mod load order.
 * knownNames contains loose names and successful explicit lookups, not imaginary MIX filenames.
 */
export class SourceLibrary {
  readonly warnings: string[] = [];
  private readonly loose = new Map<string, Source>();
  private readonly archives: Archive[] = [];
  private readonly resolved = new Map<string, Source | undefined>();
  private readonly names = new Set<string>();
  private indexedBytes = 0;
  private entryCount = 0;
  private archiveCount = 0;

  constructor(files: LocalSourceFiles) {
    if (!files || typeof files.entries !== 'function' || files.size > SOURCE_LIMITS.files) {
      throw new ClassicSourceError(`Local selection exceeds ${SOURCE_LIMITS.files} files`);
    }
    let total = 0;
    for (const [path, bytes] of files) {
      const name = normalizeSourceName(path);
      if (!(bytes instanceof Uint8Array)) throw new ClassicSourceError(`${path}: expected local Uint8Array`);
      total += bytes.byteLength;
      if (total > SOURCE_LIMITS.inputBytes) throw new ClassicSourceError('Local selection exceeds 512 MiB input limit');
      const previous = this.loose.get(name);
      if (previous) throw new ClassicSourceError(`Ambiguous resource ${name}: ${previous.label} and ${path}; select only one`);
      this.loose.set(name, { bytes, label: path }); this.names.add(name);
    }
    for (const [name, source] of this.loose) if (name.endsWith('.mix')) this.indexArchive(source, 1);
  }

  private indexArchive(source: Source, depth: number): void {
    if (depth > SOURCE_LIMITS.archiveDepth) throw new ClassicSourceError(`${source.label}: MIX nesting exceeds ${SOURCE_LIMITS.archiveDepth}`);
    if (++this.archiveCount > SOURCE_LIMITS.archives) throw new ClassicSourceError('MIX archive count limit exceeded');
    this.indexedBytes += source.bytes.byteLength;
    if (this.indexedBytes > SOURCE_LIMITS.indexedBytes) throw new ClassicSourceError('Total nested MIX byte budget exceeded');
    let archive: MixArchive;
    try { archive = parseMix(source.bytes); }
    catch (error) {
      // Unsupported encrypted archives remain visibly unavailable; unrelated loose data is usable.
      if (error instanceof Error && /Encrypted MIX/.test(error.message)) {
        this.warnings.push(`${source.label}: encrypted MIX is unsupported; supply extracted, legally available local files instead.`);
        return;
      }
      throw new ClassicSourceError(`${source.label}: ${error instanceof Error ? error.message : 'Invalid MIX'}`);
    }
    this.entryCount += archive.entries.length;
    if (this.entryCount > SOURCE_LIMITS.entries) throw new ClassicSourceError('Total MIX index entry limit exceeded');
    this.archives.push({ archive, label: source.label });
    if (archive.checksum !== 'absent') this.warnings.push(`${source.label}: MIX checksum is present but not authenticated.`);
    for (const entry of archive.entries) {
      const name = ARCHIVE_IDS.get(entry.id);
      if (name) {
        this.names.add(name);
        this.indexArchive({ bytes: archive.getById(entry.id)!, label: `${source.label}/${name}` }, depth + 1);
      }
    }
  }

  private resolve(path: string): Source | undefined {
    const name = normalizeSourceName(path);
    if (this.resolved.has(name)) return this.resolved.get(name);
    if (this.resolved.size >= SOURCE_LIMITS.lookupNames) throw new ClassicSourceError('Resource lookup-name limit exceeded');
    const matches: Source[] = [];
    const direct = this.loose.get(name);
    if (direct) matches.push(direct);
    if (/^[\x20-\x7e]+$/.test(name)) {
      const id = mixFilenameId(name);
      for (const { archive, label } of this.archives) {
        const bytes = archive.getById(id);
        if (bytes) matches.push({ bytes, label: `${label}/${name}` });
      }
    }
    if (matches.length > 1) {
      throw new ClassicSourceError(`Ambiguous resource ${name}: ${matches.map(item => item.label).join(', ')}; select only one source`);
    }
    const match = matches[0];
    this.resolved.set(name, match);
    if (match) this.names.add(name);
    return match;
  }

  get(name: string): Uint8Array | undefined { return this.resolve(name)?.bytes; }
  has(name: string): boolean { return this.resolve(name) !== undefined; }
  provenance(name: string): string | undefined { return this.resolve(name)?.label; }
  knownNames(): string[] { return [...this.names].sort(); }
}
