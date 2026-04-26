import type { Game } from './core/game.js';
import { getStoredRecord, readStoredRecords } from './core/game.js';
import { getLogicalCanvasSize } from './core/render.js';
import { renderLevelGridHTML, renderDrivingStateHTML, renderMenuHint, type LevelSelectState } from './core/levelselect.js';

declare global {
  interface Window {
    setLang?: (lang: 'en' | 'zh') => void;
    setTheme?: (mode: 'light' | 'dark' | 'system') => void;
    startPreparedGame?: () => void;
  }
}

type GameInstance = Game & { start(): void; stop(): void; destroy?(): void };
type GameCtor = new () => GameInstance;
type GameLoader = () => Promise<GameCtor>;

const GAME_LOADERS = {
  snake: () => import('./games/snake.js').then((m) => m.SnakeGame),
  breakout: () => import('./games/breakout.js').then((m) => m.BreakoutGame),
  bubbleshooter: () => import('./games/bubbleshooter.js').then((m) => m.BubbleShooterGame),
  tetris: () => import('./games/tetris.js').then((m) => m.TetrisGame),
  pong: () => import('./games/pong.js').then((m) => m.PongGame),
  spaceshooter: () => import('./games/spaceshooter.js').then((m) => m.SpaceShooterGame),
  flappybird: () => import('./games/flappybird.js').then((m) => m.FlappyBirdGame),
  pacman: () => import('./games/pacman.js').then((m) => m.PacManGame),
  parking: () => import('./games/parking.js').then((m) => m.ParkingGame),
  asteroids: () => import('./games/asteroids.js').then((m) => m.AsteroidsGame),
  minesweeper: () => import('./games/minesweeper.js').then((m) => m.MinesweeperGame),
  doodlejump: () => import('./games/doodlejump.js').then((m) => m.DoodleJumpGame),
  game2048: () => import('./games/game2048.js').then((m) => m.Game2048),
  simon: () => import('./games/simon.js').then((m) => m.SimonGame),
  frogger: () => import('./games/frogger.js').then((m) => m.FroggerGame),
  beachhead: () => import('./games/beachhead.js').then((m) => m.BeachHeadGame),
  checkers: () => import('./games/checkers.js').then((m) => m.CheckersGame),
  solitaire: () => import('./games/solitaire.js').then((m) => m.SolitaireGame),
  wordle: () => import('./games/wordle.js').then((m) => m.WordleGame),
  sudoku: () => import('./games/sudoku.js').then((m) => m.SudokuGame),
  chess: () => import('./games/chess.js').then((m) => m.ChessGame),
  galaga: () => import('./games/galaga.js').then((m) => m.GalagaGame),
  stacker: () => import('./games/stacker.js').then((m) => m.StackerGame),
  iwanna: () => import('./games/iwanna.js').then((m) => m.IwannaGame),
  aimlab: () => import('./games/aimlab.js').then((m) => m.AimLabGame),
  texashold: () => import('./games/texashold.js').then((m) => m.TexasHoldGame),
  connectfour: () => import('./games/connectfour.js').then((m) => m.ConnectFourGame),
} satisfies Record<string, GameLoader>;

interface VirtualKeySpec {
  label: string;
  key: string;
  aliases?: string[];
  classes?: string;
  hint?: string;
}

export interface GameMeta {
  id: string;
  name: string;
  nameZh: string;
  desc: string;
  descZh: string;
  loader: GameLoader;
  controls: {
    keyboard?: { keys: string[]; action: string; actionZh: string }[];
    keyboardPanel?: VirtualKeySpec[];
    touch?: { icon: 'tap' | 'swipe' | 'swipe-up' | 'swipe-down' | 'swipe-left' | 'swipe-right' | 'hold'; action: string; actionZh: string }[];
  };
  canvasSize: { width: number; height: number };
}

export const GAMES: GameMeta[] = [
  {
    id: 'snake',
    name: 'Snake',
    nameZh: '贪吃蛇',
    desc: 'Classic arcade snake. Eat, grow, and avoid the walls.',
    descZh: '经典街机贪吃蛇。吃东西、变长、别撞墙。',
    loader: GAME_LOADERS.snake,
    canvasSize: { width: 400, height: 400 },
    controls: {
      keyboard: [
        { keys: ['←', '↑', '→', '↓'], action: 'Move', actionZh: '移动' },
        { keys: ['W', 'A', 'S', 'D'], action: 'Move', actionZh: '移动' },
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap sides to turn', actionZh: '点击边缘转向' },
      ],
    },
  },
  {
    id: 'breakout',
    name: 'Breakout',
    nameZh: '打砖块',
    desc: 'Bounce the ball and break all bricks.',
    descZh: '弹球击碎所有砖块。',
    loader: GAME_LOADERS.breakout,
    canvasSize: { width: 480, height: 360 },
    controls: {
      keyboard: [
        { keys: ['←', '→'], action: 'Move paddle', actionZh: '移动挡板' },
        { keys: ['A', 'D'], action: 'Move paddle', actionZh: '移动挡板' },
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'swipe-left', action: 'Swipe left / right', actionZh: '左右滑动' },
        { icon: 'tap', action: 'Tap to restart', actionZh: '点击重新开始' },
      ],
    },
  },
  {
    id: 'bubbleshooter',
    name: 'Bubble Shooter',
    nameZh: '泡泡龙',
    desc: 'Aim from the bottom, match colors, and stop the bubble wall from reaching you.',
    descZh: '从底部瞄准发射,消除同色泡泡,阻止泡泡墙压到底部。',
    loader: GAME_LOADERS.bubbleshooter,
    canvasSize: { width: 420, height: 620 },
    controls: {
      keyboard: [
        { keys: ['←', '→'], action: 'Adjust aim', actionZh: '调整瞄准' },
        { keys: ['A', 'D'], action: 'Adjust aim', actionZh: '调整瞄准' },
        { keys: ['Space', 'Enter'], action: 'Fire / Restart', actionZh: '发射 / 重新开始' },
      ],
      touch: [
        { icon: 'swipe', action: 'Drag to aim', actionZh: '拖动瞄准' },
        { icon: 'tap', action: 'Tap to fire / restart', actionZh: '点击发射 / 重开' },
      ],
    },
  },
  {
    id: 'tetris',
    name: 'Tetris',
    nameZh: '俄罗斯方块',
    desc: 'The legendary falling blocks puzzle.',
    descZh: '传奇下落方块益智游戏。',
    loader: GAME_LOADERS.tetris,
    canvasSize: { width: 300, height: 600 },
    controls: {
      keyboard: [
        { keys: ['←', '→'], action: 'Move', actionZh: '移动' },
        { keys: ['↓'], action: 'Soft drop', actionZh: '软降' },
        { keys: ['↑', 'X'], action: 'Rotate CW', actionZh: '顺时针旋转' },
        { keys: ['Z'], action: 'Rotate CCW', actionZh: '逆时针旋转' },
        { keys: ['Space'], action: 'Hard drop / Restart', actionZh: '硬降 / 重新开始' },
      ],
      touch: [
        { icon: 'swipe-left', action: 'Swipe left / right', actionZh: '左右滑动移动' },
        { icon: 'swipe-up', action: 'Swipe up', actionZh: '上滑硬降' },
        { icon: 'swipe-down', action: 'Swipe down', actionZh: '下滑软降' },
        { icon: 'tap', action: 'Tap to rotate', actionZh: '点击旋转' },
      ],
    },
  },
  {
    id: 'pong',
    name: 'Pong',
    nameZh: '乒乓',
    desc: 'Classic arcade table tennis against AI.',
    descZh: '经典街机乒乓球对战 AI。',
    loader: GAME_LOADERS.pong,
    canvasSize: { width: 600, height: 400 },
    controls: {
      keyboard: [
        { keys: ['↑', 'W'], action: 'Move up', actionZh: '上移' },
        { keys: ['↓', 'S'], action: 'Move down', actionZh: '下移' },
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap upper/lower half to move', actionZh: '点击上半/下半屏移动' },
      ],
    },
  },
  {
    id: 'spaceshooter',
    name: 'Space Shooter',
    nameZh: '太空射击',
    desc: 'Vertical space shooter. Destroy enemies and avoid collisions.',
    descZh: '纵向太空射击游戏。消灭敌人并避免碰撞。',
    loader: GAME_LOADERS.spaceshooter,
    canvasSize: { width: 480, height: 640 },
    controls: {
      keyboard: [
        { keys: ['←', '→'], action: 'Move ship', actionZh: '移动飞船' },
        { keys: ['A', 'D'], action: 'Move ship', actionZh: '移动飞船' },
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap left/right side to move', actionZh: '点击左/右侧移动' },
      ],
    },
  },
  {
    id: 'flappybird',
    name: 'Flappy Bird',
    nameZh: '像素鸟',
    desc: 'Tap to flap. Dodge the pipes and survive.',
    descZh: '点击飞翔,躲避管道,尽可能存活。',
    loader: GAME_LOADERS.flappybird,
    canvasSize: { width: 400, height: 560 },
    controls: {
      keyboard: [
        { keys: ['Space'], action: 'Flap / Restart', actionZh: '飞翔 / 重新开始' },
        { keys: ['↑', 'W'], action: 'Flap', actionZh: '飞翔' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap to flap', actionZh: '点击飞翔' },
      ],
    },
  },
  {
    id: 'pacman',
    name: 'Pac-Man',
    nameZh: '吃豆人',
    desc: 'Classic maze chase. Eat all dots and avoid ghosts.',
    descZh: '经典迷宫追逐游戏。吃完所有豆子并躲避幽灵。',
    loader: GAME_LOADERS.pacman,
    canvasSize: { width: 448, height: 496 },
    controls: {
      keyboard: [
        { keys: ['←', '↑', '→', '↓'], action: 'Move', actionZh: '移动' },
        { keys: ['W', 'A', 'S', 'D'], action: 'Move', actionZh: '移动' },
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap left/center/right to steer', actionZh: '点击左/中/右侧转向' },
      ],
    },
  },
  {
    id: 'asteroids',
    name: 'Asteroids',
    nameZh: '小行星',
    desc: 'Classic vector arcade. Thrust and shoot your way through asteroid fields.',
    descZh: '经典矢量街机游戏。在小行星带中旋转、推进、射击。',
    loader: GAME_LOADERS.asteroids,
    canvasSize: { width: 600, height: 600 },
    controls: {
      keyboard: [
        { keys: ['←', '→'], action: 'Rotate', actionZh: '旋转' },
        { keys: ['A', 'D'], action: 'Rotate', actionZh: '旋转' },
        { keys: ['↑', 'W'], action: 'Thrust', actionZh: '推进' },
        { keys: ['Space'], action: 'Shoot / Restart', actionZh: '射击 / 重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap to shoot, swipe edges to rotate/thrust', actionZh: '点击射击,滑动边缘旋转/推进' },
      ],
    },
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    nameZh: '扫雷',
    desc: 'Classic puzzle. Reveal cells, avoid mines, and use numbers to deduce safe paths.',
    descZh: '经典益智游戏。翻开格子,避免地雷,用数字推理安全路径。',
    loader: GAME_LOADERS.minesweeper,
    canvasSize: { width: 328, height: 412 },
    controls: {
      keyboard: [
        { keys: ['←', '↑', '→', '↓'], action: 'Move cursor', actionZh: '移动光标' },
        { keys: ['W', 'A', 'S', 'D'], action: 'Move cursor', actionZh: '移动光标' },
        { keys: ['Space', 'Enter'], action: 'Reveal cell', actionZh: '翻开格子' },
        { keys: ['F', 'X'], action: 'Flag / unflag', actionZh: '标记 / 取消标记' },
        { keys: ['R'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap to reveal', actionZh: '点击翻开' },
        { icon: 'hold', action: 'Long press to flag', actionZh: '长按标记' },
      ],
    },
  },
  {
    id: 'doodlejump',
    name: 'Doodle Jump',
    nameZh: '涂鸦跳跃',
    desc: 'Bounce higher and higher on platforms. Avoid falling!',
    descZh: '在平台上越跳越高,千万别掉下去!',
    loader: GAME_LOADERS.doodlejump,
    canvasSize: { width: 400, height: 600 },
    controls: {
      keyboard: [
        { keys: ['←', '→'], action: 'Move left/right', actionZh: '左右移动' },
        { keys: ['A', 'D'], action: 'Move left/right', actionZh: '左右移动' },
        { keys: ['Space', '↑', 'W'], action: 'Jump / Restart', actionZh: '跳跃 / 重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap left/right to move, tap to jump', actionZh: '点击左右移动,点击跳跃' },
      ],
    },
  },
  {
    id: '2048',
    name: '2048',
    nameZh: '2048',
    desc: 'Slide and merge tiles to reach 2048.',
    descZh: '滑动合并数字方块,挑战 2048!',
    loader: GAME_LOADERS.game2048,
    canvasSize: { width: 400, height: 400 },
    controls: {
      keyboard: [
        { keys: ['←', '↑', '→', '↓'], action: 'Slide tiles', actionZh: '滑动方块' },
        { keys: ['W', 'A', 'S', 'D'], action: 'Slide tiles', actionZh: '滑动方块' },
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'swipe', action: 'Swipe to slide tiles', actionZh: '滑动方向合并' },
      ],
    },
  },
  {
    id: 'simon',
    name: 'Simon Says',
    nameZh: '西蒙记忆',
    desc: 'Memorize the color sequence, repeat it, and keep up as the playback speeds up.',
    descZh: '记住颜色序列并快速重复,随着关卡提升节奏会越来越快。',
    loader: GAME_LOADERS.simon,
    canvasSize: { width: 400, height: 500 },
    controls: {
      keyboard: [
        { keys: ['1', 'R'], action: 'Red pad', actionZh: '红色按键' },
        { keys: ['2', 'B'], action: 'Blue pad', actionZh: '蓝色按键' },
        { keys: ['3', 'G'], action: 'Green pad', actionZh: '绿色按键' },
        { keys: ['4', 'Y'], action: 'Yellow pad', actionZh: '黄色按键' },
      ],
      keyboardPanel: [
        { label: '1', key: '1', aliases: ['r'], classes: 'simon-red', hint: 'R' },
        { label: '2', key: '2', aliases: ['b'], classes: 'simon-blue', hint: 'B' },
        { label: '3', key: '3', aliases: ['g'], classes: 'simon-green', hint: 'G' },
        { label: '4', key: '4', aliases: ['y'], classes: 'simon-yellow', hint: 'Y' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap a colored pad', actionZh: '点击颜色按键' },
      ],
    },
  },
  {
    id: 'frogger',
    name: 'Frogger',
    nameZh: '青蛙过河',
    desc: 'Guide the frog across busy roads and rivers to reach home.',
    descZh: '控制青蛙穿越繁忙的公路和河流,安全回家。',
    loader: GAME_LOADERS.frogger,
    canvasSize: { width: 480, height: 560 },
    controls: {
      keyboard: [
        { keys: ['←', '↑', '→', '↓'], action: 'Move / Hop', actionZh: '移动 / 跳跃' },
        { keys: ['W', 'A', 'S', 'D'], action: 'Move', actionZh: '移动' },
        { keys: ['Space'], action: 'Start / Restart', actionZh: '开始 / 重新开始' },
      ],
      touch: [
        { icon: 'swipe-up', action: 'Hop forward', actionZh: '向前跳' },
        { icon: 'swipe-down', action: 'Hop backward', actionZh: '向后跳' },
        { icon: 'swipe-left', action: 'Hop left', actionZh: '向左跳' },
        { icon: 'swipe-right', action: 'Hop right', actionZh: '向右跳' },
        { icon: 'tap', action: 'Tap to start / restart', actionZh: '点击开始 / 重新开始' },
      ],
    },
  },
  {
    id: 'beachhead',
    name: 'Beach Head',
    nameZh: '抢滩登陆战',
    desc: 'Hold the shoreline, rotate the turret, and sink incoming landing waves.',
    descZh: '坚守海岸炮台,旋转瞄准并击沉来袭的登陆波次。',
    loader: GAME_LOADERS.beachhead,
    canvasSize: { width: 480, height: 400 },
    controls: {
      keyboard: [
        { keys: ['←', '→'], action: 'Rotate turret', actionZh: '旋转炮台' },
        { keys: ['↑', '↓'], action: 'Adjust range', actionZh: '调整仰角' },
        { keys: ['Space', 'Z'], action: 'Fire shell', actionZh: '开火' },
      ],
      touch: [
        { icon: 'swipe-left', action: 'Rotate left', actionZh: '向左旋转' },
        { icon: 'swipe-right', action: 'Rotate right', actionZh: '向右旋转' },
        { icon: 'tap', action: 'Tap to fire', actionZh: '点击开火' },
      ],
    },
  },
  {
    id: 'checkers',
    name: 'Checkers',
    nameZh: '跳棋',
    desc: 'Classic checkers against AI. Capture all enemy pieces or block their moves to win.',
    descZh: '经典跳棋对战 AI。吃掉所有敌方棋子或让其无路可走即可获胜。',
    loader: GAME_LOADERS.checkers,
    canvasSize: { width: 500, height: 540 },
    controls: {
      keyboard: [
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap piece to select, tap square to move', actionZh: '点击棋子选择,点击格子移动' },
      ],
    },
  },
  {
    id: 'solitaire',
    name: 'Solitaire',
    nameZh: '纸牌',
    desc: 'Classic Klondike Solitaire. Move cards, build foundations, and clear the table.',
    descZh: '经典纸牌游戏。将所有纸牌移到王牌堆即可通关。',
    loader: GAME_LOADERS.solitaire,
    canvasSize: { width: 480, height: 640 },
    controls: {
      keyboard: [
        { keys: ['1', '2', '3', '4', '5', '6', '7'], action: 'Select column', actionZh: '选择列' },
        { keys: ['Space'], action: 'Draw card', actionZh: '发牌' },
        { keys: ['Escape'], action: 'Deselect', actionZh: '取消选择' },
      ],
      touch: [
        { icon: 'tap', action: 'Select / move card', actionZh: '选择 / 移动牌' },
        { icon: 'hold', action: 'Double-click: auto-move', actionZh: '双击:自动放牌' },
      ],
    },
  },
  {
    id: 'wordle',
    name: 'Wordle',
    nameZh: '猜单词',
    desc: 'Guess the 5-letter word in 6 tries. Green = correct, Yellow = wrong place, Gray = not in word.',
    descZh: '在六次尝试内猜出五个字母的单词。绿色=正确,黄色=位置错,灰色=不存在。',
    loader: GAME_LOADERS.wordle,
    canvasSize: { width: 520, height: 520 },
    controls: {
      keyboard: [
        { keys: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'], action: 'Type letter', actionZh: '输入字母' },
        { keys: ['Enter'], action: 'Submit guess', actionZh: '提交猜测' },
        { keys: ['Backspace'], action: 'Delete letter', actionZh: '删除字母' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap on-screen keys', actionZh: '点击屏幕键盘' },
      ],
    },
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    nameZh: '数独',
    desc: 'Fill the 9x9 grid so each row, column, and 3x3 box contains digits 1-9.',
    descZh: '在9x9网格中填入1-9数字,使每行、每列、每个3x3宫格都不重复。',
    loader: GAME_LOADERS.sudoku,
    canvasSize: { width: 480, height: 560 },
    controls: {
      keyboard: [
        { keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], action: 'Input number', actionZh: '输入数字' },
        { keys: ['←', '↑', '→', '↓'], action: 'Move selection', actionZh: '移动选择' },
        { keys: ['N'], action: 'Toggle note mode', actionZh: '切换笔记模式' },
        { keys: ['H'], action: 'Use hint', actionZh: '使用提示' },
        { keys: ['Backspace', 'Delete', '0'], action: 'Clear cell', actionZh: '清除格子' },
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap cell to select, tap numpad to input', actionZh: '点击格子选择,点击数字键输入' },
      ],
    },
  },
  {
    id: 'chess',
    name: 'Chess',
    nameZh: '国际象棋',
    desc: 'Classic chess against AI. Click to select and move pieces.',
    descZh: '经典国际象棋对战 AI。点击选择并移动棋子。',
    loader: GAME_LOADERS.chess,
    canvasSize: { width: 480, height: 560 },
    controls: {
      keyboard: [
        { keys: ['Escape'], action: 'Deselect', actionZh: '取消选择' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap to select / move piece', actionZh: '点击选择/移动棋子' },
      ],
    },
  },
  {
    id: 'galaga',
    name: 'Galaga',
    nameZh: '大战役',
    desc: 'Classic vertical shooter - destroy enemy formations before they dive-bomb you!',
    descZh: '经典垂直射击游戏--在敌人俯冲轰炸前消灭它们!',
    loader: GAME_LOADERS.galaga,
    canvasSize: { width: 420, height: 620 },
    controls: {
      keyboard: [
        { keys: ['←', 'A'], action: 'Move left', actionZh: '左移' },
        { keys: ['→', 'D'], action: 'Move right', actionZh: '右移' },
        { keys: ['Space'], action: 'Shoot', actionZh: '射击' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap to shoot', actionZh: '点击射击' },
      ],
    },
  },
  {
    id: 'stacker',
    name: 'Stacker',
    nameZh: '堆叠方块',
    desc: 'Classic arcade Stacker. Time your locks perfectly to stack all the way to the top!',
    descZh: '经典街机堆叠方块。精准时机,一路堆到顶端!',
    loader: GAME_LOADERS.stacker,
    canvasSize: { width: 320, height: 480 },
    controls: {
      keyboard: [
        { keys: ['←', '→', 'A', 'D', 'Space'], action: 'Lock block', actionZh: '锁定方块' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap to lock block', actionZh: '点击锁定方块' },
        { icon: 'swipe-left', action: 'Swipe left / right', actionZh: '左右滑动' },
      ],
    },
  },
  {
    id: 'iwanna',
    name: 'I Wanna',
    nameZh: 'I Wanna',
    desc: 'Pure precision platforming. Climb increasingly brutal jump chains with no trick traps.',
    descZh: '纯技术向平台跳跃。没有阴人机关,只有逐步升级的跳跃难度。',
    loader: GAME_LOADERS.iwanna,
    canvasSize: { width: 480, height: 560 },
    controls: {
      keyboard: [
        { keys: ['←', '→'], action: 'Move left/right', actionZh: '左右移动' },
        { keys: ['A', 'D'], action: 'Move left/right', actionZh: '左右移动' },
        { keys: ['Space', 'Z', '↑'], action: 'Jump / Restart', actionZh: '跳跃 / 重开' },
        { keys: ['R'], action: 'Restart after death', actionZh: '死亡后重开' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap to jump / restart', actionZh: '点击跳跃 / 重开' },
        { icon: 'swipe-left', action: 'Swipe left', actionZh: '向左滑' },
        { icon: 'swipe-right', action: 'Swipe right', actionZh: '向右滑' },
      ],
    },
  },
  {
    id: 'texashold',
    name: "Texas Hold'em",
    nameZh: '德州扑克',
    desc: 'Four-player Hold\u2019em with betting rounds, AI opponents, and showdown scoring.',
    descZh: '四人德州扑克,含下注轮、AI 对手与摊牌结算。',
    loader: GAME_LOADERS.texashold,
    canvasSize: { width: 440, height: 520 },
    controls: {
      keyboard: [
        { keys: ['F'], action: 'Fold', actionZh: '弃牌' },
        { keys: ['C'], action: 'Call / Check', actionZh: '跟注 / 过牌' },
        { keys: ['R'], action: 'Raise', actionZh: '加注' },
        { keys: ['A'], action: 'All-in', actionZh: '全下' },
        { keys: ['Space', 'Enter'], action: 'Advance next hand / restart', actionZh: '进入下一局 / 重开' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap Fold / Call / Raise / All-in buttons', actionZh: '点击弃牌 / 跟注 / 加注 / 全下按钮' },
      ],
    },
  },
  {
    id: 'parking',
    name: 'Parking',
    nameZh: '停车',
    desc: 'Top-down parking challenge. Steer into the spot without crashing.',
    descZh: '俯视停车挑战。操控汽车驶入车位,不要撞到障碍物。',
    loader: GAME_LOADERS.parking,
    canvasSize: { width: 400, height: 520 },
    controls: {
      keyboard: [
        { keys: ['↑', 'W'], action: 'Accelerate', actionZh: '加速' },
        { keys: ['↓', 'S'], action: 'Brake / Reverse', actionZh: '刹车 / 倒车' },
        { keys: ['←', 'A'], action: 'Steer left', actionZh: '向左转' },
        { keys: ['→', 'D'], action: 'Steer right', actionZh: '向右转' },
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap top/bottom/left/right zones to drive', actionZh: '点击上/下/左/右区域驾驶' },
      ],
    },
  },
  {
    id: 'connectfour',
    name: 'Connect Four',
    nameZh: '四子连珠',
    desc: 'Drop discs and connect four in a row before the computer does.',
    descZh: '在电脑之前将四个棋子连成一线。',
    loader: GAME_LOADERS.connectfour,
    canvasSize: { width: 440, height: 440 },
    controls: {
      keyboard: [
        { keys: ['1', '2', '3', '4', '5', '6', '7'], action: 'Drop in column', actionZh: '在对应列落子' },
        { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap column to drop', actionZh: '点击列落子' },
      ],
    },
  },
  {
    id: 'aimlab',
    name: 'Aim Lab',
    nameZh: '瞄准实验室',
    desc: 'Test your reaction speed. Click targets as fast and accurately as possible.',
    descZh: '测试你的反应速度。尽可能快速准确地点击目标。',
    loader: GAME_LOADERS.aimlab,
    canvasSize: { width: 500, height: 400 },
    controls: {
      keyboard: [],
      touch: [
        { icon: 'tap', action: 'Tap target', actionZh: '点击目标' },
      ],
    },
  },
];

interface GameGroup {
  id: string;
  name: string;
  nameZh: string;
}

const GAME_GROUPS: GameGroup[] = [
  { id: 'arcade', name: 'Arcade Movement', nameZh: '街机动作' },
  { id: 'combat', name: 'Combat & Shooters', nameZh: '射击战斗' },
  { id: 'puzzle', name: 'Puzzles & Word', nameZh: '益智解谜' },
  { id: 'tabletop', name: 'Tabletop & Cards', nameZh: '桌面卡牌' },
];

const GAME_GROUP_MAP: Record<string, string> = {
  snake: 'arcade', pacman: 'arcade', frogger: 'arcade',
  flappybird: 'arcade', doodlejump: 'arcade', iwanna: 'arcade',
  parking: 'arcade', breakout: 'arcade', pong: 'arcade', stacker: 'arcade',
  spaceshooter: 'combat', galaga: 'combat',
  asteroids: 'combat', beachhead: 'combat',
  bubbleshooter: 'puzzle', tetris: 'puzzle', '2048': 'puzzle',
  simon: 'puzzle', minesweeper: 'puzzle', wordle: 'puzzle',
  sudoku: 'puzzle',
  checkers: 'tabletop', chess: 'tabletop', connectfour: 'tabletop',
  solitaire: 'tabletop', texashold: 'tabletop',
};

const GAME_LIST_ORDER = [
  'snake', 'pacman', 'frogger', 'flappybird', 'doodlejump', 'iwanna',
  'parking', 'breakout', 'pong', 'stacker',
  'spaceshooter', 'galaga', 'asteroids', 'beachhead',
  'bubbleshooter', 'tetris', '2048', 'simon',
  'minesweeper', 'wordle', 'sudoku',
  'checkers', 'chess', 'connectfour', 'solitaire', 'texashold',
  'aimlab',
] as const;

const GAME_LIST_ORDER_INDEX: Map<string, number> = new Map(
  GAME_LIST_ORDER.map((id, index) => [id, index] as const)
);

let currentGameName: string | null = null;
let currentGameInstance: GameInstance | null = null;
let isRunning = false;
let isLoadingGame = false;
let prepareGameToken = 0;

function renderTouchIcon(icon: string): string {
  const icons: Record<string, string> = {
    tap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity="0.2"/><path d="M12 8v8M9 11l3-3 3 3"/></svg>',
    'swipe-left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 8l-4 4 4 4M6 12h12"/></svg>',
    'swipe-right': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 8l4 4-4 4M18 12H6"/></svg>',
    'swipe-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 14l4-4 4 4M12 6v12"/></svg>',
    'swipe-down': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 10l4 4 4-4M12 6v12"/></svg>',
    hold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2" opacity="0.2"/><path d="M12 8v8M9 12h6"/></svg>',
    swipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M14 8l4 4-4 4"/></svg>',
  };
  return icons[icon] || icons.tap;
}

function updateActionButton() {
  const btn = document.getElementById('actionBtn') as HTMLButtonElement | null;
  if (!btn) return;
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  if (isLoadingGame) {
    btn.textContent = zh ? '加载中...' : 'Loading...';
    btn.disabled = true;
    return;
  }
  if (!currentGameInstance) {
    btn.textContent = zh ? '选择游戏' : 'Select a game';
    btn.disabled = true;
    return;
  }
  btn.disabled = false;
  if (!isRunning) {
    btn.textContent = zh ? '开始游戏' : 'Start Game';
  } else {
    btn.textContent = zh ? '重新开始' : 'Restart';
  }
}

function updateGameTitle() {
  const titleEl = document.getElementById('gameTitle');
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (titleEl) titleEl.textContent = meta ? (zh ? meta.nameZh : meta.name) : '';
}

function updateGameDesc() {
  const descEl = document.getElementById('gameDesc');
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (descEl) descEl.textContent = meta ? (zh ? meta.descZh : meta.desc) : '';
}

function updateVirtualKeyboardHighlight(pressedSet: Set<string>) {
  document.querySelectorAll('.vkey').forEach((el) => {
    const k = el.getAttribute('data-key') || '';
    el.classList.toggle('pressed', pressedSet.has(k));
  });
}

function renderVirtualKeyboard(activeKeys: string[], panelKeys?: VirtualKeySpec[]) {
  const enabledKeys = new Set(activeKeys);

  if (panelKeys?.length) {
    return `
      <div class="vkeyboard vkeyboard-compact" id="vkeyboard">
        <div class="vkeyboard-row">
          ${panelKeys.map((key) => {
            const normalizedKey = normalizeKey(key.key);
            return `<div class="vkey ${key.classes || ''}" data-key="${normalizedKey}">${key.label}</div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  const mk = (label: string, key: string, wClass: string, enabled: boolean) => {
    const normalizedKey = normalizeKey(key);
    const dataAttr = enabled ? ` data-key="${normalizedKey}"` : '';
    const cls = `${wClass} ${enabled ? '' : ' inactive'}`;
    return `<div class="vkey ${cls}"${dataAttr}>${label}</div>`;
  };

  const a = (key: string) => enabledKeys.has(normalizeKey(key));

  // Standard ANSI 60% layout (no numpad)
  return `
    <div class="vkeyboard" id="vkeyboard">
      <!-- Row 1: Numbers -->
      <div class="vkeyboard-row">
        ${mk('`', '`', 'w-1', a('`'))}
        ${mk('1', '1', 'w-1', a('1'))}
        ${mk('2', '2', 'w-1', a('2'))}
        ${mk('3', '3', 'w-1', a('3'))}
        ${mk('4', '4', 'w-1', a('4'))}
        ${mk('5', '5', 'w-1', a('5'))}
        ${mk('6', '6', 'w-1', a('6'))}
        ${mk('7', '7', 'w-1', a('7'))}
        ${mk('8', '8', 'w-1', a('8'))}
        ${mk('9', '9', 'w-1', a('9'))}
        ${mk('0', '0', 'w-1', a('0'))}
        ${mk('-', '-', 'w-1', a('-'))}
        ${mk('=', '=', 'w-1', a('='))}
        ${mk('←', 'Backspace', 'w-2', a('Backspace'))}
      </div>
      <!-- Row 2: QWERTY -->
      <div class="vkeyboard-row">
        ${mk('Tab', 'Tab', 'w-1-5', a('Tab'))}
        ${mk('Q', 'q', 'w-1', a('q'))}
        ${mk('W', 'w', 'w-1', a('w'))}
        ${mk('E', 'e', 'w-1', a('e'))}
        ${mk('R', 'r', 'w-1', a('r'))}
        ${mk('T', 't', 'w-1', a('t'))}
        ${mk('Y', 'y', 'w-1', a('y'))}
        ${mk('U', 'u', 'w-1', a('u'))}
        ${mk('I', 'i', 'w-1', a('i'))}
        ${mk('O', 'o', 'w-1', a('o'))}
        ${mk('P', 'p', 'w-1', a('p'))}
        ${mk('[', '[', 'w-1', a('['))}
        ${mk(']', ']', 'w-1', a(']'))}
        ${mk('\\', '\\', 'w-1-5', a('\\'))}
      </div>
      <!-- Row 3: ASDF -->
      <div class="vkeyboard-row">
        ${mk('Caps', 'CapsLock', 'w-1-75', a('CapsLock'))}
        ${mk('A', 'a', 'w-1', a('a'))}
        ${mk('S', 's', 'w-1', a('s'))}
        ${mk('D', 'd', 'w-1', a('d'))}
        ${mk('F', 'f', 'w-1', a('f'))}
        ${mk('G', 'g', 'w-1', a('g'))}
        ${mk('H', 'h', 'w-1', a('h'))}
        ${mk('J', 'j', 'w-1', a('j'))}
        ${mk('K', 'k', 'w-1', a('k'))}
        ${mk('L', 'l', 'w-1', a('l'))}
        ${mk(';', ';', 'w-1', a(';'))}
        ${mk("'", "'", 'w-1', a("'"))}
        ${mk('Enter', 'Enter', 'w-2-25', a('Enter'))}
      </div>
      <!-- Row 4: ZXCV + ↑ -->
      <div class="vkeyboard-row">
        ${mk('Shift', 'Shift', 'w-2-25', a('Shift'))}
        ${mk('Z', 'z', 'w-1', a('z'))}
        ${mk('X', 'x', 'w-1', a('x'))}
        ${mk('C', 'c', 'w-1', a('c'))}
        ${mk('V', 'v', 'w-1', a('v'))}
        ${mk('B', 'b', 'w-1', a('b'))}
        ${mk('N', 'n', 'w-1', a('n'))}
        ${mk('M', 'm', 'w-1', a('m'))}
        ${mk(',', ',', 'w-1', a(','))}
        ${mk('.', '.', 'w-1', a('.'))}
        ${mk('/', '/', 'w-1', a('/'))}
        ${mk('↑', 'ArrowUp', 'w-1', a('ArrowUp'))}
        ${mk('Shift', 'ShiftRight', 'w-1-75', a('Shift'))}
      </div>
      <!-- Row 5: Bottom row + ←↓→ -->
      <div class="vkeyboard-row">
        ${mk('Ctrl', 'Control', 'w-1-25', a('Control'))}
        ${mk('Win', 'Meta', 'w-1-25', a('Meta'))}
        ${mk('Alt', 'Alt', 'w-1-25', a('Alt'))}
        ${mk('Space', ' ', 'w-5-25', a(' '))}
        ${mk('Alt', 'AltGraph', 'w-1', a('AltGraph'))}
        ${mk('Fn', 'Fn', 'w-1', a('Fn'))}
        ${mk('Ctrl', 'ControlRight', 'w-1', a('Control'))}
        ${mk('←', 'ArrowLeft', 'w-1', a('ArrowLeft'))}
        ${mk('↓', 'ArrowDown', 'w-1', a('ArrowDown'))}
        ${mk('→', 'ArrowRight', 'w-1', a('ArrowRight'))}
      </div>
    </div>
  `;
}

function getRecord(gameId: string): number | null {
  return getStoredRecord(gameId);
}

function getLevelSelectState(): LevelSelectState | null {
  const g = currentGameInstance as any;
  if (!g || typeof g.totalLevels !== 'number') return null;
  return {
    totalLevels: g.totalLevels,
    currentLevel: typeof g.levelIndexEx === 'number' ? g.levelIndexEx : 0,
    bestLevel: typeof g.bestLevelEx === 'number' ? g.bestLevelEx : 0,
    unlockedLevel: typeof g.unlockedLevelEx === 'number' ? g.unlockedLevelEx : 0,
    speed: typeof g.speed === 'number' ? g.speed : 0,
    maxSpeed: typeof g.maxSpeed === 'number' ? g.maxSpeed : 200,
    timeLeft: typeof g.timeLeftEx === 'number' ? g.timeLeftEx : 0,
    gear: typeof g.gear === 'string' ? g.gear : 'N',
    gameState: typeof g.gameStateEx === 'string' ? g.gameStateEx : 'menu',
  };
}

function getSelectedLevel(): number {
  const g = currentGameInstance as any;
  if (g && typeof g.selectedLevelEx === 'number') return g.selectedLevelEx;
  return 0;
}

function renderStats() {
  const container = document.getElementById('statsPanel');
  if (!container) return;
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (!meta) {
    container.innerHTML = `<div class="stats-empty">${zh ? '选择游戏' : 'Select a game'}</div>`;
    return;
  }

  if (!currentGameName) return;
  const best = getRecord(currentGameName);
  const ls = getLevelSelectState();
  let html = '';

  // Title
  html += `<div class="stats-section">`;
  html += `<div class="stats-title">${zh ? meta.nameZh : meta.name}</div>`;
  if (best != null) {
    html += `<div class="stats-row"><span>${zh ? '最高记录' : 'Best'}</span><span class="stats-value">${best}</span></div>`;
  }
  html += `</div>`;

  // Driving state (replaces in-canvas dashboard)
  if (ls && ls.gameState !== 'menu') {
    html += renderDrivingStateHTML(ls, zh);
  }

  // Level grid
  if (ls) {
    const selected = getSelectedLevel();
    html += `<div class="stats-section"><div class="stats-section-title">${zh ? '关卡' : 'LEVELS'}</div>`;
    html += renderLevelGridHTML(ls, selected, zh);
    html += `</div>`;

    if (ls.gameState === 'menu') {
      html += renderMenuHint(zh);
    }
  }

  container.innerHTML = html;

  // Bind level cell clicks
  if (ls) {
    container.querySelectorAll('.level-cell').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-level') || '', 10);
        if (isNaN(idx)) return;
        const g = currentGameInstance as any;
        if (g && typeof g.selectLevel === 'function') {
          g.selectLevel(idx);
        }
      });
    });
  }
}

function updateLiveScoreDisplay() {
  // Update score if game has it
  const scoreEl = document.getElementById('liveScore');
  if (scoreEl) {
    const score = readGameScore();
    if (score != null) scoreEl.textContent = String(score);
  }

  // Update driving state if applicable
  const ls = getLevelSelectState();
  if (!ls || ls.gameState === 'menu') return;

  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const speedEl = document.getElementById('ds-speed-val');
  const gearEl = document.getElementById('ds-gear-val');
  const timeEl = document.getElementById('ds-time-val');
  const dotsEl = document.getElementById('levelDots');

  if (speedEl) speedEl.textContent = String(Math.round(ls.speed));
  if (gearEl) {
    gearEl.textContent = ls.gear;
    gearEl.style.color = ls.gear === 'R' ? '#ef4444' : ls.gear === 'D' ? 'var(--accent)' : 'var(--text-secondary)';
  }
  if (timeEl) {
    timeEl.textContent = String(Math.ceil(ls.timeLeft));
    timeEl.style.color = ls.timeLeft <= 10 ? '#ef4444' : '';
  }

  // Re-render level dots occasionally (not every tick - level changes are rare)
}

function setLoadingOverlay(active: boolean) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.toggle('active', active);
}

function setStartOverlay(active: boolean) {
  const el = document.getElementById('startOverlay');
  if (!el) return;
  el.classList.toggle('active', active);
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const meta = GAMES.find((g) => g.id === currentGameName);
  const titleEl = el.querySelector('.start-overlay-title') as HTMLElement | null;
  const hintEl = el.querySelector('.start-overlay-hint') as HTMLElement | null;
  if (titleEl) titleEl.textContent = meta ? (zh ? meta.nameZh : meta.name) : '';
  if (hintEl) hintEl.textContent = zh ? '点击「开始游戏」按钮开始' : 'Click Start Game to begin';
}

function readGameScore(): number | null {
  if (!currentGameInstance) return null;
  const raw = (currentGameInstance as any).score;
  if (typeof raw === 'number') return raw;
  return null;
}

let scorePollTimer: number | null = null;

function startScorePolling() {
  stopScorePolling();
  updateLiveScoreDisplay();
  scorePollTimer = window.setInterval(() => {
    updateLiveScoreDisplay();
  }, 200);
}

function stopScorePolling() {
  if (scorePollTimer != null) {
    clearInterval(scorePollTimer);
    scorePollTimer = null;
  }
}

function renderKeyboard() {
  const container = document.getElementById('keyboardPanel');
  if (!container) return;
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (!meta) {
    container.innerHTML = '';
    return;
  }

  const activeKeys = meta.controls.keyboard?.flatMap((k) => k.keys.map(normalizeKey)) || [];
  if (!activeKeys.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = renderVirtualKeyboard(activeKeys, meta.controls.keyboardPanel);
  bindVirtualKeyboard();
}

function renderControlsInfo() {
  const container = document.getElementById('controlsPanel');
  if (!container) return;
  const meta = GAMES.find((g) => g.id === currentGameName);
  if (!meta) {
    container.innerHTML = '';
    return;
  }
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  let html = '';

  if (meta.controls.keyboard?.length) {
    html += `<div class="control-section"><div class="control-section-title">${zh ? '键盘' : 'KEYBOARD'}</div>`;
    for (const row of meta.controls.keyboard) {
      const keysHtml = row.keys.map((k) => `<span class="keycap">${k}</span>`).join('');
      html += `<div class="control-row"><div class="control-keys">${keysHtml}</div><div class="control-label">${zh ? row.actionZh : row.action}</div></div>`;
    }
    html += `</div>`;
  }

  if (meta.controls.touch?.length) {
    html += `<div class="control-section"><div class="control-section-title">${zh ? '触摸' : 'TOUCH'}</div>`;
    for (const row of meta.controls.touch) {
      html += `<div class="control-row"><div class="control-icon">${renderTouchIcon(row.icon)}</div><div class="control-label">${zh ? row.actionZh : row.action}</div></div>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;
}

function renderControls() {
  renderStats();
  renderKeyboard();
  renderControlsInfo();
}

function normalizeKey(label: string): string {
  const map: Record<string, string> = {
    '←': 'ArrowLeft',
    '↑': 'ArrowUp',
    '→': 'ArrowRight',
    '↓': 'ArrowDown',
    'Space': ' ',
  };
  if (map[label]) return map[label];
  return label.length === 1 ? label.toLowerCase() : label;
}

function getKeysFromEvent(e: KeyboardEvent): string[] {
  const keys: string[] = [e.key];
  if (e.code === 'Space') keys.push(' ');
  if (e.key.length === 1) keys.push(e.key.toLowerCase());
  const meta = GAMES.find((g) => g.id === currentGameName);
  for (const panelKey of meta?.controls.keyboardPanel || []) {
    const aliases = [panelKey.key, ...(panelKey.aliases || [])].map(normalizeKey);
    if (aliases.some((alias) => keys.includes(alias))) {
      keys.push(normalizeKey(panelKey.key));
    }
  }
  // Deduplicate
  return [...new Set(keys)];
}

function saveRecord(gameId: string, score: number) {
  const records = readStoredRecords();
  const shouldUpdate = records[gameId] == null || score > records[gameId];
  if (shouldUpdate) {
    records[gameId] = score;
    try {
      localStorage.setItem('cg-records', JSON.stringify(records));
    } catch {
      // Scores are a convenience feature; storage failures should not break play.
    }
  }
}
window.saveRecord = saveRecord;
window.reportScore = (score: number) => {
  if (!currentGameName) return;
  saveRecord(currentGameName, score);
};

function bindVirtualKeyboard() {
  const vk = document.getElementById('vkeyboard');
  if (!vk) return;
  let activeVirtualKey: string | null = null;
  const releaseKey = () => {
    if (!activeVirtualKey) return;
    const event = new KeyboardEvent('keyup', {
      key: activeVirtualKey,
      code: activeVirtualKey === ' ' ? 'Space' : undefined,
      bubbles: true,
    });
    window.dispatchEvent(event);
    getKeysFromEvent(event).forEach((k) => pressedKeys.delete(k));
    updateVirtualKeyboardHighlight(pressedKeys);
    activeVirtualKey = null;
  };

  vk.addEventListener('mousedown', (e) => {
    const target = (e.target as HTMLElement).closest('.vkey[data-key]') as HTMLElement | null;
    const key = target?.getAttribute('data-key');
    if (!key) return;
    e.preventDefault();
    activeVirtualKey = key;
    const keyboardEvent = new KeyboardEvent('keydown', {
      key,
      code: key === ' ' ? 'Space' : undefined,
      bubbles: true,
    });
    window.dispatchEvent(keyboardEvent);
    getKeysFromEvent(keyboardEvent).forEach((k) => pressedKeys.add(k));
    updateVirtualKeyboardHighlight(pressedKeys);
  });
  vk.addEventListener('mouseup', () => {
    releaseKey();
  });
  vk.addEventListener('mouseleave', () => {
    releaseKey();
  });
  vk.addEventListener('touchstart', (e) => {
    const target = (e.target as HTMLElement).closest('.vkey[data-key]') as HTMLElement | null;
    const key = target?.getAttribute('data-key');
    if (!key) return;
    e.preventDefault();
    activeVirtualKey = key;
    const keyboardEvent = new KeyboardEvent('keydown', {
      key,
      code: key === ' ' ? 'Space' : undefined,
      bubbles: true,
    });
    window.dispatchEvent(keyboardEvent);
    getKeysFromEvent(keyboardEvent).forEach((k) => pressedKeys.add(k));
    updateVirtualKeyboardHighlight(pressedKeys);
  });
  vk.addEventListener('touchend', releaseKey);
  vk.addEventListener('touchcancel', releaseKey);
}

export async function prepareGame(name: string) {
  const meta = GAMES.find((g) => g.id === name);
  if (!meta) return;
  const token = ++prepareGameToken;

  stopScorePolling();
  if (currentGameInstance) {
    if (currentGameInstance.destroy) {
      currentGameInstance.destroy();
    } else {
      currentGameInstance.stop();
    }
    currentGameInstance = null;
  }
  isRunning = false;
  isLoadingGame = true;
  currentGameName = name;
  updateActionButton();
  setLoadingOverlay(true);
  updateGameTitle();
  updateGameDesc();
  renderControls();

  document.querySelectorAll('.game-list-item').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-id') === name);
  });

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

  canvas.width = meta.canvasSize.width;
  canvas.height = meta.canvasSize.height;
  canvas.dataset.logicalWidth = String(meta.canvasSize.width);
  canvas.dataset.logicalHeight = String(meta.canvasSize.height);
  canvas.dataset.pixelRatio = '1';

  // Re-apply zoom so the displayed size matches the new canvas dimensions
  const savedZoom = parseInt(localStorage.getItem('cg-zoom') || '100', 10);
  applyCanvasZoom(savedZoom);

  let GameClass: GameCtor;
  try {
    GameClass = await meta.loader();
  } catch (e) {
    if (token === prepareGameToken) {
      isLoadingGame = false;
      setLoadingOverlay(false);
      updateActionButton();
    }
    // eslint-disable-next-line no-console
    console.error(e);
    return;
  }

  const nextGameInstance = new GameClass();
  applyCanvasZoom(savedZoom);
  if (token !== prepareGameToken) {
    nextGameInstance.destroy?.();
    return;
  }
  currentGameInstance = nextGameInstance;
  isLoadingGame = false;
  setLoadingOverlay(false);

  // Draw initial frame so canvas isn't blank
  try {
    currentGameInstance.init();
    const ctx2 = canvas.getContext('2d');
    if (currentGameInstance.renderFrame) {
      currentGameInstance.renderFrame();
    } else if (ctx2) {
      currentGameInstance.draw(ctx2);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }

  startScorePolling();
  updateActionButton();
  updateGameTitle();
  updateGameDesc();
  renderControls();
  setStartOverlay(true);
}

function startPreparedGame() {
  if (!currentGameInstance || isLoadingGame) return;
  try {
    setStartOverlay(false);
    currentGameInstance.start();
    isRunning = true;
    updateActionButton();
    startScorePolling();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
}

export async function loadGame(name: string) {
  await prepareGame(name);
}

function renderGameList(filter = '') {
  const list = document.getElementById('gameList');
  if (!list) return;
  const zh = document.documentElement.getAttribute('data-lang') === 'zh';
  const term = filter.trim().toLowerCase();
  const isSearching = term.length > 0;

  const filtered = GAMES.filter((g) => {
    if (!term) return true;
    return (
      g.name.toLowerCase().includes(term) ||
      g.nameZh.includes(term) ||
      g.desc.toLowerCase().includes(term) ||
      g.descZh.includes(term)
    );
  });

  // Sort by group order, then by list order within each group
  const groupOrder = new Map(GAME_GROUPS.map((g, i) => [g.id, i]));
  filtered.sort((a, b) => {
    const ga = groupOrder.get(GAME_GROUP_MAP[a.id]) ?? 999;
    const gb = groupOrder.get(GAME_GROUP_MAP[b.id]) ?? 999;
    if (ga !== gb) return ga - gb;
    const aIndex = GAME_LIST_ORDER_INDEX.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = GAME_LIST_ORDER_INDEX.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || a.name.localeCompare(b.name);
  });

  if (filtered.length === 0) {
    list.innerHTML = `<div class="search-empty">${zh ? '没有匹配的游戏' : 'No games found'}</div>`;
    return;
  }

  // Build grouped HTML
  let lastGroup = '';
  let html = '';
  for (const g of filtered) {
    const groupId = GAME_GROUP_MAP[g.id] || '';
    if (groupId && groupId !== lastGroup) {
      const group = GAME_GROUPS.find((gr) => gr.id === groupId);
      if (!isSearching && group) {
        html += `<div class="game-list-group">${zh ? group.nameZh : group.name}</div>`;
      }
      lastGroup = groupId;
    }
    html += `
      <button class="game-list-item ${g.id === currentGameName ? 'active' : ''}" data-id="${g.id}">
        <div class="game-list-name">${zh ? g.nameZh : g.name}</div>
        <div class="game-list-desc">${zh ? g.descZh : g.desc}</div>
      </button>
    `;
  }

  list.innerHTML = html;

  list.querySelectorAll('.game-list-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id')!;
      void loadGame(id);
    });
  });
}

function setLang(lang: 'en' | 'zh') {
  document.documentElement.setAttribute('data-lang', lang);
  localStorage.setItem('cg-lang', lang);
  updateActionButton();
  updateGameTitle();
  updateGameDesc();
  renderControls();
  renderGameList((document.getElementById('searchInput') as HTMLInputElement)?.value || '');
  document.querySelectorAll('.lang-btn').forEach((b) => {
    const target = b.getAttribute('data-lang');
    b.classList.toggle('active', target === lang);
  });
}

function setTheme(mode: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') {
    root.setAttribute('data-theme', mode);
  } else {
    root.removeAttribute('data-theme');
  }
  localStorage.setItem('cg-theme', mode);
  document.querySelectorAll('.theme-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-set') === mode);
  });
}

window.setLang = setLang;
window.setTheme = setTheme;
window.startPreparedGame = startPreparedGame;

// Global keyboard highlight listener
const pressedKeys = new Set<string>();
window.addEventListener('keydown', (e) => {
  // Prevent page scrolling from arrow keys and Space
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  getKeysFromEvent(e).forEach((k) => pressedKeys.add(k));
  updateVirtualKeyboardHighlight(pressedKeys);
});
window.addEventListener('keyup', (e) => {
  getKeysFromEvent(e).forEach((k) => pressedKeys.delete(k));
  updateVirtualKeyboardHighlight(pressedKeys);
});
window.addEventListener('blur', () => {
  pressedKeys.clear();
  updateVirtualKeyboardHighlight(pressedKeys);
});

// Canvas zoom logic
function applyCanvasZoom(percent: number) {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement | null;
  const label = document.getElementById('zoomLabel');
  if (!canvas) return;
  const scale = percent / 100;
  const size = getLogicalCanvasSize(canvas);
  // Use width/height instead of transform so document flow adjusts correctly
  canvas.style.width = `${size.width * scale}px`;
  canvas.style.height = `${size.height * scale}px`;
  if (label) label.textContent = `${percent}%`;
  localStorage.setItem('cg-zoom', String(percent));
}

// Fullscreen toggle
function toggleFullscreen() {
  const wrapper = document.getElementById('canvasWrapper');
  if (!wrapper) return;
  wrapper.classList.toggle('fullscreen');
  const isFullscreen = wrapper.classList.contains('fullscreen');
  const btn = document.getElementById('fullscreenBtn');
  if (btn) {
    btn.title = isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
    btn.innerHTML = isFullscreen
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
  }
}

// Init UI
(function init() {
  const savedLang = (localStorage.getItem('cg-lang') as 'en' | 'zh') || 'zh';
  const savedTheme = (localStorage.getItem('cg-theme') as 'light' | 'dark' | 'system') || 'system';
  setLang(savedLang);
  setTheme(savedTheme);

  renderGameList();

  const search = document.getElementById('searchInput') as HTMLInputElement | null;
  if (search) {
    search.addEventListener('input', () => renderGameList(search.value));
  }

  const actionBtn = document.getElementById('actionBtn') as HTMLButtonElement | null;
  if (actionBtn) {
    actionBtn.addEventListener('click', startPreparedGame);
  }

  // Zoom slider
  const zoomSlider = document.getElementById('zoomSlider') as HTMLInputElement | null;
  if (zoomSlider) {
    const savedZoom = parseInt(localStorage.getItem('cg-zoom') || '100', 10);
    zoomSlider.value = String(savedZoom);
    applyCanvasZoom(savedZoom);
    zoomSlider.addEventListener('input', () => {
      applyCanvasZoom(parseInt(zoomSlider.value, 10));
    });
  }

  // Fullscreen button
  const fsBtn = document.getElementById('fullscreenBtn');
  if (fsBtn) {
    fsBtn.addEventListener('click', toggleFullscreen);
  }

  if (GAMES.length) {
    void loadGame(GAMES[0].id);
  }
})();
