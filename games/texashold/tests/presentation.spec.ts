import { test, expect, type Page } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';

async function fixture(page: Page, zh = true, dark = true) {
  await page.route('**/poker-fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}#gameApp{position:fixed;inset:0;overflow:hidden}canvas{position:absolute}</style></head><body><div id="gameApp"><canvas id="gameCanvas"></canvas></div></body></html>` }));
  await page.goto('/poker-fixture');
  await page.evaluate(async ({ url, zh, dark }) => {
    const { TexasHoldGame } = await import(url);
    const w = window as any;
    w.scores = [];
    document.documentElement.dataset.lang = zh ? 'zh' : 'en';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const game = new TexasHoldGame({
      canvas: document.querySelector('canvas'), logicalWidth: 440, logicalHeight: 520,
      isDarkTheme: () => document.documentElement.dataset.theme === 'dark',
      isZhLang: () => document.documentElement.dataset.lang === 'zh', isPixelMode: () => false,
      getRecord: () => null, reportScore: (score: number) => w.scores.push(score), requestShellRender() {},
    });
    w.poker = game;
    game.init();
    game.setViewport({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    game.currentPlayerIndex = 0;
    game.pendingSystemAction = null;
    game.community = [{ rank: 14, suit: 3 }, { rank: 10, suit: 1 }, { rank: 7, suit: 2 }];
    game.stage = 'flop';
    game.players[0].hole = [{ rank: 14, suit: 0 }, { rank: 13, suit: 3 }];
    game.renderFrame();
    // Bind real keyboard/canvas handlers without a nondeterministic AI frame loop.
    game.bindInput();
  }, { url: gameModuleUrl('texashold'), zh, dark });
}

const button = (page: Page, id: string) => page.locator(`[data-texashold-actions] button[data-action="${id}"]`);

for (const view of [
  { width: 1440, height: 900, zh: true, dark: true },
  { width: 390, height: 844, zh: true, dark: false },
  { width: 320, height: 568, zh: false, dark: true },
  { width: 320, height: 480, zh: false, dark: false },
  { width: 568, height: 320, zh: false, dark: true },
  { width: 480, height: 320, zh: true, dark: false },
  { width: 844, height: 390, zh: false, dark: false },
  { width: 640, height: 320, zh: true, dark: true },
]) {
  test(`readable native actions at ${view.width}x${view.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(view);
    await fixture(page, view.zh, view.dark);
    const boxes = await page.locator('[data-texashold-actions] button:visible').evaluateAll(nodes => nodes.map(node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    }));
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(64);
      expect(box.x + box.width).toBeLessThanOrEqual(view.width);
      expect(box.y + box.height).toBeLessThanOrEqual(view.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(view.width);
    await page.screenshot({ path: testInfo.outputPath('table.png') });
    await button(page, 'call').click();
    const state = await page.evaluate(() => (window as any).poker.getDiagnostics());
    expect(state.chips[0]).toBe(180);
    expect(state.pot).toBe(50);
    expect(state.currentPlayer).not.toBe(0);
  });
}

test('keyboard, disabled raises and cancelled touches do not double-act', async ({ page }) => {
  await fixture(page);
  await button(page, 'raise').focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).poker.players[0].bet)).toBe(40);
  await expect(button(page, 'raise')).toBeDisabled();
  await page.evaluate(() => {
    const g = (window as any).poker;
    g.currentPlayerIndex = 0; g.pendingSystemAction = null;
    g.players[0].chips = 5;
    g.currentBet = 80;
    g.renderFrame();
  });
  await expect(button(page, 'raise')).toBeDisabled();
  await expect(button(page, 'call')).toHaveText('跟注 5');
  await button(page, 'call').dispatchEvent('pointerdown', { pointerType: 'touch' });
  await button(page, 'call').dispatchEvent('pointercancel', { pointerType: 'touch' });
  expect(await page.evaluate(() => (window as any).poker.players[0].chips)).toBe(5);
  await button(page, 'call').focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => (window as any).poker.players[0].chips)).toBe(0);
});

test('touch targets fire once and keyboard focus remains visible', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    await fixture(page);
    await page.evaluate(() => {
      const g = (window as any).poker;
      g.actionCount = 0;
      const perform = g.performPlayerAction.bind(g);
      g.performPlayerAction = (...args: any[]) => { g.actionCount++; return perform(...args); };
    });
    await page.keyboard.press('Tab');
    await expect(button(page, 'fold')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button(page, 'call')).toBeFocused();
    expect(await button(page, 'call').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
    await button(page, 'call').tap();
    expect(await page.evaluate(() => (window as any).poker.actionCount)).toBe(1);
  } finally { await context.close(); }
});

test('all-in, fold, check and shortcuts keep the original betting rules', async ({ page }) => {
  for (const action of ['all-in', 'fold', 'call', 'raise'] as const) {
    await fixture(page);
    await page.evaluate(() => {
      const g = (window as any).poker;
      g.currentBet = 0;
      g.players.forEach((p: any) => { p.bet = 0; p.committed = 0; p.chips = 200; });
      g.renderFrame();
    });
    if (action === 'call') await expect(button(page, action)).toHaveText('过牌');
    await page.keyboard.press({ 'all-in': 'a', fold: 'f', call: 'c', raise: 'r' }[action]);
    const player = await page.evaluate(() => (window as any).poker.players[0]);
    expect(player.chips).toBe(action === 'all-in' ? 0 : action === 'raise' ? 180 : 200);
    expect(player.folded).toBe(action === 'fold');
    expect(player.allIn).toBe(action === 'all-in');
  }
});

test('all-in action amounts survive later streets in both languages', async ({ page }) => {
  for (const shortCall of [false, true]) {
    await fixture(page);
    const result = await page.evaluate(shortCall => {
      const g = (window as any).poker;
      const player = g.players[0];
      if (shortCall) { player.chips = 5; g.currentBet = 80; }
      g.handleHumanAction(shortCall ? 'call' : 'all-in');
      const before = [g.playerStatus(player, false), g.playerStatus(player, true)];
      g.advanceStreet();
      g.renderFrame();
      return { before, after: [g.playerStatus(player, false), g.playerStatus(player, true)], bet: player.bet, allIn: player.allIn };
    }, shortCall);
    expect(result.bet).toBe(0);
    expect(result.allIn).toBe(true);
    expect(result.before).toEqual(shortCall ? ['Call all-in 5', '跟注全下 5'] : ['All-in 200', '全下 200']);
    expect(result.after).toEqual(result.before);
  }
});

test('pause, resize, theme/language and teardown preserve the live hand', async ({ page }) => {
  await fixture(page);
  const before = await page.evaluate(() => {
    const g = (window as any).poker;
    g.setPresentationPaused(true);
    return JSON.stringify({ players: g.players, community: g.community });
  });
  await expect(page.locator('[data-texashold-actions]')).toBeHidden();
  await page.keyboard.press('a');
  await page.setViewportSize({ width: 667, height: 375 });
  const after = await page.evaluate(() => {
    const g = (window as any).poker;
    document.documentElement.dataset.lang = 'en';
    document.documentElement.dataset.theme = 'light';
    g.setViewport({ width: innerWidth, height: innerHeight, dpr: 2, safeArea: { top: 0, left: 44, right: 44, bottom: 21 } });
    g.setPresentationPaused(false);
    return JSON.stringify({ players: g.players, community: g.community });
  });
  expect(after).toBe(before);
  await expect(button(page, 'call')).toHaveText('Call 20');
  const rect = await button(page, 'all-in').boundingBox();
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(667 - 44);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(375 - 21);
  await page.evaluate(() => (window as any).poker.destroy());
  await expect(page.locator('[data-texashold-actions]')).toHaveCount(0);
});

test('showdown stays visible; next hand and terminal restart remain single actions', async ({ page }, testInfo) => {
  await fixture(page);
  await page.evaluate(() => {
    const g = (window as any).poker;
    g.community = [{ rank: 14, suit: 3 }, { rank: 10, suit: 1 }, { rank: 7, suit: 2 }, { rank: 3, suit: 0 }, { rank: 2, suit: 1 }];
    g.players.forEach((p: any, i: number) => {
      p.hole = i === 0 ? [{ rank: 14, suit: 0 }, { rank: 13, suit: 3 }] : [{ rank: 8 - i, suit: 3 }, { rank: 11 - i, suit: 0 }];
      p.chips = 160; p.committed = 40; p.bet = 40;
    });
    g.resolveShowdown();
    g.renderFrame();
  });
  await expect(button(page, 'next')).toHaveText('下一局');
  await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-result');
  expect(await page.evaluate(() => (window as any).poker.players.reduce((sum: number, p: any) => sum + p.chips, 0))).toBe(800);
  await page.screenshot({ path: testInfo.outputPath('showdown.png') });
  await button(page, 'next').focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).poker.completedHands)).toBe(1);
  expect(await page.evaluate(() => (window as any).poker.state)).toBe('playing');
  await page.evaluate(() => {
    const g = (window as any).poker;
    g.completedHands = 10;
    g.finishTournament(); g.finishTournament(); g.renderFrame();
  });
  expect(await page.evaluate(() => (window as any).scores.length)).toBe(1);
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-result', 'success');
  await button(page, 'next').click();
  expect(await page.evaluate(() => (window as any).poker.completedHands)).toBe(0);
  await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-game-result');
});

test('real betting state cover capture', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 640, height: 400 });
  await fixture(page);
  const state = await page.evaluate(() => {
    const g = (window as any).poker;
    // Drive real shuffled hands through existing rules, never compose an invented board.
    let seed = 71;
    const random = Math.random;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    try {
      g.init();
      for (let step = 0; step < 2000; step++) {
        if (g.stage === 'flop' && g.isHumanTurn()) break;
        if (g.state === 'gameOver') g.init();
        else if (g.state === 'betweenHands') g.startNewHand();
        else if (g.isHumanTurn()) g.handleHumanAction('call');
        else g.update(0.1);
      }
      g.particles.clear(); g.floats.clear();
      g.renderFrame();
      return g.getDiagnostics();
    } finally { Math.random = random; }
  });
  expect(state.stage).toBe('flop');
  expect(state.communityCount).toBe(3);
  expect(state.currentPlayer).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('cover.png') });
});

test('long English showdown labels stay within narrow seats', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await fixture(page, false, false);
  const texts = await page.evaluate(() => {
    const g = (window as any).poker;
    g.state = 'betweenHands';
    g.players.forEach((p: any, i: number) => {
      p.wonThisHand = 200; p.chips = 800;
      g.showdownHands.set(i, { label: 'Three of a Kind', labelZh: '三条' });
    });
    const ctx = document.querySelector('canvas')!.getContext('2d')!;
    const original = ctx.fillText;
    const records: { text: string; x: number; width: number; align: string }[] = [];
    ctx.fillText = function(text, x, y, ...rest) {
      records.push({ text, x, width: this.measureText(text).width, align: this.textAlign });
      original.call(this, text, x, y, ...rest);
    };
    g.renderFrame();
    ctx.fillText = original;
    return records.filter(r => r.text.includes('Three of a Kind') || r.text.includes('+200'));
  });
  expect(texts).toHaveLength(8);
  for (const t of texts) {
    const left = t.align === 'center' ? t.x - t.width / 2 : t.x;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + t.width).toBeLessThanOrEqual(320);
    if (t.align === 'center') expect(t.width).toBeLessThan(90);
  }
  await page.screenshot({ path: testInfo.outputPath('small-showdown.png') });
});

test('live shell overlays pause and hide actions without replacing the instance', async ({ page }) => {
  await page.goto('/#/texashold');
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'true');
  await expect(page.locator('[data-texashold-actions]')).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.locator('[data-texashold-actions]')).toBeHidden();
  const info = () => page.evaluate(() => (window as any).__GAME_VIEWPORT_DEBUG__.info());
  const before = await info();
  await page.waitForTimeout(800);
  expect((await info()).chips).toEqual(before.chips);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-texashold-actions]')).toBeVisible();
});
