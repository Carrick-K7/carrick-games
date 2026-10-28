import type { ClassicImportOptions } from './classicTypes.js';
import type { ClassicSummary } from './classicStorage.js';
interface ClassicPanelHost {
  text(zh: string, en: string): string;
  button(label: string, id: string, action: () => void): HTMLButtonElement;
  catalog: ClassicSummary[];
  import(files: File[], options: ClassicImportOptions, output: HTMLElement): Promise<void>;
  start(id: string, mode: 'session'|'homestead'): void;
  apply(id: string): void;
  active: boolean;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); if (text) node.textContent = text; return node; }
export function drawClassicPanel(dialog: HTMLElement, host: ClassicPanelHost) {
  const t = host.text;
  dialog.append(el('h2', t('经典素材与地图', 'Classic materials & maps')));
  const note = el('p', t('读取你有权使用的原始文件，在浏览器本地保存并实际用于采矿、建造和家园。原始文件不上传、不随游戏分发。', 'Import source files you may use. They stay in this browser and become actual playable city materials. No upload or bundled original assets.')); note.className = 'rh-note'; dialog.append(note);
  const help = el('p', t('地图需 MAP/MPR、对应 theater INI、ISO 调色板与所用 TMP；矿区另需 rules.ini 和 overlay 数据。建筑/车辆需 UNIT 色盘与和平 SHP/VXL/HVA。可选提取后的文件，或未加密 MIX。不要混选不同版本的同名资源。', 'Maps need MAP/MPR, matching theater INI, ISO palette and referenced TMP tiles; ore also needs rules.ini and overlay data. Buildings/vehicles need UNIT palette and peaceful SHP/VXL/HVA. Use extracted files or unencrypted MIX; do not mix conflicting versions.')); help.className = 'rh-muted'; dialog.append(help);
  const fileLabel = el('label', t('选择资源文件（支持多选）', 'Choose source files (multiple)')), input = el('input');
  input.type = 'file'; input.multiple = true; input.accept = '.map,.mpr,.ini,.pal,.shp,.vxl,.hva,.mix,.tmp,.tem,.sno,.urb,.ubn,.des,.lun'; input.dataset.rhAction = 'classic-files'; fileLabel.append(input);
  const folderLabel = el('label', t('或选择已提取的资源文件夹', 'Or choose an extracted source folder')), folder = el('input');
  folder.type = 'file'; folder.multiple = true; folder.webkitdirectory = true; folder.dataset.rhAction = 'classic-folder'; folderLabel.append(folder);
  const labelLabel = el('label', t('素材包名称', 'Material set name')), label = el('input'); label.maxLength = 80; label.value = t('我的经典素材', 'My classic materials'); labelLabel.append(label);
  const mapLabel = el('label', t('地图文件（留空只导入建筑和车辆）', 'Map filename (blank imports only sprites)')), map = el('input'); map.placeholder = 'example.map'; map.dataset.rhField = 'classic-map'; mapLabel.append(map);
  const theaterLabel = el('label', t('仅导入素材时的地形风格', 'Theater for sprite-only imports')), theater = el('select');
  for (const value of ['TEMPERATE','SNOW','URBAN','NEWURBAN','DESERT','LUNAR']) { const option = el('option', value); option.value = value; theater.append(option); } theaterLabel.append(theater);
  const encodingLabel = el('label', t('地图文字编码', 'Map text encoding')), encoding = el('select');
  for (const value of ['utf-8','windows-1252','gb18030']) { const option = el('option', value); option.value = value; encoding.append(option); } encodingLabel.append(encoding);
  let files: File[] = [];
  const selected = el('p'); selected.className = 'rh-muted';
  const pick = (value: FileList | null) => {
    files = [...(value ?? [])].filter(file => /\.(map|mpr|ini|pal|shp|vxl|hva|mix|tmp|tem|sno|urb|ubn|des|lun)$/i.test(file.name));
    selected.textContent = t(`已选 ${files.length} 个资源文件`, `${files.length} source files selected`);
    const maps = files.filter(file => /\.(map|mpr)$/i.test(file.name)); map.value = maps.length === 1 ? maps[0]!.name : '';
  };
  input.addEventListener('change', () => pick(input.files)); folder.addEventListener('change', () => pick(folder.files));
  const output = el('div'); output.className = 'rh-note'; output.dataset.rhImportStatus = 'true'; output.setAttribute('role','status');
  output.textContent = t('单次最多 256 MiB。缺失地块会明确列出，不用假地形替代；桥梁和地图布景仍为先行支持。', 'Up to 256 MiB. Missing ground tiles cause an explicit error, not substitute terrain. Bridges and map scenery remain early support.');
  const run = host.button(t('导入到本机素材库', 'Import into local library'), 'classic-import', () => {
    run.disabled = true;
    void host.import(files, { label: label.value, mapFile: map.value.trim() || undefined,
      theater: map.value.trim() ? undefined : theater.value as ClassicImportOptions['theater'], encoding: encoding.value as ClassicImportOptions['encoding'] }, output).finally(() => { run.disabled = false; });
  });
  dialog.append(fileLabel, folderLabel, selected, labelLabel, mapLabel, theaterLabel, encodingLabel, run, output);
  const catalog = el('div'); catalog.dataset.rhClassicCatalog = 'true'; catalog.className = 'rh-list'; fillClassicCatalog(catalog, host); dialog.append(catalog);
}
export function fillClassicCatalog(container: HTMLElement, host: ClassicPanelHost) {
  container.replaceChildren(); const t = host.text;
  container.append(el('h3', t('本机素材库', 'Local material library')));
  if (!host.catalog.length) container.append(el('p', t('尚无已导入素材。', 'No imported materials yet.')));
  for (const item of host.catalog) {
    const row = el('section'); row.className = 'rh-material-card'; row.append(el('strong', item.label));
    row.append(el('p', t(`${item.mapName ? `地图：${item.mapName} · ` : ''}${item.buildings} 类建筑 · ${item.units} 类单位`, `${item.mapName ? `Map: ${item.mapName} · ` : ''}${item.buildings} building types · ${item.units} unit types`)));
    const actions = el('div'); actions.className = 'rh-row';
    actions.append(host.button(t('悠闲一局', 'New session'), `classic-session-${item.id}`, () => host.start(item.id, 'session')),
      host.button(t('长住家园', 'New homestead'), `classic-home-${item.id}`, () => host.start(item.id, 'homestead')));
    if (host.active && (item.buildings || item.units)) actions.append(host.button(t('用于当前城市', 'Apply to current city'), `classic-apply-${item.id}`, () => host.apply(item.id)));
    row.append(actions);
    if (item.warnings.length) { const details = el('details'); details.append(el('summary', t(`兼容说明（${item.warnings.length}）`, `Compatibility notes (${item.warnings.length})`)));
      for (const warning of item.warnings) { const note = el('p', warning); note.className = 'rh-muted'; details.append(note); } row.append(details); }
    container.append(row);
  }
}
