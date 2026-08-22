import type { Game, GameHost } from '../core/game.js';

export type GameInstance = Game;
export type GameCtor = new (host: GameHost) => GameInstance;
export type GameLoader = () => Promise<GameCtor>;

export interface VirtualKeySpec {
  label: string;
  key: string;
  aliases?: string[];
  classes?: string;
  hint?: string;
}

export interface GameMeta {
  id: string;
  group: 'casual' | 'action' | 'puzzle' | 'tabletop';
  order: number;
  icon: string;
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
    group: 'casual', order: 2, icon: 'snake',
    name: 'Snake',
    nameZh: '贪吃蛇',
    desc: 'Classic arcade snake. Eat, grow, and avoid the walls.',
    descZh: '经典街机贪吃蛇。吃东西、变长、别撞墙。',
    loader: () => import('./snake.js').then((m) => m.SnakeGame),
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
    group: 'casual', order: 5, icon: 'breakout',
    name: 'Breakout',
    nameZh: '打砖块',
    desc: 'Bounce the ball and break all bricks.',
    descZh: '弹球击碎所有砖块。',
    loader: () => import('./breakout.js').then((m) => m.BreakoutGame),
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
    group: 'puzzle', order: 13, icon: 'bubbleshooter',
    name: 'Bubble Shooter',
    nameZh: '泡泡龙',
    desc: 'Aim from the bottom, match colors, and stop the bubble wall from reaching you.',
    descZh: '从底部瞄准发射,消除同色泡泡,阻止泡泡墙压到底部。',
    loader: () => import('./bubbleshooter.js').then((m) => m.BubbleShooterGame),
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
    group: 'puzzle', order: 14, icon: 'tetris',
    name: 'Tetris',
    nameZh: '俄罗斯方块',
    desc: 'The legendary falling blocks puzzle.',
    descZh: '传奇下落方块益智游戏。',
    loader: () => import('./tetris.js').then((m) => m.TetrisGame),
    canvasSize: { width: 420, height: 600 },
    controls: {
      keyboard: [
        { keys: ['←', '→'], action: 'Move', actionZh: '移动' },
        { keys: ['↓'], action: 'Soft drop', actionZh: '软降' },
        { keys: ['↑', 'X'], action: 'Rotate CW', actionZh: '顺时针旋转' },
        { keys: ['Z'], action: 'Rotate CCW', actionZh: '逆时针旋转' },
        { keys: ['P'], action: 'Pause / resume', actionZh: '暂停 / 继续' },
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
    group: 'casual', order: 6, icon: 'pong',
    name: 'Pong',
    nameZh: '乒乓',
    desc: 'Classic arcade table tennis against AI.',
    descZh: '经典街机乒乓球对战 AI。',
    loader: () => import('./pong.js').then((m) => m.PongGame),
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
    group: 'action', order: 9, icon: 'spaceshooter',
    name: 'Space Shooter',
    nameZh: '太空射击',
    desc: 'Vertical space shooter. Destroy enemies and avoid collisions.',
    descZh: '纵向太空射击游戏。消灭敌人并避免碰撞。',
    loader: () => import('./spaceshooter.js').then((m) => m.SpaceShooterGame),
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
    group: 'casual', order: 3, icon: 'flappybird',
    name: 'Flappy Bird',
    nameZh: '像素鸟',
    desc: 'Tap to flap. Dodge the pipes and survive.',
    descZh: '点击飞翔,躲避管道,尽可能存活。',
    loader: () => import('./flappybird.js').then((m) => m.FlappyBirdGame),
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
    id: 'asteroids',
    group: 'action', order: 11, icon: 'asteroids',
    name: 'Asteroids',
    nameZh: '小行星',
    desc: 'Classic vector arcade. Thrust and shoot your way through asteroid fields.',
    descZh: '经典矢量街机游戏。在小行星带中旋转、推进、射击。',
    loader: () => import('./asteroids.js').then((m) => m.AsteroidsGame),
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
    group: 'puzzle', order: 17, icon: 'minesweeper',
    name: 'Minesweeper',
    nameZh: '扫雷',
    desc: 'Classic puzzle. Reveal cells, avoid mines, and use numbers to deduce safe paths.',
    descZh: '经典益智游戏。翻开格子,避免地雷,用数字推理安全路径。',
    loader: () => import('./minesweeper.js').then((m) => m.MinesweeperGame),
    canvasSize: { width: 328, height: 376 },
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
    group: 'casual', order: 4, icon: 'doodlejump',
    name: 'Doodle Jump',
    nameZh: '涂鸦跳跃',
    desc: 'Bounce higher and higher on platforms. Avoid falling!',
    descZh: '在平台上越跳越高,千万别掉下去!',
    loader: () => import('./doodlejump.js').then((m) => m.DoodleJumpGame),
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
    group: 'puzzle', order: 15, icon: '2048',
    name: '2048',
    nameZh: '2048',
    desc: 'Slide and merge tiles to reach 2048.',
    descZh: '滑动合并数字方块,挑战 2048!',
    loader: () => import('./game2048.js').then((m) => m.Game2048),
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
    group: 'puzzle', order: 16, icon: 'simon',
    name: 'Simon Says',
    nameZh: '西蒙记忆',
    desc: 'Memorize the color sequence, repeat it, and keep up as the playback speeds up.',
    descZh: '记住颜色序列并快速重复,随着关卡提升节奏会越来越快。',
    loader: () => import('./simon.js').then((m) => m.SimonGame),
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
    id: 'checkers',
    group: 'tabletop', order: 20, icon: 'checkers',
    name: 'Checkers',
    nameZh: '跳棋',
    desc: 'Classic checkers against AI. Capture all enemy pieces or block their moves to win.',
    descZh: '经典跳棋对战 AI。吃掉所有敌方棋子或让其无路可走即可获胜。',
    loader: () => import('./checkers.js').then((m) => m.CheckersGame),
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
    group: 'tabletop', order: 23, icon: 'solitaire',
    name: 'Solitaire',
    nameZh: '纸牌',
    desc: 'Classic Klondike Solitaire. Move cards, build foundations, and clear the table.',
    descZh: '经典纸牌游戏。将所有纸牌移到王牌堆即可通关。',
    loader: () => import('./solitaire.js').then((m) => m.SolitaireGame),
    canvasSize: { width: 480, height: 640 },
    controls: {
      keyboard: [
        { keys: ['1', '2', '3', '4', '5', '6', '7'], action: 'Select column', actionZh: '选择列' },
        { keys: ['Space'], action: 'Draw card', actionZh: '发牌' },
        { keys: ['Escape'], action: 'Deselect', actionZh: '取消选择' },
      ],
      touch: [
        { icon: 'tap', action: 'Select / move card', actionZh: '选择 / 移动牌' },
        { icon: 'tap', action: 'Double-click / double-tap: auto-move', actionZh: '双击 / 双击触屏:自动放牌' },
      ],
    },
  },
  {
    id: 'wordle',
    group: 'puzzle', order: 18, icon: 'wordle',
    name: 'Wordle',
    nameZh: '猜单词',
    desc: 'Guess the 5-letter word in 6 tries. Green = correct, Yellow = wrong place, Gray = not in word.',
    descZh: '在六次尝试内猜出五个字母的单词。绿色=正确,黄色=位置错,灰色=不存在。',
    loader: () => import('./wordle.js').then((m) => m.WordleGame),
    canvasSize: { width: 400, height: 520 },
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
    group: 'puzzle', order: 19, icon: 'sudoku',
    name: 'Sudoku',
    nameZh: '数独',
    desc: 'Fill the 9x9 grid so each row, column, and 3x3 box contains digits 1-9.',
    descZh: '在9x9网格中填入1-9数字,使每行、每列、每个3x3宫格都不重复。',
    loader: () => import('./sudoku.js').then((m) => m.SudokuGame),
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
    group: 'tabletop', order: 21, icon: 'chess',
    name: 'Chess',
    nameZh: '国际象棋',
    desc: 'Classic chess against AI. Click to select and move pieces.',
    descZh: '经典国际象棋对战 AI。点击选择并移动棋子。',
    loader: () => import('./chess.js').then((m) => m.ChessGame),
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
    group: 'action', order: 10, icon: 'galaga',
    name: 'Galaga',
    nameZh: '大战役',
    desc: 'Classic vertical shooter - destroy enemy formations before they dive-bomb you!',
    descZh: '经典垂直射击游戏--在敌人俯冲轰炸前消灭它们!',
    loader: () => import('./galaga.js').then((m) => m.GalagaGame),
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
    group: 'casual', order: 7, icon: 'stacker',
    name: 'Stacker',
    nameZh: '堆叠方块',
    desc: 'Classic arcade Stacker. Time your locks perfectly to stack all the way to the top!',
    descZh: '经典街机堆叠方块。精准时机,一路堆到顶端!',
    loader: () => import('./stacker.js').then((m) => m.StackerGame),
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
    group: 'action', order: 8, icon: 'iwanna',
    name: 'I Wanna',
    nameZh: 'I Wanna',
    desc: 'Pure precision platforming. Climb increasingly brutal jump chains with no trick traps.',
    descZh: '纯技术向平台跳跃。没有阴人机关,只有逐步升级的跳跃难度。',
    loader: () => import('./iwanna.js').then((m) => m.IwannaGame),
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
    group: 'tabletop', order: 24, icon: 'texashold',
    name: "Texas Hold'em",
    nameZh: '德州扑克',
    desc: 'Four-player Hold\u2019em with betting rounds, AI opponents, and showdown scoring.',
    descZh: '四人德州扑克,含下注轮、AI 对手与摊牌结算。',
    loader: () => import('./texashold.js').then((m) => m.TexasHoldGame),
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
    group: 'casual', order: 0, icon: 'parking',
    name: 'Parking',
    nameZh: '停车',
    desc: 'Top-down parking challenge. Steer into the spot without crashing.',
    descZh: '俯视停车挑战。操控汽车驶入车位,不要撞到障碍物。',
    loader: () => import('./parking.js').then((m) => m.ParkingGame),
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
    group: 'tabletop', order: 22, icon: 'connectfour',
    name: 'Connect Four',
    nameZh: '四子连珠',
    desc: 'Drop discs and connect four in a row before the computer does.',
    descZh: '在电脑之前将四个棋子连成一线。',
    loader: () => import('./connectfour.js').then((m) => m.ConnectFourGame),
    canvasSize: { width: 440, height: 420 },
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
    id: 'gacha',
    group: 'casual', order: 1, icon: 'gacha',
    name: 'Gacha',
    nameZh: '抽卡',
    desc: 'CS:GO-grade case opening. Official odds, strip spin reveal, and pull statistics.',
    descZh: 'CSGO 分级开箱:官方概率、转轮揭晓动画与抽取统计。',
    loader: () => import('./gacha.js').then((m) => m.GachaGame),
    canvasSize: { width: 640, height: 480 },
    controls: {
      keyboard: [
        { keys: ['Space'], action: 'Open / draw again', actionZh: '开箱 / 再抽一次' },
        { keys: ['Escape'], action: 'Go back', actionZh: '返回' },
        { keys: ['R'], action: 'Return to menu', actionZh: '返回菜单' },
        { keys: ['Shift', 'R'], action: 'Reset stats', actionZh: '重置统计' },
        { keys: ['M'], action: 'Toggle sound', actionZh: '音效开关' },
      ],
      touch: [
        { icon: 'tap', action: 'Tap the case to open, buttons on top to browse prizes and stats', actionZh: '点击箱子开箱,点击顶部按钮浏览奖品与统计' },
      ],
    },
  },
  {
    id: 'aimlab',
    group: 'action', order: 12, icon: 'aimlab',
    name: 'Aim Lab',
    nameZh: 'AimLab',
    desc: 'Test your reaction speed. Click targets as fast and accurately as possible.',
    descZh: '测试你的反应速度。尽可能快速准确地点击目标。',
    loader: () => import('./aimlab.js').then((m) => m.AimLabGame),
    canvasSize: { width: 500, height: 400 },
    controls: {
      keyboard: [],
      touch: [
        { icon: 'tap', action: 'Tap target', actionZh: '点击目标' },
      ],
    },
  },
  {
    id: 'counterstrike',
    group: 'action', order: 7.5, icon: 'counterstrike', // heads the Action family
    name: 'Counter-Strike',
    nameZh: '反恐精英',
    desc: 'First-person CS 1.6 rounds on fy_iceworld. Grab the gun under your spawn, buy at the exposed center buyzone, and win the match.',
    descZh: '第一人称 CS 1.6 警匪回合对战,战场是经典 fy_iceworld。捡起出生点的枪,在中央购买区补给,率先赢下比赛。',
    loader: () => import('./counterstrike.js').then((m) => m.CounterStrikeGame),
    canvasSize: { width: 1280, height: 720 },
    controls: {
      keyboard: [
        { keys: ['W', 'A', 'S', 'D'], action: 'Move', actionZh: '移动' },
        { keys: ['↑', '←', '↓', '→'], action: 'Move', actionZh: '移动' },
        { keys: ['Mouse'], action: 'Look / Fire', actionZh: '瞄准 / 射击' },
        { keys: ['R'], action: 'Reload', actionZh: '换弹' },
        { keys: ['B'], action: 'Buy menu (center buyzone)', actionZh: '购买菜单(中央购买区)' },
        { keys: ['Tab'], action: 'Scoreboard', actionZh: '记分板' },
        { keys: ['1', '2', '3', '4'], action: 'Primary / Pistol / Knife / Grenade', actionZh: '主武器 / 手枪 / 刀 / 手雷' },
        { keys: ['G'], action: 'Drop weapon', actionZh: '丢弃武器' },
        { keys: ['E'], action: 'Swap weapon', actionZh: '交换武器' },
        { keys: ['Shift', 'Ctrl'], action: 'Walk / Crouch', actionZh: '静步 / 蹲下' },
        { keys: ['P', 'M'], action: 'Pause / Mute', actionZh: '暂停 / 静音' },
      ],
      keyboardPanel: [
        { label: 'W', key: 'w', aliases: ['ArrowUp'] },
        { label: 'A', key: 'a', aliases: ['ArrowLeft'] },
        { label: 'S', key: 's', aliases: ['ArrowDown'] },
        { label: 'D', key: 'd', aliases: ['ArrowRight'] },
        { label: 'R', key: 'r' },
        { label: 'B', key: 'b' },
        { label: 'Q', key: 'q', hint: 'last' },
        { label: '1', key: '1' },
        { label: '2', key: '2' },
        { label: '3', key: '3' },
        { label: '4', key: '4' },
        { label: 'G', key: 'g' },
      ],
      touch: [
        { icon: 'swipe', action: 'Left: move stick, right: look', actionZh: '左侧移动摇杆,右侧转视角' },
        { icon: 'tap', action: 'Tap fire / reload / buy buttons', actionZh: '点击开火 / 换弹 / 购买按钮' },
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
  { id: 'casual', name: 'Casual', nameZh: '休闲' },
  { id: 'action', name: 'Action', nameZh: '动作' },
  { id: 'puzzle', name: 'Puzzle', nameZh: '益智' },
  { id: 'tabletop', name: 'Board & Card', nameZh: '棋牌' },
];

export const GAME_GROUP_MAP: Record<string, string> = Object.fromEntries(
  GAMES.map((game) => [game.id, game.group]),
);

export const GAME_LIST_ORDER = GAMES
  .slice()
  .sort((a, b) => a.order - b.order)
  .map((game) => game.id);

export const GAME_LIST_ORDER_INDEX: Map<string, number> = new Map(
  GAME_LIST_ORDER.map((id, index) => [id, index] as const)
);
