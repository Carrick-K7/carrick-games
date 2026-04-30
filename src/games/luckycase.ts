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

    // Generate scroll items
    const rarity = rollRarity(caseDef.id);
    this.drawnItem = rollItem(caseDef.id, rarity);

    this.animScrollItems = [];
    // Fill with decoy items
    const pool = caseDef.items;
    for (let i = 0; i < 20; i++) {
      const decoy = pool[Math.floor(Math.random() * pool.length)];
      this.animScrollItems.push({
        name: this.isZhLang() ? decoy.nameZh : decoy.name,
        color: RARITY[decoy.rarity].color,
      });
    }
    // Add the real item at the end
    this.animScrollItems.push({
      name: this.isZhLang() ? this.drawnItem.nameZh : this.drawnItem.name,
      color: RARITY[this.drawnItem.rarity].color,
    });
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
      // Scroll for 2 seconds then reveal
      if (this.animTimer >= 2) {
        this.animPhase = 2;
        this.addToCollection(this.drawnItem.name);
        this.save.totalOpens++;
        this.save.totalValue += this.drawnItem.value;
        this.persist();

        // Spawn celebration particles
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

    // Collection button
    ctx.textAlign = 'right';
    ctx.fillStyle = '#39C5BB';
    const collBtn = { x: this.width - 15, y: 65, w: 120, h: 24 };
    ctx.strokeStyle = '#39C5BB';
    ctx.lineWidth = 1;
    ctx.strokeRect(collBtn.x - collBtn.w, collBtn.y, collBtn.w, collBtn.h);
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(zh ? '📋 收藏' : '📋 COLLECTION', collBtn.x - collBtn.w / 2, collBtn.y + 16);

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

  /* ─── Collection Screen ─── */
  private drawCollection(ctx: CanvasRenderingContext2D) {
    const zh = this.isZhLang();
    const dark = this.isDarkTheme();

    // Header
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#39C5BB';
    ctx.fillText(zh ? '📋 收藏品' : '📋 COLLECTION', this.width / 2, 40);

    // Back button
    ctx.strokeStyle = '#39C5BB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.roundRect(ctx, 15, 55, 100, 24, 4);
    ctx.stroke();
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#39C5BB';
    ctx.fillText(zh ? '← 返回' : '← BACK', 65, 72);

    // Sort collection by rarity (highest first)
    const sorted = [...this.save.collection].sort((a, b) => {
      const itemA = this.findItem(a.id);
      const itemB = this.findItem(b.id);
      if (!itemA || !itemB) return 0;
      return rarityIndex(itemB.rarity) - rarityIndex(itemA.rarity);
    });

    const itemH = 36;
    const startY = 95;
    const itemsPerPage = Math.min(sorted.length, 12);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, startY - 5, this.width, this.height - startY + 5);
    ctx.clip();

    for (let i = 0; i < itemsPerPage; i++) {
      const entry = sorted[i];
      const itemDef = this.findItem(entry.id);
      if (!itemDef) continue;
      const rc = RARITY[itemDef.rarity];
      const y = startY + i * itemH;

      // Item row bg
      ctx.fillStyle = dark ? (i % 2 === 0 ? '#1a1a2e' : '#16213e') : (i % 2 === 0 ? '#fff' : '#f0f0f0');
      ctx.fillRect(10, y, this.width - 20, itemH - 2);

      // Rarity bar
      ctx.fillStyle = rc.color;
      ctx.fillRect(10, y, 4, itemH - 2);

      // Emoji
      ctx.font = '18px serif';
      ctx.textAlign = 'left';
      ctx.fillText(itemDef.emoji, 25, y + 24);

      // Name
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = dark ? '#ddd' : '#333';
      ctx.fillText(zh ? itemDef.nameZh : itemDef.name, 55, y + 24);

      // Count
      ctx.textAlign = 'right';
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillStyle = dark ? '#888' : '#666';
      ctx.fillText(`x${entry.count}`, this.width - 80, y + 24);

      // Sell button for items with count > 0
      if (entry.count > 0) {
        ctx.fillStyle = dark ? '#2d2d2d' : '#eee';
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1;
        ctx.beginPath();
        this.roundRect(ctx, this.width - 75, y + 5, 60, 24, 4);
        ctx.fill();
        ctx.stroke();
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(zh ? '出售' : 'SELL', this.width - 45, y + 21);
      }
    }

    ctx.restore();

    if (sorted.length === 0) {
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = dark ? '#555' : '#999';
      ctx.fillText(zh ? '还没有任何收藏品' : 'No items collected yet', this.width / 2, this.height / 2);
    }
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
      if (this.hitTest(x, y, 15, 55, 100, 24)) {
        this.screen = 'menu';
        return;
      }

      // Sell buttons in collection
      const startY = 95;
      const itemH = 36;
      for (let i = 0; i < this.save.collection.length; i++) {
        const entry = this.save.collection[i];
        if (entry.count <= 0) continue;
        const yPos = startY + i * itemH;
        if (this.hitTest(x, y, this.width - 75, yPos + 5, 60, 24)) {
          const itemDef = this.findItem(entry.id);
          if (itemDef) {
            this.sellItem(entry.id, itemDef.value);
          }
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
