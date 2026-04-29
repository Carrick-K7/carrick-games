import type { Game } from '../core/game.js';

export type GameInstance = Game & { start(): void; stop(): void; destroy?(): void };
export type GameCtor = new () => GameInstance;
export type GameLoader = () => Promise<GameCtor>;

export const GAME_LOADERS = {
  snake: () => import('./snake.js').then((m) => m.SnakeGame),
  breakout: () => import('./breakout.js').then((m) => m.BreakoutGame),
  bubbleshooter: () => import('./bubbleshooter.js').then((m) => m.BubbleShooterGame),
  tetris: () => import('./tetris.js').then((m) => m.TetrisGame),
  pong: () => import('./pong.js').then((m) => m.PongGame),
  spaceshooter: () => import('./spaceshooter.js').then((m) => m.SpaceShooterGame),
  flappybird: () => import('./flappybird.js').then((m) => m.FlappyBirdGame),
  pacman: () => import('./pacman.js').then((m) => m.PacManGame),
  parking: () => import('./parking.js').then((m) => m.ParkingGame),
  asteroids: () => import('./asteroids.js').then((m) => m.AsteroidsGame),
  minesweeper: () => import('./minesweeper.js').then((m) => m.MinesweeperGame),
  doodlejump: () => import('./doodlejump.js').then((m) => m.DoodleJumpGame),
  game2048: () => import('./game2048.js').then((m) => m.Game2048),
  simon: () => import('./simon.js').then((m) => m.SimonGame),
  frogger: () => import('./frogger.js').then((m) => m.FroggerGame),
  beachhead: () => import('./beachhead.js').then((m) => m.BeachHeadGame),
  checkers: () => import('./checkers.js').then((m) => m.CheckersGame),
  solitaire: () => import('./solitaire.js').then((m) => m.SolitaireGame),
  wordle: () => import('./wordle.js').then((m) => m.WordleGame),
  sudoku: () => import('./sudoku.js').then((m) => m.SudokuGame),
  chess: () => import('./chess.js').then((m) => m.ChessGame),
  galaga: () => import('./galaga.js').then((m) => m.GalagaGame),
  stacker: () => import('./stacker.js').then((m) => m.StackerGame),
  iwanna: () => import('./iwanna.js').then((m) => m.IwannaGame),
  aimlab: () => import('./aimlab.js').then((m) => m.AimLabGame),
  texashold: () => import('./texashold.js').then((m) => m.TexasHoldGame),
  connectfour: () => import('./connectfour.js').then((m) => m.ConnectFourGame),
} satisfies Record<string, GameLoader>;

export interface VirtualKeySpec {
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

export interface GameGroup {
  id: string;
  name: string;
  nameZh: string;
}

export const GAME_GROUPS: GameGroup[] = [
  { id: 'arcade', name: 'Arcade Movement', nameZh: '街机动作' },
  { id: 'combat', name: 'Combat & Shooters', nameZh: '射击战斗' },
  { id: 'puzzle', name: 'Puzzles & Word', nameZh: '益智解谜' },
  { id: 'tabletop', name: 'Tabletop & Cards', nameZh: '桌面卡牌' },
];

export const GAME_GROUP_MAP: Record<string, string> = {
  snake: 'arcade', pacman: 'arcade', frogger: 'arcade',
  flappybird: 'arcade', doodlejump: 'arcade', iwanna: 'arcade',
  parking: 'arcade', breakout: 'arcade', pong: 'arcade', stacker: 'arcade',
  spaceshooter: 'combat', galaga: 'combat',
  asteroids: 'combat', beachhead: 'combat', aimlab: 'combat',
  bubbleshooter: 'puzzle', tetris: 'puzzle', '2048': 'puzzle',
  simon: 'puzzle', minesweeper: 'puzzle', wordle: 'puzzle',
  sudoku: 'puzzle',
  checkers: 'tabletop', chess: 'tabletop', connectfour: 'tabletop',
  solitaire: 'tabletop', texashold: 'tabletop',
};

export const GAME_LIST_ORDER = [
  'parking', 'snake', 'pacman', 'frogger', 'flappybird', 'doodlejump', 'iwanna',
  'breakout', 'pong', 'stacker',
  'spaceshooter', 'galaga', 'asteroids', 'beachhead',
  'bubbleshooter', 'tetris', '2048', 'simon',
  'minesweeper', 'wordle', 'sudoku',
  'checkers', 'chess', 'connectfour', 'solitaire', 'texashold',
  'aimlab',
] as const;

export const GAME_LIST_ORDER_INDEX: Map<string, number> = new Map(
  GAME_LIST_ORDER.map((id, index) => [id, index] as const)
);
