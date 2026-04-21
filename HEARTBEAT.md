# Carrick Games Auto-Development Pipeline

Schedule: **03:00, 09:00, 15:00, 21:00** (Asia/Shanghai) — one game per slot.

## Trigger Mechanism
- **OpenClaw cron job** `carrick-games:auto-dev` targets `linus` in an isolated session.
- No longer relies on heartbeat timing.

## Action on Trigger
1. Check `carrick-games` repo for last game commit time.
2. Pick next idea from queue (see below).
3. **Use kimi CLI via linus:games tmux session**
   - **Session**: `linus:games` (linus group, window 1)
   - Working directory: `/home/ubuntu/projects/carrick-games`
   - **Session reuse**: Read last session ID from `.kimi_session` file if it exists, use `kimi -r <session-id>` to continue context; if stale/conflicting, omit `-r` and start fresh.
   - Send the task via tmux:
     ```
     SESSION_FLAG=$(cat .kimi_session 2>/dev/null && echo "-r $(cat .kimi_session)" || echo "")
     tmux send-keys -t linus:games -l -- "cd /home/ubuntu/projects/carrick-games && kimi --work-dir /home/ubuntu/projects/carrick-games --print \$SESSION_FLAG -p '...game spec... && echo DONE: <GameName> && openclaw system event --text \"Done: <GameName>\" --mode now'" && tmux send-keys -t linus:games Enter
     ```
   - After kimi finishes: extract session ID from pane output (`To resume this session: kimi -r <id>`) and save to `.kimi_session`.
   - Monitor via: `tmux capture-pane -t linus:games -p | tail -20`
   - If the session produces no `src/games/<game>.ts` after 15 min: kill the pane and **fallback to Linus writing the game directly**.
   - Do NOT kill the cg-dev session after success — it persists for the next trigger.
4. Register the game in `src/main.ts` and add nav button to `index.html` (if needed).
5. **Run the testing checklist:**
   - [ ] Build passes (`npm run build`) — must be 0 errors
   - [ ] **Playwright e2e tests pass** (`npm run test:e2e`) — game loads, canvas renders, start/stop works, keyboard input doesn't crash
   - [ ] Unit logic (collision, bounds, scoring, state transitions)
   - [ ] Boundary coverage (start -> play -> game over -> restart)
   - [ ] Input coverage (keyboard + touch)
   - [ ] Playable: I must play a full round myself
   - [ ] Deployed and curl 200 on https://games.carrick7.com/
6. Commit with message: `feat(game): add <GameName>`
7. Push to `main`, sync to server (`rsync dist/ + index.html` to `/var/www/carrick7.com/games/`), log result to daily memory file.

## Game Queue
1. ~~Snake~~ ✅
2. ~~Breakout~~ ✅
3. ~~Tetris~~ ✅
4. ~~Pong~~ ✅
5. ~~Space Shooter~~ ✅
6. ~~Flappy Bird~~ ✅
7. ~~Pac-Man clone~~ ✅
8. ~~Asteroids~~ ✅
9. ~~Doodle Jump clone~~ ✅
10. ~~2048~~ ✅

## Next Batch (Ideas)
- Simon Says (记忆游戏) ✅
- Frogger (青蛙过河) ✅
- Missile Command (导弹指挥官) ✅
- Centipede (蜈蚣) ✅
- Donkey Kong clone (大金刚) ✅
- Bubble Shooter (泡泡龙) ✅
- Solitaire (纸牌) ✅
- Wordle clone ✅ (2026-04-19)
- Sudoku (数独) ✅ (2026-04-19)
- Chess (国际象棋) ✅ (2026-04-19)
- Stacker (堆叠方块) ✅ (2026-04-20)
- Berzerk (狂暴机器人) ✅ (2026-04-20)

## New Batch (2026-04-21)
- Mahjong (麻将) 🚀 next
- Texas Hold'em (德扑)
- Parking (停车小游戏)
- Pinball (弹珠台)
- Tower Defense (塔防)
