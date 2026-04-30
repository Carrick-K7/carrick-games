import { BaseGame, isZhLang } from '../core/game.js';

/* ───────── Types ───────── */
interface ItemDef {
  name: string;
  nameZh: string;
  rarity: Rarity;
  value: number; // sell price
  emoji: string;
}

interface CaseDef {
  id: string;
  name: string;
  nameZh: string;
  cost: number;
  color: string;
  accentColor: string;
  items: ItemDef[];
  animEmoji: string;
}

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

interface CollectedEntry {
  id: string;
  count: number;
}

type Screen = 'menu' | 'opening' | 'result' | 'collection' | 'shop';

/* ───────── Particles ───────── */
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
}

/* ───────── Slot machine ───────── */
interface SlotReel {
  items: { name: string; color: string; emoji: string }[];
  offset: number;
  speed: number;
  stopped: boolean;
}

/* ───────── Rarity config ───────── */
const RARITY: Record<Rarity, { color: string; label: string; labelZh: string; glow: string }> = {
  common:     { color: '#8a8a8a', label: 'Common', labelZh: '普通', glow: 'rgba(138,138,138,0.3)' },
  uncommon:   { color: '#4caf50', label: 'Uncommon', labelZh: '精良', glow: 'rgba(76,175,80,0.4)' },
  rare:       { color: '#2196f3', label: 'Rare', labelZh: '稀有', glow: 'rgba(33,150,243,0.5)' },
  epic:       { color: '#9c27b0', label: 'Epic', labelZh: '史诗', glow: 'rgba(156,39,176,0.5)' },
  legendary:  { color: '#ff9800', label: 'Legendary', labelZh: '传说', glow: 'rgba(255,152,0,0.7)' },
};

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/* ───────── Items & Cases ───────── */
const ITEM_POOLS: Record<string, ItemDef[]> = {
  basic: [
    { name: 'Rusty Knife', nameZh: '生锈匕首', rarity: 'common', value: 5, emoji: '🔪' },
    { name: 'Wooden Bat', nameZh: '木制球棒', rarity: 'common', value: 6, emoji: '🏏' },
    { name: 'Torn Jacket', nameZh: '破损夹克', rarity: 'common', value: 4, emoji: '🧥' },
    { name: 'Steel Buckler', nameZh: '钢制小盾', rarity: 'common', value: 7, emoji: '🛡️' },
    { name: 'Worn Boots', nameZh: '破旧靴子', rarity: 'common', value: 5, emoji: '👢' },
    { name: 'Cotton Bandana', nameZh: '棉布头巾', rarity: 'uncommon', value: 12, emoji: '🧣' },
    { name: 'Leather Gloves', nameZh: '皮手套', rarity: 'uncommon', value: 14, emoji: '🧤' },
    { name: 'Plastic Visor', nameZh: '塑料面罩', rarity: 'uncommon', value: 10, emoji: '🥽' },
  ],
  premium: [
    { name: 'Silver Dagger', nameZh: '银质匕首', rarity: 'uncommon', value: 25, emoji: '🗡️' },
    { name: 'Tactical Vest', nameZh: '战术背心', rarity: 'uncommon', value: 28, emoji: '🦺' },
    { name: 'Combat Helmet', nameZh: '作战头盔', rarity: 'uncommon', value: 22, emoji: '⛑️' },
    { name: 'Night Goggles', nameZh: '夜视镜', rarity: 'rare', value: 50, emoji: '🔭' },
    { name: 'Steel Saber', nameZh: '钢制军刀', rarity: 'rare', value: 55, emoji: '⚔️' },
    { name: 'Kevlar Pads', nameZh: '凯夫拉护垫', rarity: 'rare', value: 45, emoji: '🛡️' },
    { name: 'Smoke Grenade', nameZh: '烟雾弹', rarity: 'rare', value: 48, emoji: '💨' },
    { name: 'Flashbang', nameZh: '闪光弹', rarity: 'rare', value: 52, emoji: '💥' },
  ],
  elite: [
    { name: 'Dragon Katana', nameZh: '龙之武士刀', rarity: 'rare', value: 120, emoji: '🗡️' },
    { name: 'Phantom Cloak', nameZh: '幻影披风', rarity: 'rare', value: 110, emoji: '👻' },
    { name: 'Thunder Bow', nameZh: '雷霆弓', rarity: 'rare', value: 115, emoji: '🏹' },
    { name: 'Shadow Mask', nameZh: '暗影面具', rarity: 'epic', value: 250, emoji: '🎭' },
    { name: 'Arcane Shield', nameZh: '奥术盾牌', rarity: 'epic', value: 280, emoji: '🔮' },
    { name: 'Mystic Gauntlets', nameZh: '神秘护手', rarity: 'epic', value: 260, emoji: '🧤' },
    { name: 'Void Boots', nameZh: '虚空之靴', rarity: 'epic', value: 240, emoji: '👢' },
    { name: 'Star Amulet', nameZh: '星辰护符', rarity: 'epic', value: 300, emoji: '⭐' },
  ],
  legendary: [
    { name: 'Excalibur', nameZh: '王者之剑', rarity: 'epic', value: 600, emoji: '⚔️' },
    { name: 'Eternal Armor', nameZh: '永恒铠甲', rarity: 'epic', value: 550, emoji: '🛡️' },
    { name: 'Dragon\'s Eye', nameZh: '龙之眼', rarity: 'epic', value: 580, emoji: '👁️' },
    { name: 'Phoenix Wings', nameZh: '凤凰羽翼', rarity: 'legendary', value: 2000, emoji: '🦅' },
    { name: 'Crown of Kings', nameZh: '王冠', rarity: 'legendary', value: 2500, emoji: '👑' },
    { name: 'Void Scepter', nameZh: '虚空权杖', rarity: 'legendary', value: 2200, emoji: '🔱' },
    { name: 'Godslayer Blade', nameZh: '弑神之刃', rarity: 'legendary', value: 3000, emoji: '🗡️' },
    { name: 'Time Crystal', nameZh: '时光水晶', rarity: 'legendary', value: 2800, emoji: '💎' },
  ],
};

const CASES: CaseDef[] = [
  {
    id: 'basic', name: 'Basic Case', nameZh: '基础箱子',
    cost: 50, color: '#8a8a8a', accentColor: '#6b6b6b',
    items: ITEM_POOLS.basic, animEmoji: '📦',
  },
  {
    id: 'premium', name: 'Premium Case', nameZh: '高级箱子',
    cost: 250, color: '#4caf50', accentColor: '#388e3c',
    items: ITEM_POOLS.premium, animEmoji: '🎁',
  },
  {
    id: 'elite', name: 'Elite Case', nameZh: '精英箱子',
    cost: 1000, color: '#9c27b0', accentColor: '#7b1fa2',
    items: ITEM_POOLS.elite, animEmoji: '💎',
  },
  {
    id: 'legendary', name: 'Legendary Case', nameZh: '传说箱子',
    cost: 5000, color: '#ff9800', accentColor: '#e65100',
    items: ITEM_POOLS.legendary, animEmoji: '👑',
  },
];

/* ───────── Persistence ───────── */
const STORAGE_KEY = 'luckycase';
const STARTING_COINS = 5000;

interface SaveData {
  coins: number;
  collection: CollectedEntry[];
  totalOpens: number;
  totalValue: number;
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as SaveData;
      if (typeof d.coins === 'number' && Array.isArray(d.collection)) return d;
    }
  } catch { /* ignore */ }
  return { coins: STARTING_COINS, collection: [], totalOpens: 0, totalValue: 0 };
}

function writeSave(s: SaveData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

/* ───────── Rarity roll helpers ───────── */
function rollRarity(caseId: string): Rarity {
  const r = Math.random();
  switch (caseId) {
    case 'basic':
      if (r < 0.60) return 'common';
      return 'uncommon';
    case 'premium':
      if (r < 0.10) return 'uncommon';
      if (r < 0.85) return 'rare';
      return 'uncommon';
    case 'elite':
      if (r < 0.15) return 'rare';
      if (r < 0.95) return 'epic';
      return 'rare';
    case 'legendary':
      if (r < 0.10) return 'epic';
      if (r < 0.50) return 'legendary';
      return 'epic';
    default:
      return 'common';
  }
}

function rollItem(caseId: string, rarity: Rarity): ItemDef {
  const pool = ITEM_POOLS[caseId].filter((i) => i.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)] || pool[0];
}

function rarityIndex(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

/* ───────── Main Game ───────── */
export class LuckyCaseGame extends BaseGame {
  private save: SaveData = loadSave();
  private screen: Screen = 'menu';
  private selectedCase: CaseDef = CASES[0];
  private drawnItem!: ItemDef;
  private animTimer = 0;
  private animPhase = 0; // 0=not started, 1=running, 2=revealed
  private animScrollItems: { name: string; color: string }[] = [];
  private particles: Particle[] = [];
  private sellMode = false;
  private sellingItem: { caseId: string; idx: number } | null = null;
  private notification = '';
  private notifyTimer = 0;
  private hintTimer = 0;
  private hoveredCase: number = -1;
  private openMode: 'classic' | 'slot' = 'classic';
  private slotReels: SlotReel[] = [];
  private slotStopPhase = 0;
  private slotStopTimer = 0;

  constructor() {
    super('gameCanvas', 420, 560);
    this.drawnItem = CASES[0].items[0];
  }

  /* ─── Save helpers ─── */
  private getCollected(itemName: string): CollectedEntry | undefined {
    return this.save.collection.find((c) => c.id === itemName);
  }

  private addToCollection(itemName: string) {
    const existing = this.getCollected(itemName);
    if (existing) {
      existing.count++;
    } else {
      this.save.collection.push({ id: itemName, count: 1 });
    }
  }

  private deductCoins(cost: number): boolean {
    if (this.save.coins < cost) return false;
    this.save.coins -= cost;
    return true;
  }

  private sellItem(itemName: string, value: number) {
    const entry = this.getCollected(itemName);
    if (!entry || entry.count <= 0) return;
    entry.count--;
    this.save.coins += value;
    this.notification = `${itemName}: +${value} coins`;
    this.notifyTimer = 2;
    if (entry.count === 0) {
      this.save.collection = this.save.collection.filter((c) => c.id !== itemName);
    }
    this.persist();
  }

  private persist() {
    writeSave(this.save);
  }

  /* ─── State machine ─── */
  init() {
    this.save = loadSave();
    this.screen = 'menu';
    this.animPhase = 0;
    this.particles = [];
    this.sellMode = false;
    this.sellingItem = null;
  }

  private startOpening(caseDef: CaseDef) {
    if (!this.deductCoins(caseDef.cost)) {
      this.notification = this.isZhLang() ? '余额不足!' : 'Not enough coins!';
      this.notifyTimer = 2;
      return;
    }
    this.persist();
    this.selectedCase = caseDef;
    this.screen = 'opening';
    this.animPhase = 1;
    this.animTimer = 0;

    const zh = this.isZhLang();
    const rarity = rollRarity(caseDef.id);
    this.drawnItem = rollItem(caseDef.id, rarity);

    if (this.openMode === 'slot') {
      this.slotReels = [];
      this.slotStopPhase = 0;
      this.slotStopTimer = 0;
      const pool = caseDef.items;
      for (let reelIdx = 0; reelIdx < 3; reelIdx++) {
        const reelItems: SlotReel['items'] = [];
        for (let i = 0; i < 18; i++) {
          const decoy = pool[Math.floor(Math.random() * pool.length)];
          reelItems.push({ name: zh ? decoy.nameZh : decoy.name, color: RARITY[decoy.rarity].color, emoji: decoy.emoji });
        }
        // Final item — middle reel shows the actual prize
        if (reelIdx === 1) {
          reelItems.push({ name: zh ? this.drawnItem.nameZh : this.drawnItem.name, color: RARITY[this.drawnItem.rarity].color, emoji: this.drawnItem.emoji });
        } else {
          const final = pool[Math.floor(Math.random() * pool.length)];
          reelItems.push({ name: zh ? final.nameZh : final.name, color: RARITY[final.rarity].color, emoji: final.emoji });
        }
        this.slotReels.push({ items: reelItems, offset: 0, speed: 900 + Math.random() * 500, stopped: false });
      }
    } else {
      // Classic scroll animation
      this.animScrollItems = [];
      const pool = caseDef.items;
      for (let i = 0; i < 20; i++) {
        const decoy = pool[Math.floor(Math.random() * pool.length)];
        this.animScrollItems.push({
          name: zh ? decoy.nameZh : decoy.name,
          color: RARITY[decoy.rarity].color,
        });
      }
      this.animScrollItems.push({
        name: zh ? this.drawnItem.nameZh : this.drawnItem.name,
        color: RARITY[this.drawnItem.rarity].color,
      });
    }
  }

  update(dt: number) {
    // Notifications
    if (this.notifyTimer > 0) this.notifyTimer -= dt;

    // Particles
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      p.life -= dt;
      return p.life > 0;
    });

    // Opening animation
    if (this.screen === 'opening' && this.animPhase === 1) {
      this.animTimer += dt;

      if (this.openMode === 'slot') {
        // Spin reels that haven't stopped yet
        for (let i = 0; i < 3; i++) {
          const reel = this.slotReels[i];
          if (!reel.stopped) {
            reel.offset += reel.speed * dt;
          }
        }

        this.slotStopTimer += dt;

        // Stop reel 0 (left) at 1.0s
        if (this.slotStopPhase === 0 && this.slotStopTimer >= 1.0) {
          this.slotReels[0].stopped = true;
          this.slotReels[0].speed = 0;
          this.slotReels[0].offset = this.snapReelOffset(0);
          this.slotStopPhase = 1;
        }
        // Stop reel 2 (right) at 1.6s
        if (this.slotStopPhase === 1 && this.slotStopTimer >= 1.6) {
          this.slotReels[2].stopped = true;
          this.slotReels[2].speed = 0;
          this.slotReels[2].offset = this.snapReelOffset(2);
          this.slotStopPhase = 2;
        }
        // Stop reel 1 (middle) at 2.2s, reveal result
        if (this.slotStopPhase === 2 && this.slotStopTimer >= 2.2) {
          this.slotReels[1].stopped = true;
          this.slotReels[1].speed = 0;
          this.slotReels[1].offset = this.snapReelOffset(1);
          this.slotStopPhase = 3;
          this.animPhase = 2;
          this.addToCollection(this.drawnItem.name);
          this.save.totalOpens++;
          this.save.totalValue += this.drawnItem.value;
          this.persist();
          const rc = RARITY[this.drawnItem.rarity];
          for (let i = 0; i < 40; i++) {
            this.particles.push({
              x: this.width / 2 + (Math.random() - 0.5) * 100,
              y: this.height / 3,
              vx: (Math.random() - 0.5) * 200,
              vy: -Math.random() * 150 - 50,
              life: 1.5 + Math.random(),
              maxLife: 2,
              color: rc.color,
              size: 3 + Math.random() * 4,
            });
          }
          this.screen = 'result';
        }
      } else {
        // Classic scroll
        if (this.animTimer >= 2) {
          this.animPhase = 2;
          this.addToCollection(this.drawnItem.name);
          this.save.totalOpens++;
          this.save.totalValue += this.drawnItem.value;
          this.persist();
          const rc = RARITY[this.drawnItem.rarity];
          for (let i = 0; i < 40; i++) {
            this.particles.push({
              x: this.width / 2 + (Math.random() - 0.5) * 100,
              y: this.height / 3,
              vx: (Math.random() - 0.5) * 200,
              vy: -Math.random() * 150 - 50,
              life: 1.5 + Math.random(),
              maxLife: 2,
              color: rc.color,
              size: 3 + Math.random() * 4,
            });
          }
          this.screen = 'result';
        }
      }
    }
  }

  private snapReelOffset(reelIdx: number): number {
    const ITEM_H = 56;
    const reel = this.slotReels[reelIdx];
    // Last item should land on the win line (row 2, 0-indexed)
    const target = (reel.items.length - 3) * ITEM_H;
    const cur = reel.offset;
    // Find the nearest valid offset that puts an item at the win line
    const wrappedTarget = ((target % (reel.items.length * ITEM_H)) + reel.items.length * ITEM_H) % (reel.items.length * ITEM_H);
    // Snap current offset to item-grid, then add cycles until in range
    const snapped = Math.round(cur / ITEM_H) * ITEM_H;
    if (snapped >= wrappedTarget) {
      return snapped;
    }
    return snapped + reel.items.length * ITEM_H * Math.ceil((wrappedTarget - snapped) / (reel.items.length * ITEM_H));
  }

  /* ─── Drawing ─── */
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.isDarkTheme() ? '#1a1a2e' : '#f5f5f5';
    ctx.fillRect(0, 0, this.width, this.height);

    switch (this.screen) {
      case 'menu': this.drawMenu(ctx); break;
      case 'opening': this.drawOpening(ctx); break;
      case 'result': this.drawResult(ctx); break;
      case 'collection': this.drawCollection(ctx); break;
    }

    // Particles overlay
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Notification
    if (this.notifyTimer > 0) {
      const zh = this.isZhLang();
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.isDarkTheme() ? '#ff6b6b' : '#c0392b';
      ctx.fillText(this.notification, this.width / 2, 40);
    }

    // Hint at bottom
    if (this.screen === 'menu' || this.screen === 'result') {
      this.hintTimer += 0.016;
      const blink = Math.sin(this.hintTimer * 3) > 0;
      if (blink) {
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = this.isDarkTheme() ? '#666' : '#999';
        const zh = this.isZhLang();
        if (this.screen === 'menu') {
          ctx.fillText(zh ? '点击箱子购买并打开' : 'Click a case to buy & open', this.width / 2, this.height - 10);
        } else if (this.screen === 'result') {
          ctx.fillText(zh ? '点击继续' : 'Click to continue', this.width / 2, this.height - 10);
        }
      }
    }
  }

  /* ─── Menu Screen ─── */
  private drawMenu(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const dark = this.isDarkTheme();

    // Header
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#39C5BB';
    ctx.fillText(zh ? '🎰 幸运开箱' : '🎰 LUCKY CASE', this.width / 2, 40);

    // Coin display
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = dark ? '#ffd700' : '#b8860b';
    ctx.fillText(`💰 ${this.save.coins}`, this.width - 15, 40);

    // Stats
    ctx.textAlign = 'left';
    ctx.fillStyle = dark ? '#888' : '#666';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText(zh ? `已开 ${this.save.totalOpens} 箱` : `Opens: ${this.save.totalOpens}`, 15, 70);

    // Mode toggle
    const isSlot = this.openMode === 'slot';
    {
      const btnW = 110; const btnH = 24;
      const btnX = (this.width - btnW) / 2;
      const btnY = 62;
      ctx.strokeStyle = isSlot ? '#ff9800' : '#39C5BB';
      ctx.lineWidth = 1;
      ctx.beginPath();
      this.roundRect(ctx, btnX, btnY, btnW, btnH, 12);
      ctx.stroke();
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isSlot ? '#ff9800' : '#39C5BB';
      ctx.fillText(isSlot ? (zh ? '🎰 老虎机' : '🎰 SLOT') : (zh ? '📜 经典' : '📜 CLASSIC'), this.width / 2, btnY + 16);
      ctx.textAlign = 'left';
    }

    // Museum button
    ctx.textAlign = 'right';
    ctx.fillStyle = '#39C5BB';
    const collBtn = { x: this.width - 15, y: 65, w: 120, h: 24 };
    ctx.strokeStyle = '#39C5BB';
    ctx.lineWidth = 1;
    ctx.strokeRect(collBtn.x - collBtn.w, collBtn.y, collBtn.w, collBtn.h);
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(zh ? '🏛️ 展览馆' : '🏛️ MUSEUM', collBtn.x - collBtn.w / 2, collBtn.y + 16);

    // Case cards
    const cardW = 180;
    const cardH = 200;
    const gapX = 25;
    const gapY = 20;
    const startX = (this.width - cardW * 2 - gapX) / 2;
    const startY = 90;

    for (let i = 0; i < CASES.length; i++) {
      const c = CASES[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);
      const hovered = this.hoveredCase === i;
      const affordable = this.save.coins >= c.cost;

      // Card background
      const bg = dark ? '#16213e' : '#ffffff';
      ctx.fillStyle = bg;
      ctx.strokeStyle = affordable ? c.color : (dark ? '#444' : '#ddd');
      ctx.lineWidth = hovered && affordable ? 2 : 1;
      ctx.beginPath();
      this.roundRect(ctx, cx, cy, cardW, cardH, 8);
      ctx.fill();
      ctx.stroke();

      // Case emoji
      ctx.font = '32px serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = affordable ? c.color : (dark ? '#555' : '#ccc');
      ctx.fillText(c.animEmoji, cx + cardW / 2, cy + 50);

      // Case name
      ctx.font = '11px "Press Start 2P", monospace';
      ctx.fillStyle = affordable ? (dark ? '#fff' : '#222') : (dark ? '#555' : '#ccc');
      ctx.fillText(zh ? c.nameZh : c.name, cx + cardW / 2, cy + 80);

      // Price
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = affordable ? '#ffd700' : (dark ? '#555' : '#ccc');
      ctx.fillText(`💰 ${c.cost}`, cx + cardW / 2, cy + 105);

      // Rarity label
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = c.color;
      const rLabel = zh ? '包含' : 'Contains:';
      ctx.fillText(rLabel, cx + cardW / 2, cy + 130);

      // Item counts by rarity
      const counts: Record<string, number> = {};
      for (const item of c.items) {
        counts[item.rarity] = (counts[item.rarity] || 0) + 1;
      }
      let ly = cy + 148;
      for (const r of RARITY_ORDER) {
        if (counts[r]) {
          ctx.fillStyle = RARITY[r].color;
          ctx.fillText(`${RARITY[r][zh ? 'labelZh' : 'label']} x${counts[r]}`, cx + cardW / 2, ly);
          ly += 16;
        }
      }
    }
  }

  /* ─── Opening Animation ─── */
  private drawOpening(ctx: CanvasRenderingContext2D) {
    if (this.openMode === 'slot') {
      this.drawOpeningSlot(ctx);
      return;
    }
    this.drawOpeningClassic(ctx);
  }

  private drawOpeningClassic(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const dark = this.isDarkTheme();
    const c = this.selectedCase;

    // Background
    ctx.fillStyle = dark ? '#0d1117' : '#fafafa';
    ctx.fillRect(0, 0, this.width, this.height);

    // Title
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = c.color;
    ctx.fillText(zh ? '开箱中...' : 'OPENING...', this.width / 2, 40);

    // Scrolling slot
    const slotY = 160;
    const slotH = 60;
    const slotW = 300;

    // Slot bg
    ctx.fillStyle = dark ? '#1a1a2e' : '#eee';
    ctx.beginPath();
    this.roundRect(ctx, (this.width - slotW) / 2, slotY, slotW, slotH, 6);
    ctx.fill();

    // Decorative lines on slot
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect((this.width - slotW) / 2, slotY, slotW, slotH);
    ctx.setLineDash([]);

    // Scrolling text
    if (this.animScrollItems.length > 0) {
      const idx = Math.floor(this.animTimer * 12) % this.animScrollItems.length;
      const item = this.animScrollItems[idx];
      ctx.font = '15px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = item.color;
      ctx.fillText(item.name, this.width / 2, slotY + slotH / 2 + 5);
    }

    // Box emoji bouncing
    const bobY = Math.sin(this.animTimer * 8) * 8;
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.fillText(c.animEmoji, this.width / 2, 100 + bobY);

    // Shimmer effect
    const shimmerX = ((this.animTimer * 200) % (slotW + 100)) - 50;
    const grad = ctx.createLinearGradient(
      (this.width - slotW) / 2 + shimmerX - 30, slotY,
      (this.width - slotW) / 2 + shimmerX + 30, slotY + slotH
    );
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    this.roundRect(ctx, (this.width - slotW) / 2, slotY, slotW, slotH, 6);
    ctx.fill();

    // "Press Start 2P" hint
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = dark ? '#666' : '#999';
    ctx.fillText(zh ? '滚动中...' : 'Spinning...', this.width / 2, slotY + slotH + 30);
  }

  /* ─── Slot Machine Reel Animation ─── */
  private drawOpeningSlot(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const dark = this.isDarkTheme();
    const c = this.selectedCase;
    const REEL_W = 100;
    const REEL_H = 280;
    const ITEM_H = 56;
    const GAP = 12;
    const reelStartX = (this.width - (REEL_W * 3 + GAP * 2)) / 2;
    const reelY = 140;
    const winLineY = reelY + REEL_H / 2;

    // Background
    ctx.fillStyle = dark ? '#0d1117' : '#fafafa';
    ctx.fillRect(0, 0, this.width, this.height);

    // Title
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = c.color;
    ctx.fillText(zh ? '🎰 开箱中...' : '🎰 SPINNING...', this.width / 2, 40);

    // Case emoji above reels
    const bobY = Math.sin(this.animTimer * 8) * 6;
    ctx.font = '36px serif';
    ctx.textAlign = 'center';
    ctx.fillText(c.animEmoji, this.width / 2, 100 + bobY);

    // Draw each reel
    for (let r = 0; r < 3; r++) {
      const reel = this.slotReels[r];
      const rx = reelStartX + r * (REEL_W + GAP);
      const stopped = reel.stopped;
      const itemCount = reel.items.length;
      const totalH = itemCount * ITEM_H;
      const safeOff = ((reel.offset % totalH) + totalH) % totalH;
      const firstIdx = Math.floor(safeOff / ITEM_H);
      const subOff = safeOff % ITEM_H;

      // Reel background
      ctx.save();
      ctx.beginPath();
      this.roundRect(ctx, rx, reelY, REEL_W, REEL_H, 8);
      ctx.clip();
      ctx.fillStyle = dark ? '#11151f' : '#e8e8e8';
      ctx.fillRect(rx, reelY, REEL_W, REEL_H);

      // Reel items
      for (let row = -1; row <= 7; row++) {
        const idx = ((firstIdx + row) % itemCount + itemCount) % itemCount;
        const item = reel.items[idx];
        const iy = reelY + row * ITEM_H - subOff;
        if (iy + ITEM_H < reelY || iy > reelY + REEL_H) continue;

        // Item background
        const alpha = Math.abs(iy + ITEM_H / 2 - winLineY) < ITEM_H / 2 ? 0.12 : 0;
        if (alpha > 0) {
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.fillRect(rx, iy, REEL_W, ITEM_H);
        }

        // Emoji
        ctx.font = '26px serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = item.color;
        ctx.fillText(item.emoji, rx + REEL_W / 2, iy + 30);

        // Name
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = dark ? '#888' : '#666';
        ctx.globalAlpha = 0.7;
        ctx.fillText(item.name, rx + REEL_W / 2, iy + 48);
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Reel border
      ctx.strokeStyle = stopped ? '#ffd700' : (dark ? '#333' : '#ccc');
      ctx.lineWidth = stopped ? 2.5 : 1.5;
      ctx.beginPath();
      this.roundRect(ctx, rx, reelY, REEL_W, REEL_H, 8);
      ctx.stroke();

      // Stopped glow
      if (stopped) {
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.roundRect(ctx, rx, reelY, REEL_W, REEL_H, 8);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Win-line notch markers (left/right ticks)
      ctx.fillStyle = c.color;
      ctx.fillRect(rx - 3, winLineY - 8, 3, 16);
      ctx.fillRect(rx + REEL_W, winLineY - 8, 3, 16);
    }

    // Win line
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(reelStartX - 8, winLineY);
    ctx.lineTo(reelStartX + REEL_W * 3 + GAP * 2 + 8, winLineY);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // Status text
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = dark ? '#888' : '#666';
    let status = '';
    if (this.slotStopPhase === 0) status = zh ? '旋转中...' : 'Spinning...';
    else if (this.slotStopPhase === 1) status = zh ? '左列停!' : 'Left stop!';
    else if (this.slotStopPhase === 2) status = zh ? '右列停!' : 'Right stop!';
    ctx.fillText(status, this.width / 2, reelY + REEL_H + 30);
  }

  /* ─── Result Screen ─── */
  private drawResult(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const dark = this.isDarkTheme();
    const item = this.drawnItem;
    const rc = RARITY[item.rarity];
    const c = this.selectedCase;

    // Background with rarity tint
    ctx.fillStyle = dark ? '#0d1117' : '#fafafa';
    ctx.fillRect(0, 0, this.width, this.height);

    // Rarity glow
    const grad = ctx.createRadialGradient(
      this.width / 2, this.height / 2 - 30, 10,
      this.width / 2, this.height / 2 - 30, 180
    );
    grad.addColorStop(0, rc.glow);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Case name
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = c.color;
    ctx.fillText(zh ? c.nameZh : c.name, this.width / 2, 40);

    // Rarity label
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillStyle = rc.color;
    const rarityText = `${zh ? '★ ' + rc.labelZh : rc.label + ' ★'}`;
    ctx.fillText(rarityText, this.width / 2, 80);

    // Item emoji
    ctx.font = '56px serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.emoji, this.width / 2, 170);

    // Item name
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillStyle = rc.color;
    ctx.fillText(zh ? item.nameZh : item.name, this.width / 2, 220);

    // Value
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`${zh ? '价值' : 'Value'}: 💰 ${item.value}`, this.width / 2, 260);

    // Collection count
    const collCount = this.getCollected(item.name)?.count || 1;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = dark ? '#888' : '#666';
    ctx.fillText(zh ? `拥有 ${collCount} 个` : `Owned: ${collCount}`, this.width / 2, 285);

    // Sell button
    const btnY = 310;
    const btnH = 30;
    const btnW = 180;
    const btnX = (this.width - btnW) / 2;

    ctx.fillStyle = dark ? '#2d2d2d' : '#eee';
    ctx.strokeStyle = rc.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.roundRect(ctx, btnX, btnY, btnW, btnH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.fillText(zh ? `💰 出售 (+${item.value})` : `💰 SELL (+${item.value})`, this.width / 2, btnY + 19);

    // Coin display
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${this.save.coins}`, this.width - 15, 40);
  }

  /* ─── Museum Screen (all items, owned + unowned) ─── */
  private museumPage = 0;
  private museumTotalPages = 0;

  private drawCollection(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const dark = this.isDarkTheme();

    const allItems = this.getAllItems();
    const owned = this.save.collection;
    const ownedNames = new Set(owned.map((e) => e.id));
    const ownedCount = owned.length;
    const totalCount = allItems.length;

    // Header
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#39C5BB';
    ctx.fillText(zh ? '🏛️ 展览馆' : '🏛️ MUSEUM', this.width / 2, 28);

    // Progress text
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = dark ? '#aaa' : '#666';
    ctx.fillText(`${ownedCount}/${totalCount} ${zh ? '已收集' : 'collected'}`, this.width / 2, 45);

    // Progress bar
    const barW = 320;
    const barH = 10;
    const barX = (this.width - barW) / 2;
    const barY = 52;
    const pct = ownedCount / totalCount;
    ctx.fillStyle = dark ? '#2d2d2d' : '#e0e0e0';
    ctx.beginPath();
    this.roundRect(ctx, barX, barY, barW, barH, 5);
    ctx.fill();
    ctx.fillStyle = '#39C5BB';
    ctx.beginPath();
    this.roundRect(ctx, barX, barY, barW * pct, barH, 5);
    ctx.fill();

    // Back button
    ctx.strokeStyle = '#39C5BB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.roundRect(ctx, 15, 55, 100, 22, 4);
    ctx.stroke();
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#39C5BB';
    ctx.fillText(zh ? '← 返回' : '← BACK', 65, 70);

    // Pagination
    const cols = 4;
    const cardW = 88;
    const cardH = 70;
    const gapX = Math.floor((this.width - cols * cardW - 20) / (cols - 1));
    const gridStartX = 10;
    const gridStartY = 75;
    const itemsPerPage = cols * 2; // 8 items per page
    this.museumTotalPages = Math.ceil(totalCount / itemsPerPage);

    if (this.museumPage >= this.museumTotalPages) this.museumPage = 0;

    const startIdx = this.museumPage * itemsPerPage;
    const pageItems = allItems.slice(startIdx, startIdx + itemsPerPage);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, gridStartY - 5, this.width, this.height - gridStartY + 5);
    ctx.clip();

    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      const rc = RARITY[item.rarity];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridStartX + col * (cardW + gapX);
      const cy = gridStartY + row * (cardH + 6);
      const isOwned = ownedNames.has(item.name);
      const entry = owned.find((e) => e.id === item.name);

      // Card background
      ctx.fillStyle = dark ? (isOwned ? '#1a1a2e' : '#111118') : (isOwned ? '#fff' : '#f5f5f5');
      ctx.strokeStyle = isOwned ? rc.color : (dark ? '#333' : '#ccc');
      ctx.lineWidth = isOwned ? 1 : 1;
      ctx.globalAlpha = isOwned ? 1 : 0.4;
      ctx.beginPath();
      this.roundRect(ctx, cx, cy, cardW, cardH, 6);
      ctx.fill();
      ctx.stroke();

      // Emoji
      ctx.font = isOwned ? '22px serif' : '22px serif';
      ctx.textAlign = 'center';
      if (isOwned) {
        ctx.fillText(item.emoji, cx + cardW / 2, cy + 30);
      } else {
        ctx.fillStyle = dark ? '#444' : '#aaa';
        ctx.fillText('❓', cx + cardW / 2, cy + 30);
      }
      ctx.globalAlpha = 1;

      // Name (shortened if needed)
      const name = isOwned ? (zh ? item.nameZh : item.name) : '??? 🔒';
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = isOwned ? (dark ? '#ddd' : '#333') : (dark ? '#555' : '#bbb');
      ctx.fillText(name, cx + cardW / 2, cy + 50);

      // Count badge for owned
      if (isOwned && entry && entry.count > 1) {
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`x${entry.count}`, cx + cardW - 4, cy + 14);
      }

      // Rarity dot
      ctx.fillStyle = rc.color;
      ctx.beginPath();
      ctx.arc(cx + cardW - 8, cy + 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Page navigation
    if (this.museumTotalPages > 1) {
      const navY = this.height - 28;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = dark ? '#888' : '#666';

      // Previous arrow
      ctx.textAlign = 'left';
      ctx.fillStyle = this.museumPage > 0 ? '#39C5BB' : (dark ? '#444' : '#ccc');
      ctx.fillText('◀', 35, navY + 4);

      // Page indicator
      ctx.textAlign = 'center';
      ctx.fillStyle = dark ? '#aaa' : '#666';
      ctx.fillText(`${this.museumPage + 1}/${this.museumTotalPages}`, this.width / 2, navY + 4);

      // Next arrow
      ctx.textAlign = 'right';
      ctx.fillStyle = this.museumPage < this.museumTotalPages - 1 ? '#39C5BB' : (dark ? '#444' : '#ccc');
      ctx.fillText('▶', this.width - 35, navY + 4);
    }
  }

  private getAllItems(): ItemDef[] {
    const seen = new Set<string>();
    const items: ItemDef[] = [];
    // Collect by case order to preserve grouping, then deduplicate
    for (const c of CASES) {
      for (const item of c.items) {
        if (!seen.has(item.name)) {
          seen.add(item.name);
          items.push(item);
        }
      }
    }
    // Sort by rarity (highest first), then by name
    return items.sort((a, b) => {
      const ra = rarityIndex(a.rarity);
      const rb = rarityIndex(b.rarity);
      if (ra !== rb) return rb - ra;
      return a.name.localeCompare(b.name);
    });
  }

  /* ─── Helpers ─── */
  private findItem(name: string): ItemDef | undefined {
    for (const pool of Object.values(ITEM_POOLS)) {
      const found = pool.find((i) => i.name === name);
      if (found) return found;
    }
    return undefined;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private hitTest(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  /* ─── Input ─── */
  handleInput(e: KeyboardEvent | TouchEvent | MouseEvent) {
    if (e instanceof KeyboardEvent) {
      if (e.key === 'r' || e.key === 'R') {
        this.init();
        return;
      }
      if (e.key === 'Escape') {
        if (this.screen === 'collection') {
          this.screen = 'menu';
          return;
        }
        if (this.screen === 'result') {
          this.screen = 'menu';
          return;
        }
      }
      if (e.key === ' ' && this.screen === 'result') {
        this.screen = 'menu';
        return;
      }
      return;
    }

    // Touch events: use changedTouches for touchend, touches for others
    let clientX: number;
    let clientY: number;
    let isClick = false;

    if (e instanceof MouseEvent) {
      clientX = e.clientX;
      clientY = e.clientY;
      // Only treat mousedown/mouseup as click
      isClick = e.type === 'mousedown' || e.type === 'mouseup';
    } else {
      const te = e as TouchEvent;
      // Use the first relevant touch point
      const touch = te.changedTouches?.[0] || te.touches?.[0];
      if (!touch) return;
      clientX = touch.clientX;
      clientY = touch.clientY;
      isClick = te.type === 'touchstart' || te.type === 'touchend';
    }

    const p = this.canvasPoint(clientX, clientY);
    if (!p) return;
    const { x, y } = p;

    if (this.screen === 'menu') {
      // Hover tracking always
      this.hoveredCase = this.getHoveredCase(x, y);

      if (!isClick) return;

      // Mode toggle button
      const modeBtn = { x: (this.width - 110) / 2, y: 62, w: 110, h: 24 };
      if (this.hitTest(x, y, modeBtn.x, modeBtn.y, modeBtn.w, modeBtn.h)) {
        this.openMode = this.openMode === 'classic' ? 'slot' : 'classic';
        return;
      }

      // Collection button
      if (this.hitTest(x, y, this.width - 15 - 120, 65, 120, 24)) {
        this.screen = 'collection';
        return;
      }

      // Case cards
      const hovered = this.getHoveredCase(x, y);
      if (hovered >= 0) {
        if (this.save.coins >= CASES[hovered].cost) {
          this.startOpening(CASES[hovered]);
        } else {
          this.notification = this.isZhLang() ? '金币不足!' : 'Not enough coins!';
          this.notifyTimer = 2;
        }
      }
    } else if (this.screen === 'result' && isClick) {
      // Sell button
      const btnW = 180;
      const btnH = 30;
      const btnX = (this.width - btnW) / 2;
      const btnY = 310;
      if (this.hitTest(x, y, btnX, btnY, btnW, btnH)) {
        this.sellItem(this.drawnItem.name, this.drawnItem.value);
      }
      // Click anywhere goes back to menu
      this.screen = 'menu';
    } else if (this.screen === 'collection' && isClick) {
      // Back button
      if (this.hitTest(x, y, 15, 55, 100, 22)) {
        this.screen = 'menu';
        return;
      }

      const allItems = this.getAllItems();
      const cols = 4;
      const cardW = 88;
      const cardH = 70;
      const gapX = Math.floor((this.width - cols * cardW - 20) / (cols - 1));
      const gridStartX = 10;
      const gridStartY = 75;
      const itemsPerPage = cols * 2;
      const startIdx = this.museumPage * itemsPerPage;
      const pageItems = allItems.slice(startIdx, startIdx + itemsPerPage);

      // Check page nav arrows
      if (this.museumTotalPages > 1) {
        if (this.museumPage > 0 && this.hitTest(x, y, 15, this.height - 38, 40, 24)) {
          this.museumPage--;
          return;
        }
        if (this.museumPage < this.museumTotalPages - 1 && this.hitTest(x, y, this.width - 55, this.height - 38, 40, 24)) {
          this.museumPage++;
          return;
        }
      }

      // Click on item card to sell
      const ownedNames = new Set(this.save.collection.map((e) => e.id));
      for (let i = 0; i < pageItems.length; i++) {
        const item = pageItems[i];
        if (!ownedNames.has(item.name)) continue;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = gridStartX + col * (cardW + gapX);
        const cy = gridStartY + row * (cardH + 6);
        if (this.hitTest(x, y, cx, cy, cardW, cardH)) {
          this.sellItem(item.name, item.value);
          return;
        }
      }
    }
  }

  private getHoveredCase(x: number, y: number): number {
    const cardW = 180;
    const cardH = 200;
    const gapX = 25;
    const gapY = 20;
    const startX = (this.width - cardW * 2 - gapX) / 2;
    const startY = 90;
    for (let i = 0; i < CASES.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);
      if (this.hitTest(x, y, cx, cy, cardW, cardH)) return i;
    }
    return -1;
  }
}
