import { VILLA_HOME_LIGHTS, VILLA_SECURITY_CAMERAS, VILLA_LOOK_SENSITIVITY, type VillaHomeState, type VillaTimeOfDay, type VillaWeather } from './villaHome.js';

export interface VillaTerminalSnapshot {
  home: VillaHomeState; zh: boolean; dark: boolean; version: string;
  aimAssist: boolean; fireplace: boolean; aquarium: boolean; petsSheltered: number; petCount: number;
}
export interface VillaTerminalActions {
  close(): void;
  light(id: string, on: boolean): void;
  allLights(on: boolean): void;
  time(value: VillaTimeOfDay): void;
  weather(value: VillaWeather): void;
  sensitivity(value: number): void;
  aimAssist(on: boolean): void;
  fireplace(on: boolean): void;
  aquarium(on: boolean): void;
  /** Only older/isolation hosts without presentation.setActions need these. */
  home?(): void;
  immersive?(): void;
}
export interface VillaTerminal {
  readonly element: HTMLElement;
  readonly visible: boolean;
  readonly cameraId: string | null;
  show(snapshot: VillaTerminalSnapshot): void;
  hide(): void;
  update(snapshot: VillaTerminalSnapshot): void;
  presentCamera(canvas: HTMLCanvasElement | null): void;
  destroy(): void;
}
/** Game-scoped native controls, not a replacement shell or a second operation guide. */
export function createVillaTerminal(canvas: HTMLCanvasElement, actions: VillaTerminalActions): VillaTerminal {
  const root = document.createElement('div'); root.dataset.villaTerminal = ''; root.hidden = true;
  const style = document.createElement('style');
  style.textContent = `
div[data-villa-terminal][hidden]{display:none!important}
div[data-villa-terminal]{position:absolute;inset:0;z-index:35;display:grid;place-items:center;padding:calc(64px + env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) max(12px,env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left,0px));background:#14201c66;color:var(--vt-ink);font:14px/1.45 system-ui,-apple-system,sans-serif;box-sizing:border-box}
div[data-villa-terminal] *{box-sizing:border-box}
div[data-villa-terminal] .vt-panel{display:flex;flex-direction:column;width:min(960px,100%);max-height:100%;border:1px solid var(--vt-line);border-radius:18px;background:var(--vt-bg);box-shadow:0 18px 70px #0005;overflow:hidden}
div[data-villa-terminal] .vt-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--vt-line)}
div[data-villa-terminal] h2{font-size:19px;margin:0;font-weight:650}
div[data-villa-terminal] .vt-sub{font-size:12px;color:var(--vt-muted)}
div[data-villa-terminal] button{min-width:44px;min-height:44px;padding:9px 14px;border:1px solid var(--vt-line);border-radius:10px;background:var(--vt-card);color:inherit;font:inherit;cursor:pointer;touch-action:manipulation}
div[data-villa-terminal] button:hover{border-color:var(--vt-accent)}
div[data-villa-terminal] button:focus-visible,div[data-villa-terminal] input:focus-visible{outline:3px solid var(--vt-accent);outline-offset:2px}
div[data-villa-terminal] button[aria-pressed=true]{background:var(--vt-selected);border-color:var(--vt-accent)}
div[data-villa-terminal] .vt-close{font-size:24px;line-height:1;width:44px;flex:0 0 44px;padding:4px}
div[data-villa-terminal] .vt-tabs{display:flex;gap:7px;padding:10px 16px;overflow-x:auto;border-bottom:1px solid var(--vt-line);flex-shrink:0}
div[data-villa-terminal] .vt-tabs button{white-space:nowrap;flex:1}
div[data-villa-terminal] .vt-content{overflow:auto;padding:16px;overscroll-behavior:contain}
div[data-villa-terminal] section[hidden]{display:none!important}
div[data-villa-terminal] .vt-camera{display:grid;grid-template-columns:minmax(0,1fr) 155px;gap:12px}
div[data-villa-terminal] .vt-feed{margin:0;min-width:0;background:#17251f;border-radius:12px;overflow:hidden;color:#edf5ed}
div[data-villa-terminal] canvas{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#17251f}
div[data-villa-terminal] figcaption{padding:9px 12px;font-size:12px}
div[data-villa-terminal] .vt-camera-list{display:flex;flex-direction:column;gap:7px}
div[data-villa-terminal] .vt-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
div[data-villa-terminal] .vt-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px}
div[data-villa-terminal] .vt-note{color:var(--vt-muted);margin:10px 0 0;font-size:12px}
div[data-villa-terminal] .vt-settings{max-width:680px;margin:auto}
div[data-villa-terminal] input[type=range]{width:100%;height:44px;accent-color:var(--vt-accent)}
div[data-villa-terminal] .vt-range-label{display:flex;justify-content:space-between;gap:12px}
div[data-villa-terminal] .vt-weather{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:20px}
@media(max-width:620px){div[data-villa-terminal]{padding:calc(64px + env(safe-area-inset-top,0px)) max(7px,env(safe-area-inset-right,0px)) max(7px,env(safe-area-inset-bottom,0px)) max(7px,env(safe-area-inset-left,0px));font-size:13px}div[data-villa-terminal] .vt-head{padding:10px 12px}div[data-villa-terminal] .vt-content{padding:12px}div[data-villa-terminal] .vt-tabs{padding:8px;gap:5px}div[data-villa-terminal] .vt-tabs button{padding:8px 9px}div[data-villa-terminal] .vt-camera{grid-template-columns:1fr}div[data-villa-terminal] .vt-camera-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}div[data-villa-terminal] .vt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:621px) and (max-height:560px){
  div[data-villa-terminal] .vt-head{padding:6px 12px}
  div[data-villa-terminal] h2{font-size:17px}
  div[data-villa-terminal] .vt-sub{display:none}
  div[data-villa-terminal] .vt-tabs{padding:6px 12px;gap:6px}
  div[data-villa-terminal] .vt-content{padding:8px 12px;min-height:0}
  div[data-villa-terminal] .vt-camera{align-items:start}
  div[data-villa-terminal] .vt-feed canvas{width:auto;max-width:100%;height:max(60px,calc(100dvh - 230px));max-height:260px;margin:auto}
  div[data-villa-terminal] figcaption{padding:4px 8px;font-size:11px;line-height:1.2}
  div[data-villa-terminal] .vt-camera-list{max-height:max(80px,calc(100dvh - 208px));overflow-y:auto;padding-right:2px}
  div[data-villa-terminal] .vt-camera + .vt-note{display:none}
}
`;
  root.append(style);
  const panel = document.createElement('div'); panel.className = 'vt-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); root.append(panel);
  const localizations: { node: HTMLElement; en: string; zh: string }[] = [];
  const text = (tag: string, en: string, zh: string, parent: HTMLElement, className = '') => {
    const node = document.createElement(tag); node.className = className; parent.append(node);
    localizations.push({ node, en, zh }); return node;
  };
  const button = (en: string, zh: string, parent: HTMLElement, callback: () => void) => {
    const node = text('button', en, zh, parent) as HTMLButtonElement;
    node.type = 'button'; node.addEventListener('click', callback); return node;
  };
  const head = document.createElement('div'); head.className = 'vt-head'; panel.append(head);
  const heading = document.createElement('div'); head.append(heading);
  const title = text('h2', 'Villa smart terminal', '别墅智能终端', heading);
  const titleId = `villa-terminal-title-${Math.random().toString(36).slice(2, 9)}`; title.id = titleId; panel.setAttribute('aria-labelledby', titleId);
  const sub = text('div', '', '', heading, 'vt-sub'); sub.dataset.villaTerminalVersion = '';
  const close = button('×', '×', head, actions.close); close.className = 'vt-close'; close.dataset.villaTerminalClose = '';
  const tabs = document.createElement('div'); tabs.className = 'vt-tabs'; tabs.setAttribute('role', 'tablist'); panel.append(tabs);
  const content = document.createElement('div'); content.className = 'vt-content'; panel.append(content);
  const sections = new Map<string, HTMLElement>(), tabButtons = new Map<string, HTMLButtonElement>();
  let tab = 'cameras', camera = VILLA_SECURITY_CAMERAS[0]!.id, current: VillaTerminalSnapshot | null = null;
  const selectTab = (id: string) => {
    tab = id;
    for (const [key, section] of sections) section.hidden = key !== id;
    for (const [key, item] of tabButtons) { item.setAttribute('aria-selected', String(key === id)); item.setAttribute('aria-pressed', String(key === id)); }
  };
  for (const [id, en, zh] of [['cameras', 'Cameras', '监控'], ['home', 'Home', '家居'], ['weather', 'Weather', '天气'], ['settings', 'Settings', '设置']]) {
    const item = button(en!, zh!, tabs, () => selectTab(id!)); item.dataset.villaTerminalTab = id; item.setAttribute('role', 'tab'); tabButtons.set(id!, item);
    const section = document.createElement('section'); section.dataset.villaTerminalPage = id; section.setAttribute('role', 'tabpanel'); content.append(section); sections.set(id!, section);
  }
  const cameraPage = sections.get('cameras')!, cameraLayout = document.createElement('div'); cameraLayout.className = 'vt-camera'; cameraPage.append(cameraLayout);
  const figure = document.createElement('figure'); figure.className = 'vt-feed'; cameraLayout.append(figure);
  const monitor = document.createElement('canvas'); monitor.width = 512; monitor.height = 288; monitor.dataset.villaSecurityFeed = ''; figure.append(monitor);
  const caption = document.createElement('figcaption'); figure.append(caption);
  const cameraList = document.createElement('div'); cameraList.className = 'vt-camera-list'; cameraLayout.append(cameraList);
  const cameraButtons = new Map<string, HTMLButtonElement>();
  const refreshCamera = () => {
    for (const [id, item] of cameraButtons) item.setAttribute('aria-pressed', String(id === camera));
    const info = VILLA_SECURITY_CAMERAS.find(item => item.id === camera)!;
    caption.textContent = current?.zh ? `${info.zh} · 实时画面` : `${info.name} · Live view`;
    monitor.setAttribute('aria-label', caption.textContent);
  };
  for (const info of VILLA_SECURITY_CAMERAS) {
    const item = button(info.name, info.zh, cameraList, () => { camera = info.id; refreshCamera(); });
    item.dataset.villaCamera = info.id; cameraButtons.set(info.id, item);
  }
  text('p', 'Live local cameras. North is behind the house; the entrance faces south.', '别墅关键位置的实时画面。屋后为北，大门朝南。', cameraPage, 'vt-note');
  const homePage = sections.get('home')!, allRow = document.createElement('div'); allRow.className = 'vt-row'; homePage.append(allRow);
  button('All on', '全部开灯', allRow, () => actions.allLights(true)); button('All off', '全部关灯', allRow, () => actions.allLights(false));
  const lights = document.createElement('div'); lights.className = 'vt-grid'; homePage.append(lights);
  const lightButtons = new Map<string, HTMLButtonElement>();
  for (const light of VILLA_HOME_LIGHTS) {
    const item = button(light.name, light.zh, lights, () => actions.light(light.id, !current?.home.roomLights[light.id]));
    item.dataset.villaRoomLight = light.id; lightButtons.set(light.id, item);
  }
  const devices = document.createElement('div'); devices.className = 'vt-row'; devices.style.marginTop = '16px'; homePage.append(devices);
  const fire = button('Fireplace', '壁炉', devices, () => actions.fireplace(!current?.fireplace)); fire.dataset.villaFireplace = '';
  const aquarium = button('Aquarium light', '鱼缸灯', devices, () => actions.aquarium(!current?.aquarium)); aquarium.dataset.villaAquariumLight = '';
  const weatherPage = sections.get('weather')!;
  text('h3', 'Time of day', '昼夜', weatherPage);
  const times = document.createElement('div'); times.className = 'vt-weather'; weatherPage.append(times);
  const timeButtons = new Map<VillaTimeOfDay, HTMLButtonElement>();
  for (const [id, en, zh] of [['day', 'Day', '白天'], ['evening', 'Evening', '傍晚'], ['night', 'Night', '夜晚']] as const) {
    const item = button(en, zh, times, () => actions.time(id)); item.dataset.villaTime = id; timeButtons.set(id, item);
  }
  text('h3', 'Weather', '天气', weatherPage);
  const weatherButtons = new Map<VillaWeather, HTMLButtonElement>();
  const weathers = document.createElement('div'); weathers.className = 'vt-weather'; weatherPage.append(weathers);
  for (const [id, en, zh] of [['clear', 'Clear', '晴天'], ['rain', 'Rain', '雨天']] as const) {
    const item = button(en, zh, weathers, () => actions.weather(id)); item.dataset.villaWeather = id; weatherButtons.set(id, item);
  }
  const shelter = document.createElement('p'); shelter.className = 'vt-note'; shelter.dataset.villaShelterStatus = ''; weatherPage.append(shelter);
  text('p', 'Sky, rainfall and lighting fade gradually. Pets seek shelter in the living room and garage when rain arrives.', '天空、雨量与光线会逐渐过渡。下雨时，小动物会前往客厅和车库避雨。', weatherPage, 'vt-note');
  const settings = sections.get('settings')!; settings.className = 'vt-settings';
  const rangeLabel = document.createElement('label'); settings.append(rangeLabel);
  const rangeTitle = document.createElement('span'); rangeTitle.className = 'vt-range-label'; rangeLabel.append(rangeTitle);
  text('span', 'Look sensitivity', '视角移动灵敏度', rangeTitle);
  const sensitivityValue = document.createElement('output'); rangeTitle.append(sensitivityValue);
  const sensitivity = document.createElement('input'); sensitivity.type = 'range'; sensitivity.min = String(VILLA_LOOK_SENSITIVITY.min); sensitivity.max = String(VILLA_LOOK_SENSITIVITY.max); sensitivity.step = '.05'; sensitivity.dataset.villaSensitivity = ''; rangeLabel.append(sensitivity);
  sensitivity.addEventListener('input', () => { sensitivityValue.value = `${Number(sensitivity.value).toFixed(2)}×`; actions.sensitivity(Number(sensitivity.value)); });
  text('p', 'Applies to mouse and touch camera movement; does not change walking or driving speed.', '同时作用于鼠标和触屏视角，不改变步行或驾驶速度。', settings, 'vt-note');
  const guide = button('Snooker aiming guide', '斯诺克辅助线', settings, () => actions.aimAssist(!current?.aimAssist)); guide.dataset.villaAimGuide = ''; guide.style.marginTop = '18px';
  if (actions.home || actions.immersive) {
    const fallback = document.createElement('div'); fallback.className = 'vt-row'; fallback.style.marginTop = '18px'; settings.append(fallback);
    if (actions.home) button('Return to entrance', '回到门口', fallback, actions.home).dataset.villaFallbackAction = 'villa-home';
    if (actions.immersive) button('Immersive mode', '沉浸模式', fallback, actions.immersive).dataset.villaFallbackAction = 'villa-immersive';
  }
  selectTab(tab);
  const update = (snapshot: VillaTerminalSnapshot) => {
    current = snapshot;
    root.style.setProperty('--vt-bg', snapshot.dark ? '#1e2924' : '#f3f4ed'); root.style.setProperty('--vt-ink', snapshot.dark ? '#e3ebe2' : '#25352b');
    root.style.setProperty('--vt-card', snapshot.dark ? '#28342d' : '#ffffff'); root.style.setProperty('--vt-line', snapshot.dark ? '#48534b' : '#d3dccf');
    root.style.setProperty('--vt-muted', snapshot.dark ? '#a5b5a7' : '#677669'); root.style.setProperty('--vt-accent', '#789468'); root.style.setProperty('--vt-selected', snapshot.dark ? '#425940' : '#dce8d4');
    for (const item of localizations) { const value = snapshot.zh ? item.zh : item.en; if (item.node.textContent !== value) item.node.textContent = value; }
    sub.textContent = `Warm Villa ${snapshot.version}`;
    close.setAttribute('aria-label', snapshot.zh ? '关闭智能终端' : 'Close smart terminal');
    for (const [id, item] of lightButtons) item.setAttribute('aria-pressed', String(snapshot.home.roomLights[id]));
    for (const [id, item] of timeButtons) item.setAttribute('aria-pressed', String(snapshot.home.timeOfDay === id));
    for (const [id, item] of weatherButtons) item.setAttribute('aria-pressed', String(snapshot.home.weather === id));
    fire.setAttribute('aria-pressed', String(snapshot.fireplace)); aquarium.setAttribute('aria-pressed', String(snapshot.aquarium)); guide.setAttribute('aria-pressed', String(snapshot.aimAssist));
    if (document.activeElement !== sensitivity) sensitivity.value = String(snapshot.home.lookSensitivity);
    sensitivityValue.value = `${snapshot.home.lookSensitivity.toFixed(2)}×`;
    shelter.textContent = snapshot.zh ? `已在室内：${snapshot.petsSheltered} / ${snapshot.petCount} 只小动物` : `Indoors: ${snapshot.petsSheltered} / ${snapshot.petCount} pets`;
    refreshCamera();
  };
  root.addEventListener('click', event => { if (event.target === root) actions.close(); });
  root.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape' || (event.key.toLowerCase() === 'p' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey)) { event.preventDefault(); actions.close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button,input')).filter(item => item.getClientRects().length > 0);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  // Keyup intentionally bubbles so an already-held gameplay key can never latch.
  const mount = canvas.closest('#gameApp') ?? canvas.parentElement;
  mount?.append(root);
  return {
    element: root, get visible() { return !root.hidden; }, get cameraId() { return !root.hidden && tab === 'cameras' ? camera : null; },
    show(snapshot) { update(snapshot); root.hidden = false; close.focus({ preventScroll: true }); },
    hide() { root.hidden = true; }, update,
    presentCamera(source) {
      const ctx = monitor.getContext('2d'); if (!ctx) return;
      if (source) { ctx.drawImage(source, 0, 0, monitor.width, monitor.height); return; }
      ctx.fillStyle = '#17251f'; ctx.fillRect(0, 0, monitor.width, monitor.height); ctx.fillStyle = '#dbe5d8'; ctx.font = '17px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(current?.zh ? '正在连接监控画面…' : 'Connecting live camera…', monitor.width / 2, monitor.height / 2);
    },
    destroy() { root.remove(); current = null; },
  };
}
