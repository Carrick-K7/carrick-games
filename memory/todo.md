# TODO

## 架构 & 代码质量审视

- [ ] `src/main.ts` 过长 (878行→868行)，拆分为多个模块
  - 键盘虚拟化、控制渲染、stats 面板、游戏生命周期 各自独立模块
- [ ] `src/core/game.ts` BaseGame 审视: 生命周期 (init/start/stop/update/draw) 一致性, 各子类是否符合
- [ ] `catalog.ts` 27 款游戏的启动机制、动态加载、错误边界
- [ ] 侧栏面板渲染逻辑集中化，消去 parking 特判分支 (main.ts:392-403)
- [ ] 各游戏 draw 调用 `this.isDarkTheme()` / `this.isZhLang()` 一致性
- [ ] 触摸/鼠标/键盘事件处理流的统一抽象
- [ ] CSS 孤儿规则清理 (index.html: .controls-panel 及其子选择器, .sidebar-section, .records-section, .empty-state, .game-record, .vkey.spacer 等)
- [ ] `index.html` CSS 长度 (1519行) — 按模块拆分
- [ ] 测试覆盖面：是否有游戏缺乏独有机制测试
