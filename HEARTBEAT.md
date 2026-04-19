# Carrick Games Auto-Development Pipeline

Schedule: **03:00, 09:00, 15:00, 21:00** (Asia/Shanghai) — one game per slot.

## Trigger Mechanism
- **OpenClaw cron job** `carrick-games:auto-dev` targets `linus` in an isolated session.
- No longer relies on heartbeat timing.

## Action on Trigger
1. Check `carrick-games` repo for last game commit time.
2. Pick next idea from queue (see below).
3. **Attempt OpenCode via tmux** (coding-agent + tmux skills)
   - Create a dedicated tmux session: `tmux new-session -d -s cg-opencode -c /home/ubuntu/projects/carrick-games`
   - Send the task: `tmux send-keys -t cg-opencode -l -- "opencode run -m kimi-for-coding/k2p5 '...game spec...'"` + `Enter`
   - Prompt 追加 wake trigger：`When completely finished, run: openclaw system event --text "Done: <GameName>" --mode now`
   - 通过 `tmux capture-pane -t cg-opencode -p | tail -20` 监控进度。
   - If the session is idle/stuck for >15 min or produces no `src/games/<game>.ts` after 10 min: kill the tmux session and **fallback to Linus writing the game directly**.
   - Clean up tmux session after success or fallback.
4. Register the game in `src/main.ts` and add nav button to `index.html` (if needed).
5. **Run the testing checklist:**
   - [ ] Unit logic (collision, bounds, scoring, state transitions)
   - [ ] Boundary coverage (start -> play -> game over -> restart)
   - [ ] Input coverage (keyboard + touch)
   - [ ] Playable: I must play a full round myself
   - [ ] Build passes (`npm run build`)
   - [ ] Deployed and curl 200 on https://cyber.carrick7.com/games/
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
- Chess (国际象棋)
