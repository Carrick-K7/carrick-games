import { SnakeGame } from './games/snake.js';
import { BreakoutGame } from './games/breakout.js';
import { BubbleShooterGame } from './games/bubbleshooter.js';
import { TetrisGame } from './games/tetris.js';
import { PongGame } from './games/pong.js';
import { SpaceShooterGame } from './games/spaceshooter.js';
import { FlappyBirdGame } from './games/flappybird.js';
import { PacManGame } from './games/pacman.js';
import { InvadersGame } from './games/invaders.js';
import { AsteroidsGame } from './games/asteroids.js';
import { MinesweeperGame } from './games/minesweeper.js';
import { DoodleJumpGame } from './games/doodlejump.js';
import { Game2048 } from './games/game2048.js';
import { SimonGame } from './games/simon.js';
import { FroggerGame } from './games/frogger.js';
import { MissileCommandGame } from './games/missilecommand.js';
import { DonkeyKongGame } from './games/donkeykong.js';
import { CentipedeGame } from './games/centipede.js';
import { SolitaireGame } from './games/solitaire.js';
import { WordleGame } from './games/wordle.js';
import { SudokuGame } from './games/sudoku.js';
import { ChessGame } from './games/chess.js';
import { GalagaGame } from './games/galaga.js';
import { StackerGame } from './games/stacker.js';
import { BerzerkGame } from './games/berzerk.js';
import { JoustGame } from './games/joust.js';
import { MahjongGame } from './games/mahjong.js';
export const GAMES = [
    {
        id: 'snake',
        name: 'Snake',
        nameZh: '贪吃蛇',
        desc: 'Classic arcade snake. Eat, grow, and avoid the walls.',
        descZh: '经典街机贪吃蛇。吃东西、变长、别撞墙。',
        cls: SnakeGame,
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
        cls: BreakoutGame,
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
        descZh: '从底部瞄准发射，消除同色泡泡，阻止泡泡墙压到底部。',
        cls: BubbleShooterGame,
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
        cls: TetrisGame,
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
        cls: PongGame,
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
        cls: SpaceShooterGame,
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
        descZh: '点击飞翔，躲避管道，尽可能存活。',
        cls: FlappyBirdGame,
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
        cls: PacManGame,
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
        id: 'invaders',
        name: 'Space Invaders',
        nameZh: '太空侵略者',
        desc: 'Classic horizontal shooter. Destroy waves of invaders before they reach you.',
        descZh: '经典横版射击。在侵略者抵达前消灭它们。',
        cls: InvadersGame,
        canvasSize: { width: 640, height: 480 },
        controls: {
            keyboard: [
                { keys: ['←', '→'], action: 'Move ship', actionZh: '移动飞船' },
                { keys: ['A', 'D'], action: 'Move ship', actionZh: '移动飞船' },
                { keys: ['Space'], action: 'Shoot / Restart', actionZh: '射击 / 重新开始' },
            ],
            touch: [
                { icon: 'tap', action: 'Tap upper half to shoot, lower half to move', actionZh: '点击上半部射击，下半部移动' },
            ],
        },
    },
    {
        id: 'asteroids',
        name: 'Asteroids',
        nameZh: '小行星',
        desc: 'Classic vector arcade. Thrust and shoot your way through asteroid fields.',
        descZh: '经典矢量街机游戏。在小行星带中旋转、推进、射击。',
        cls: AsteroidsGame,
        canvasSize: { width: 600, height: 600 },
        controls: {
            keyboard: [
                { keys: ['←', '→'], action: 'Rotate', actionZh: '旋转' },
                { keys: ['A', 'D'], action: 'Rotate', actionZh: '旋转' },
                { keys: ['↑', 'W'], action: 'Thrust', actionZh: '推进' },
                { keys: ['Space'], action: 'Shoot / Restart', actionZh: '射击 / 重新开始' },
            ],
            touch: [
                { icon: 'tap', action: 'Tap to shoot, swipe edges to rotate/thrust', actionZh: '点击射击，滑动边缘旋转/推进' },
            ],
        },
    },
    {
        id: 'minesweeper',
        name: 'Minesweeper',
        nameZh: '扫雷',
        desc: 'Classic puzzle. Reveal cells, avoid mines, and use numbers to deduce safe paths.',
        descZh: '经典益智游戏。翻开格子，避免地雷，用数字推理安全路径。',
        cls: MinesweeperGame,
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
        descZh: '在平台上越跳越高，千万别掉下去！',
        cls: DoodleJumpGame,
        canvasSize: { width: 400, height: 600 },
        controls: {
            keyboard: [
                { keys: ['←', '→'], action: 'Move left/right', actionZh: '左右移动' },
                { keys: ['A', 'D'], action: 'Move left/right', actionZh: '左右移动' },
                { keys: ['Space', '↑', 'W'], action: 'Jump / Restart', actionZh: '跳跃 / 重新开始' },
            ],
            touch: [
                { icon: 'tap', action: 'Tap left/right to move, tap to jump', actionZh: '点击左右移动，点击跳跃' },
            ],
        },
    },
    {
        id: '2048',
        name: '2048',
        nameZh: '2048',
        desc: 'Slide and merge tiles to reach 2048.',
        descZh: '滑动合并数字方块，挑战 2048！',
        cls: Game2048,
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
        descZh: '记住颜色序列并快速重复，随着关卡提升节奏会越来越快。',
        cls: SimonGame,
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
        descZh: '控制青蛙穿越繁忙的公路和河流，安全回家。',
        cls: FroggerGame,
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
        id: 'missilecommand',
        name: 'Missile Command',
        nameZh: '导弹指挥官',
        desc: 'Defend your cities from incoming missiles. Aim and fire counter-missiles.',
        descZh: '防御来袭的导弹。瞄准并发射拦截导弹，保卫你的城市。',
        cls: MissileCommandGame,
        canvasSize: { width: 400, height: 600 },
        controls: {
            keyboard: [
                { keys: ['Space'], action: 'Fire missile', actionZh: '发射导弹' },
            ],
            touch: [
                { icon: 'tap', action: 'Tap to aim and fire', actionZh: '点击瞄准并发射' },
            ],
        },
    },
    {
        id: 'donkeykong',
        name: 'Donkey Kong',
        nameZh: '大金刚',
        desc: 'Jump across barrels and climb ladders to rescue the princess.',
        descZh: '跳跃躲桶，攀爬梯子，营救公主。',
        cls: DonkeyKongGame,
        canvasSize: { width: 480, height: 400 },
        controls: {
            keyboard: [
                { keys: ['←', '→'], action: 'Move', actionZh: '移动' },
                { keys: ['↑', '↓'], action: 'Climb ladder', actionZh: '攀爬梯子' },
                { keys: ['Space', 'Z'], action: 'Jump', actionZh: '跳跃' },
            ],
            touch: [
                { icon: 'swipe-left', action: 'Move left', actionZh: '向左' },
                { icon: 'swipe-right', action: 'Move right', actionZh: '向右' },
                { icon: 'tap', action: 'Jump', actionZh: '跳跃' },
            ],
        },
    },
    {
        id: 'centipede',
        name: 'Centipede',
        nameZh: '蜈蚣',
        desc: 'Blast the centipede before it reaches the bottom! Mushrooms block its path — shoot them to slow it down.',
        descZh: '在蜈蚣到达底部之前消灭它！蘑菇会挡住它的去路——射击蘑菇让它减速。',
        cls: CentipedeGame,
        canvasSize: { width: 320, height: 480 },
        controls: {
            keyboard: [
                { keys: ['←', '→'], action: 'Move ship', actionZh: '移动飞船' },
                { keys: ['A', 'D'], action: 'Move ship', actionZh: '移动飞船' },
                { keys: ['Space', 'Z'], action: 'Shoot', actionZh: '射击' },
            ],
            touch: [
                { icon: 'tap', action: 'Shoot', actionZh: '射击' },
                { icon: 'swipe-left', action: 'Move left', actionZh: '向左' },
                { icon: 'swipe-right', action: 'Move right', actionZh: '向右' },
            ],
        },
    },
    {
        id: 'solitaire',
        name: 'Solitaire',
        nameZh: '纸牌',
        desc: 'Classic Klondike Solitaire. Move cards, build foundations, and clear the table.',
        descZh: '经典纸牌游戏。将所有纸牌移到王牌堆即可通关。',
        cls: SolitaireGame,
        canvasSize: { width: 480, height: 640 },
        controls: {
            keyboard: [
                { keys: ['1', '2', '3', '4', '5', '6', '7'], action: 'Select column', actionZh: '选择列' },
                { keys: ['Space'], action: 'Draw card', actionZh: '发牌' },
                { keys: ['Escape'], action: 'Deselect', actionZh: '取消选择' },
            ],
            touch: [
                { icon: 'tap', action: 'Select / move card', actionZh: '选择 / 移动牌' },
                { icon: 'hold', action: 'Double-click: auto-move', actionZh: '双击：自动放牌' },
            ],
        },
    },
    {
        id: 'wordle',
        name: 'Wordle',
        nameZh: '猜单词',
        desc: 'Guess the 5-letter word in 6 tries. Green = correct, Yellow = wrong place, Gray = not in word.',
        descZh: '在六次尝试内猜出五个字母的单词。绿色=正确，黄色=位置错，灰色=不存在。',
        cls: WordleGame,
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
        name: 'Sudoku',
        nameZh: '数独',
        desc: 'Fill the 9x9 grid so each row, column, and 3x3 box contains digits 1-9.',
        descZh: '在9x9网格中填入1-9数字，使每行、每列、每个3x3宫格都不重复。',
        cls: SudokuGame,
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
                { icon: 'tap', action: 'Tap cell to select, tap numpad to input', actionZh: '点击格子选择，点击数字键输入' },
            ],
        },
    },
    {
        id: 'chess',
        name: 'Chess',
        nameZh: '国际象棋',
        desc: 'Classic chess against AI. Click to select and move pieces.',
        descZh: '经典国际象棋对战 AI。点击选择并移动棋子。',
        cls: ChessGame,
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
        desc: 'Classic vertical shooter — destroy enemy formations before they dive-bomb you!',
        descZh: '经典垂直射击游戏——在敌人俯冲轰炸前消灭它们！',
        cls: GalagaGame,
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
        descZh: '经典街机堆叠方块。精准时机，一路堆到顶端！',
        cls: StackerGame,
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
        id: 'berzerk',
        name: 'Berzerk',
        nameZh: '狂暴机器人',
        desc: 'Classic 1980 maze chase. Shoot robots, avoid Evil Otto, and escape!',
        descZh: '经典1980迷宫追逐。射击机器人，躲避邪恶奥托，逃出生天！',
        cls: BerzerkGame,
        canvasSize: { width: 480, height: 480 },
        controls: {
            keyboard: [
                { keys: ['←', '↑', '→', '↓'], action: 'Move', actionZh: '移动' },
                { keys: ['W', 'A', 'S', 'D'], action: 'Move', actionZh: '移动' },
                { keys: ['Space'], action: 'Shoot / Start', actionZh: '射击 / 开始' },
                { keys: ['R'], action: 'Restart', actionZh: '重新开始' },
            ],
            touch: [
                { icon: 'tap', action: 'Tap sides to move, center to shoot', actionZh: '点击边缘移动，中心射击' },
            ],
        },
    },
    {
        id: 'joust',
        name: 'Joust',
        nameZh: '角鹰骑士',
        desc: 'Classic 1982 arcade jousting. Flap to fly, strike enemies from above!',
        descZh: '经典1982街机骑士对战。飞翔突袭，从上方撞击敌人！',
        cls: JoustGame,
        canvasSize: { width: 480, height: 560 },
        controls: {
            keyboard: [
                { keys: ['←', '→'], action: 'Move left/right', actionZh: '左右移动' },
                { keys: ['A', 'D'], action: 'Move left/right', actionZh: '左右移动' },
                { keys: ['Space', '↑', 'W'], action: 'Flap / Start', actionZh: '飞翔 / 开始' },
            ],
            touch: [
                { icon: 'tap', action: 'Tap to flap and start', actionZh: '点击飞翔 / 开始' },
                { icon: 'swipe-left', action: 'Swipe left', actionZh: '向左滑' },
                { icon: 'swipe-right', action: 'Swipe right', actionZh: '向右滑' },
            ],
        },
    },
    {
        id: 'mahjong',
        name: 'Mahjong',
        nameZh: '麻将连连看',
        desc: 'Match free tiles and clear the board before time runs out.',
        descZh: '点击相同麻将牌消除，在时间耗尽前清空牌阵。',
        cls: MahjongGame,
        canvasSize: { width: 400, height: 500 },
        controls: {
            keyboard: [
                { keys: ['Space'], action: 'Restart', actionZh: '重新开始' },
            ],
            touch: [
                { icon: 'tap', action: 'Tap tile to select / match', actionZh: '点击选牌 / 配对' },
            ],
        },
    },
];
let currentGameName = null;
let currentGameInstance = null;
let isRunning = false;
function renderTouchIcon(icon) {
    const icons = {
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
    const btn = document.getElementById('actionBtn');
    if (!btn)
        return;
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    if (!currentGameInstance) {
        btn.textContent = zh ? '选择游戏' : 'Select a game';
        btn.disabled = true;
        return;
    }
    btn.disabled = false;
    if (!isRunning) {
        btn.textContent = zh ? '开始游戏' : 'Start Game';
    }
    else {
        btn.textContent = zh ? '重新开始' : 'Restart';
    }
}
function updateGameTitle() {
    const titleEl = document.getElementById('gameTitle');
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    const meta = GAMES.find((g) => g.id === currentGameName);
    if (titleEl)
        titleEl.textContent = meta ? (zh ? meta.nameZh : meta.name) : '';
}
function updateVirtualKeyboardHighlight(pressedSet) {
    document.querySelectorAll('.vkey').forEach((el) => {
        const k = el.getAttribute('data-key') || '';
        el.classList.toggle('pressed', pressedSet.has(k));
    });
}
function renderVirtualKeyboard(activeKeys, panelKeys) {
    const enabledKeys = new Set(activeKeys);
    const mk = (label, key, enabled, classes = '', hint = '') => {
        const normalizedKey = normalizeKey(key);
        const dataAttr = enabled ? ` data-key="${normalizedKey}"` : '';
        const cls = `${classes} ${enabled ? '' : ' inactive'}`;
        return `<div class="vkey ${cls}"${dataAttr}>${label}${hint && enabled ? `<span class="vkey-hint">${hint}</span>` : ''}</div>`;
    };
    if (panelKeys?.length) {
        return `
      <div class="vkeyboard vkeyboard-compact" id="vkeyboard">
        <div class="vkeyboard-row">
          ${panelKeys.map((key) => mk(key.label, key.key, true, key.classes || '', key.hint || '')).join('')}
        </div>
      </div>
    `;
    }
    const isActive = (key) => enabledKeys.has(normalizeKey(key));
    return `
    <div class="vkeyboard" id="vkeyboard">
      <div class="vkeyboard-row">
        ${mk('Esc', 'Escape', isActive('Escape'), 'wide-1')}
        <div class="vkey inactive"></div>
        ${mk('←', 'ArrowLeft', isActive('ArrowLeft'), '', 'M')}
        ${mk('↑', 'ArrowUp', isActive('ArrowUp'), '', 'M')}
        ${mk('↓', 'ArrowDown', isActive('ArrowDown'), '', 'M')}
        ${mk('→', 'ArrowRight', isActive('ArrowRight'), '', 'M')}
        <div class="vkey inactive"></div>
        ${mk('Space', 'Space', isActive(' '), 'grow', 'RST')}
      </div>
      <div class="vkeyboard-row">
        ${mk('Q', 'q', isActive('q'))} ${mk('W', 'w', isActive('w'), '', 'M')} ${mk('E', 'e', isActive('e'))} ${mk('R', 'r', isActive('r'))} ${mk('T', 't', isActive('t'))} ${mk('Y', 'y', isActive('y'))} ${mk('U', 'u', isActive('u'))} ${mk('I', 'i', isActive('i'))} ${mk('O', 'o', isActive('o'))} ${mk('P', 'p', isActive('p'))}
      </div>
      <div class="vkeyboard-row">
        ${mk('A', 'a', isActive('a'), '', 'M')} ${mk('S', 's', isActive('s'), '', 'M')} ${mk('D', 'd', isActive('d'), '', 'M')} ${mk('F', 'f', isActive('f'))} ${mk('G', 'g', isActive('g'))} ${mk('H', 'h', isActive('h'))} ${mk('J', 'j', isActive('j'))} ${mk('K', 'k', isActive('k'))} ${mk('L', 'l', isActive('l'))}
      </div>
      <div class="vkeyboard-row">
        ${mk('Z', 'z', isActive('z'), '', 'CCW')} ${mk('X', 'x', isActive('x'), '', 'CW')} ${mk('C', 'c', isActive('c'))} ${mk('V', 'v', isActive('v'))} ${mk('B', 'b', isActive('b'))} ${mk('N', 'n', isActive('n'))} ${mk('M', 'm', isActive('m'))}
      </div>
    </div>
  `;
}
function renderRecords() {
    const records = JSON.parse(localStorage.getItem('cg-records') || '{}');
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    let html = `<div class="records-section"><div class="records-title">${zh ? '最高记录' : 'High Scores'}</div>`;
    let hasAny = false;
    for (const g of GAMES) {
        const score = records[g.id];
        if (score != null) {
            hasAny = true;
            html += `<div class="records-row"><span>${zh ? g.nameZh : g.name}</span><span>${score}</span></div>`;
        }
    }
    if (!hasAny) {
        html += `<div style="font-size:0.8rem;color:var(--text-secondary);padding:6px 0">${zh ? '暂无记录' : 'No records yet'}</div>`;
    }
    html += '</div>';
    return html;
}
function renderSidebarRecords() {
    const container = document.getElementById('sidebarRecords');
    if (!container)
        return;
    const records = JSON.parse(localStorage.getItem('cg-records') || '{}');
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    let html = `<div class="sidebar-section-title">${zh ? '最高记录' : 'High Scores'}</div>`;
    let hasAny = false;
    for (const g of GAMES) {
        const score = records[g.id];
        if (score != null) {
            hasAny = true;
            html += `<div class="sidebar-record-row"><span>${zh ? g.nameZh : g.name}</span><span>${score}</span></div>`;
        }
    }
    if (!hasAny) {
        html += `<div style="font-size:0.8rem;color:var(--text-secondary);padding:4px 0">${zh ? '暂无记录' : 'No records yet'}</div>`;
    }
    container.innerHTML = html;
}
function renderControls() {
    const container = document.getElementById('controlsPanel');
    if (!container)
        return;
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    const meta = GAMES.find((g) => g.id === currentGameName);
    if (!meta) {
        container.innerHTML = `<div class="empty-state">${zh ? '选择游戏查看操作说明' : 'Select a game to see controls'}</div>`;
        return;
    }
    const activeKeys = meta.controls.keyboard?.flatMap((k) => k.keys.map(normalizeKey)) || [];
    let html = '';
    if (meta.controls.keyboard && meta.controls.keyboard.length) {
        html += '<div class="control-section">';
        html += `<div class="control-section-title">${zh ? '键盘' : 'Keyboard'}</div>`;
        for (const row of meta.controls.keyboard) {
            const keysHtml = row.keys.map((k) => `<span class="keycap">${k}</span>`).join('');
            html += `<div class="control-row"><div class="control-keys">${keysHtml}</div><div class="control-label">${zh ? row.actionZh : row.action}</div></div>`;
        }
        html += renderVirtualKeyboard(activeKeys, meta.controls.keyboardPanel);
        html += '</div>';
    }
    if (meta.controls.touch && meta.controls.touch.length) {
        html += '<div class="control-section">';
        html += `<div class="control-section-title">${zh ? '触摸' : 'Touch'}</div>`;
        for (const row of meta.controls.touch) {
            html += `<div class="control-row"><div class="control-icon">${renderTouchIcon(row.icon)}</div><div class="control-label">${zh ? row.actionZh : row.action}</div></div>`;
        }
        html += '</div>';
    }
    container.innerHTML = html || `<div class="empty-state">${zh ? '无操作说明' : 'No controls'}</div>`;
    bindVirtualKeyboard();
}
function normalizeKey(label) {
    const map = {
        '←': 'ArrowLeft',
        '↑': 'ArrowUp',
        '→': 'ArrowRight',
        '↓': 'ArrowDown',
        'Space': ' ',
    };
    if (map[label])
        return map[label];
    return label.length === 1 ? label.toLowerCase() : label;
}
function getKeysFromEvent(e) {
    const keys = [e.key];
    if (e.code === 'Space')
        keys.push(' ');
    if (e.key.length === 1)
        keys.push(e.key.toLowerCase());
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
function saveRecord(gameId, score) {
    const records = JSON.parse(localStorage.getItem('cg-records') || '{}');
    if (records[gameId] == null || score > records[gameId]) {
        records[gameId] = score;
        localStorage.setItem('cg-records', JSON.stringify(records));
        renderControls();
        renderSidebarRecords();
    }
}
window.saveRecord = saveRecord;
window.reportScore = (score) => {
    if (!currentGameName)
        return;
    saveRecord(currentGameName, score);
};
function bindVirtualKeyboard() {
    const vk = document.getElementById('vkeyboard');
    if (!vk)
        return;
    let activeVirtualKey = null;
    const releaseKey = () => {
        if (!activeVirtualKey)
            return;
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
        const target = e.target.closest('.vkey[data-key]');
        const key = target?.getAttribute('data-key');
        if (!key)
            return;
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
        const target = e.target.closest('.vkey[data-key]');
        const key = target?.getAttribute('data-key');
        if (!key)
            return;
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
export function prepareGame(name) {
    const meta = GAMES.find((g) => g.id === name);
    if (!meta)
        return;
    if (currentGameInstance) {
        if (currentGameInstance.destroy) {
            currentGameInstance.destroy();
        }
        else {
            currentGameInstance.stop?.();
        }
        currentGameInstance = null;
    }
    isRunning = false;
    currentGameName = name;
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    if (ctx)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = meta.canvasSize.width;
    canvas.height = meta.canvasSize.height;
    currentGameInstance = new meta.cls();
    // Draw initial frame so canvas isn't blank
    try {
        currentGameInstance.init?.();
        const ctx2 = canvas.getContext('2d');
        if (ctx2 && currentGameInstance.draw) {
            currentGameInstance.draw(ctx2);
        }
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
    }
    updateActionButton();
    updateGameTitle();
    renderControls();
    renderSidebarRecords();
    document.querySelectorAll('.game-list-item').forEach((el) => {
        el.classList.toggle('active', el.getAttribute('data-id') === name);
    });
}
function startPreparedGame() {
    if (!currentGameInstance)
        return;
    try {
        currentGameInstance.stop?.();
        currentGameInstance.start();
        isRunning = true;
        updateActionButton();
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
    }
}
export function loadGame(name) {
    prepareGame(name);
    startPreparedGame();
}
function renderGameList(filter = '') {
    const list = document.getElementById('gameList');
    if (!list)
        return;
    const zh = document.documentElement.getAttribute('data-lang') === 'zh';
    const term = filter.trim().toLowerCase();
    const filtered = GAMES.filter((g) => {
        if (!term)
            return true;
        return (g.name.toLowerCase().includes(term) ||
            g.nameZh.includes(term) ||
            g.desc.toLowerCase().includes(term) ||
            g.descZh.includes(term));
    });
    list.innerHTML = filtered
        .map((g) => `
      <button class="game-list-item ${g.id === currentGameName ? 'active' : ''}" data-id="${g.id}">
        <div class="game-list-name">${zh ? g.nameZh : g.name}</div>
        <div class="game-list-desc">${zh ? g.descZh : g.desc}</div>
      </button>
    `)
        .join('');
    list.querySelectorAll('.game-list-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            prepareGame(id);
        });
    });
}
function setLang(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    localStorage.setItem('cg-lang', lang);
    updateActionButton();
    updateGameTitle();
    renderControls();
    renderSidebarRecords();
    renderGameList(document.getElementById('searchInput')?.value || '');
    document.querySelectorAll('.lang-btn').forEach((b) => {
        const target = b.getAttribute('data-lang');
        b.classList.toggle('active', target === lang);
    });
}
function setTheme(mode) {
    const root = document.documentElement;
    if (mode === 'light' || mode === 'dark') {
        root.setAttribute('data-theme', mode);
    }
    else {
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
const pressedKeys = new Set();
window.addEventListener('keydown', (e) => {
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
// Init UI
(function init() {
    const savedLang = localStorage.getItem('cg-lang') || 'zh';
    const savedTheme = localStorage.getItem('cg-theme') || 'system';
    setLang(savedLang);
    setTheme(savedTheme);
    renderSidebarRecords();
    renderGameList();
    const search = document.getElementById('searchInput');
    if (search) {
        search.addEventListener('input', () => renderGameList(search.value));
    }
    const actionBtn = document.getElementById('actionBtn');
    if (actionBtn) {
        actionBtn.addEventListener('click', startPreparedGame);
    }
    if (GAMES.length) {
        prepareGame(GAMES[0].id);
    }
})();
//# sourceMappingURL=main.js.map