import { test, expect, type Page } from '@playwright/test';
import { gameModuleUrl } from '../../../tests/support/releases';

test.use({ hasTouch: true });

const action = (page: Page, id: string) => page.locator(`[data-texashold-actions] button[data-action="${id}"]`);

/** Isolated actual release, with no shell instance or running RAF to race assertions. */
async function fixture(page: Page, reduced = false) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.route('**/poker-refinement-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#gameApp{position:fixed;inset:0;overflow:hidden}canvas{position:absolute}</style></head><body><div id="gameApp"><canvas id="gameCanvas" tabindex="0"></canvas></div></body></html>',
  }));
  await page.goto('/poker-refinement-fixture');
  await page.evaluate(async url => {
    const { TexasHoldGame } = await import(url);
    const w = window as any;
    w.scores = [];
    document.documentElement.dataset.lang = 'en';
    document.documentElement.dataset.theme = 'dark';
    const g = new TexasHoldGame({
      canvas: document.querySelector('canvas'), logicalWidth: 440, logicalHeight: 520,
      isDarkTheme: () => document.documentElement.dataset.theme === 'dark',
      isZhLang: () => document.documentElement.dataset.lang === 'zh', isPixelMode: () => false,
      getRecord: () => null, reportScore: (score: number) => w.scores.push(score), requestShellRender() {},
    });
    w.poker = g;
    g.init();
    g.setViewport({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, safeArea: { top: 0, left: 0, right: 0, bottom: 0 } });
    const holes = [[{ rank: 14, suit: 0 }, { rank: 13, suit: 3 }], [{ rank: 12, suit: 1 }, { rank: 11, suit: 2 }], [{ rank: 10, suit: 3 }, { rank: 9, suit: 0 }], [{ rank: 8, suit: 2 }, { rank: 7, suit: 1 }]];
    g.players.forEach((p: any, i: number) => { p.hole = holes[i]; });
    const used = new Set(holes.flat().map(c => `${c.rank}:${c.suit}`));
    g.deck = g.createDeck().filter((c: any) => !used.has(`${c.rank}:${c.suit}`));
    g.currentPlayerIndex = 0;
    g.pendingSystemAction = null;
    g.pendingSystemDelay = 0;
    g.motion.settle();
    g.renderFrame();
    g.bindInput();
    w.stakes = 0;
    const perform = g.performPlayerAction.bind(g);
    g.performPlayerAction = (seat: number, requested: string) => {
      if (seat === 0) w.stakes++;
      return perform(seat, requested);
    };
    // Spy at the final real card renderer, not the higher-level visibility predicate.
    w.capturePokerCards = () => {
      const calls: any[] = [];
      const draw = g.drawCard;
      g.drawCard = function(...args: any[]) {
        const card = args[5];
        const seat = g.players.findIndex((p: any) => p.hole.includes(card));
        const matrix = args[0].getTransform();
        calls.push({ seat, rank: card.rank, suit: card.suit, faceUp: args[6], alpha: args[0].globalAlpha,
          transform: { a: matrix.a, d: matrix.d, e: matrix.e, f: matrix.f } });
        return draw.apply(this, args);
      };
      try { g.renderFrame(); } finally { g.drawCard = draw; }
      return calls;
    };
  }, gameModuleUrl('texashold'));
}

type Settlement = 'kicker' | 'split' | 'side' | 'refund';

/** Legal distinct cards; every player's initial 200 is split between stack and pot. */
async function settlement(page: Page, kind: Settlement = 'kicker') {
  await page.evaluate(kind => {
    const g = (window as any).poker;
    const pairBoard = [{ rank: 14, suit: 2 }, { rank: 14, suit: 1 }, { rank: 9, suit: 3 }, { rank: 7, suit: 0 }, { rank: 2, suit: 2 }];
    const sideBoard = [{ rank: 2, suit: 0 }, { rank: 7, suit: 1 }, { rank: 9, suit: 2 }, { rank: 11, suit: 3 }, { rank: 12, suit: 0 }];
    const splitBoard = [{ rank: 10, suit: 0 }, { rank: 11, suit: 1 }, { rank: 12, suit: 2 }, { rank: 13, suit: 3 }, { rank: 14, suit: 0 }];
    const pairHoles = [[{ rank: 13, suit: 3 }, { rank: 12, suit: 0 }], [{ rank: 13, suit: 0 }, { rank: 11, suit: 1 }], [{ rank: 12, suit: 2 }, { rank: 10, suit: 0 }], [{ rank: 8, suit: 1 }, { rank: 6, suit: 3 }]];
    const sideHoles = [14, 13, 10, 4].map(rank => [{ rank, suit: 0 }, { rank, suit: 1 }]);
    const splitHoles = [[{ rank: 2, suit: 3 }, { rank: 3, suit: 3 }], [{ rank: 4, suit: 0 }, { rank: 5, suit: 0 }], [{ rank: 6, suit: 1 }, { rank: 7, suit: 1 }], [{ rank: 8, suit: 2 }, { rank: 9, suit: 2 }]];
    const side = kind === 'side' || kind === 'refund';
    const holes = side ? sideHoles : kind === 'split' ? splitHoles : pairHoles;
    const committed = kind === 'side' ? [50, 100, 150, 150] : kind === 'refund' ? [50, 100, 150, 100] : kind === 'split' ? [5, 5, 5, 0] : [40, 40, 40, 40];
    g.community = side ? sideBoard : kind === 'split' ? splitBoard : pairBoard;
    const allCards = [...g.community, ...holes.flat()].map(c => `${c.rank}:${c.suit}`);
    if (new Set(allCards).size !== allCards.length) throw Error('Fixture must not contain duplicate cards');
    g.players.forEach((p: any, i: number) => {
      p.hole = holes[i]; p.chips = 200 - committed[i]; p.committed = committed[i]; p.bet = committed[i];
      p.folded = kind === 'split' ? i >= 2 : i === 3;
      p.out = false; p.allIn = false; p.acted = true; p.wonThisHand = 0; p.lastAction = null;
    });
    g.state = 'playing'; g.stage = 'river'; g.completedHands = 0; g.dealerIndex = 0;
    g.pendingAllIn = null; g.pendingSystemAction = null; g.pendingSystemDelay = 0;
    g.showdownHands.clear(); g.handPots = []; g.highlightedSeat = null;
    g.motion.reset(); g.particles.clear(); g.floats.clear();
    g.resolveShowdown();
    g.renderFrame();
  }, kind);
}

async function money(page: Page) {
  return page.evaluate(() => {
    const w = window as any, g = w.poker;
    return { chips: g.players[0].chips, committed: g.players[0].committed, pending: g.pendingAllIn !== null, stakes: w.stakes };
  });
}

test('folded opponent cards stay face-down throughout animation and settlement', async ({ page }) => {
  await fixture(page);
  const frames = await page.evaluate(() => {
    const w = window as any, g = w.poker;
    const before = w.capturePokerCards();
    g.performPlayerAction(1, 'fold');
    const start = w.capturePokerCards();
    g.motion.update(0.08);
    const middle = w.capturePokerCards();
    g.motion.settle();
    const settled = w.capturePokerCards();
    g.players[0].folded = true; g.players[2].folded = true;
    g.awardFoldWin(3);
    g.motion.settle();
    const between = w.capturePokerCards();
    return { before, start, middle, settled, between, diagnostics: g.getDiagnostics() };
  });
  for (const cards of [frames.before, frames.start, frames.middle, frames.settled, frames.between]) {
    const bot = cards.filter((c: any) => c.seat === 1);
    expect(bot).toHaveLength(2);
    expect(bot.every((c: any) => c.faceUp === false)).toBe(true);
  }
  expect(frames.diagnostics.state).toBe('betweenHands');
  expect(frames.between.filter((c: any) => c.seat === 3).every((c: any) => !c.faceUp)).toBe(true);
  expect(frames.diagnostics.highlightedCards).toEqual([]);
  expect(frames.diagnostics.visibleHoleSeats).not.toContain(3);
});

test('legitimate showdown reveals contenders only, and diagnostics never expose hidden card values', async ({ page }) => {
  await fixture(page);
  const playing = await page.evaluate(() => (window as any).poker.getDiagnostics());
  function cardObjects(value: any): any[] {
    if (!value || typeof value !== 'object') return [];
    const own = typeof value.rank === 'number' || typeof value.suit === 'number' ? [value] : [];
    return own.concat(Object.values(value).flatMap(cardObjects));
  }
  expect(cardObjects(playing)).toEqual([]);
  expect(playing.visibleHoleSeats).toEqual([0]);
  await settlement(page);
  const result = await page.evaluate(() => {
    const w = window as any, g = w.poker;
    g.motion.settle();
    return { calls: w.capturePokerCards(), diagnostics: g.getDiagnostics() };
  });
  for (const seat of [0, 1, 2]) {
    const cards = result.calls.filter((c: any) => c.seat === seat);
    expect(cards).toHaveLength(2);
    expect(cards.every((c: any) => c.faceUp)).toBe(true);
  }
  expect(result.calls.filter((c: any) => c.seat === 3).every((c: any) => !c.faceUp)).toBe(true);
  const publicCards = new Set(result.calls.filter((c: any) => c.faceUp).map((c: any) => `${c.rank}:${c.suit}`));
  for (const card of cardObjects(result.diagnostics)) expect(publicCards.has(`${card.rank}:${card.suit}`)).toBe(true);
});

test('native all-in requires a separate confirmation and stakes exactly once', async ({ page }, testInfo) => {
  await fixture(page);
  const before = await money(page);
  await action(page, 'all-in').click();
  expect(await money(page)).toEqual({ ...before, pending: true });
  await expect(action(page, 'all-in')).toContainText('Confirm');
  await expect(action(page, 'cancel')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('all-in-confirmation.png') });
  // Intentionally separate activation, rather than a browser second-click detail=2.
  await action(page, 'all-in').dispatchEvent('click', { detail: 1 });
  expect(await money(page)).toEqual({ chips: 0, committed: 200, pending: false, stakes: 1 });
  await action(page, 'all-in').dispatchEvent('click', { detail: 1 });
  expect((await money(page)).stakes).toBe(1);
});

for (const cancel of ['cancel', 'Escape', 'canvas', 'pause', 'blur', 'stale-bet'] as const) {
  test(`all-in confirmation cancels on ${cancel} without a stake`, async ({ page }) => {
    await fixture(page);
    await action(page, 'all-in').click();
    if (cancel === 'cancel') await action(page, 'cancel').click();
    else if (cancel === 'Escape') await page.keyboard.press('Escape');
    else if (cancel === 'canvas') await page.locator('canvas').click({ position: { x: 5, y: 100 } });
    else await page.evaluate(reason => {
      const g = (window as any).poker;
      if (reason === 'pause') g.setPresentationPaused(true);
      if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      if (reason === 'stale-bet') { g.currentBet += 20; g.update(0); g.renderFrame(); }
    }, cancel);
    expect(await money(page)).toEqual({ chips: 200, committed: 0, pending: false, stakes: 0 });
    if (cancel === 'pause') await expect(page.locator('[data-texashold-actions]')).toBeHidden();
  });
}

test('stale confirmation cannot place a stake even before the next frame', async ({ page }) => {
  await fixture(page);
  await action(page, 'all-in').click();
  await page.evaluate(() => { (window as any).poker.currentBet += 20; });
  await action(page, 'all-in').dispatchEvent('click', { detail: 1 });
  expect((await money(page)).chips).toBe(200);
  expect((await money(page)).stakes).toBe(0);
});

test('double-click and held Enter cannot arm then immediately confirm', async ({ page }) => {
  await fixture(page);
  await action(page, 'all-in').dblclick();
  expect(await money(page)).toEqual({ chips: 200, committed: 0, pending: true, stakes: 0 });
  await page.keyboard.press('Escape');
  await action(page, 'all-in').focus();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  expect(await money(page)).toEqual({ chips: 200, committed: 0, pending: true, stakes: 0 });
});

test('disabled keyboard raises cannot silently become all-in or call', async ({ page }) => {
  for (const chips of [30, 5]) {
    await fixture(page);
    await page.evaluate(chips => {
      const g = (window as any).poker;
      g.players[0].chips = chips; g.currentBet = 20; g.renderFrame();
    }, chips);
    await expect(action(page, 'raise')).toBeDisabled();
    await page.keyboard.press('r');
    await page.evaluate(() => (window as any).poker.handleHumanAction('raise'));
    expect(await money(page)).toEqual({ chips, committed: 0, pending: false, stakes: 0 });
  }
});

test('global A arms, repeated A is inert, and explicit Enter confirms once', async ({ page }) => {
  await fixture(page);
  await page.keyboard.press('a');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', repeat: true, bubbles: true })));
  await page.keyboard.press('a');
  expect(await money(page)).toEqual({ chips: 200, committed: 0, pending: true, stakes: 0 });
  await page.keyboard.press('Enter');
  expect(await money(page)).toEqual({ chips: 0, committed: 200, pending: false, stakes: 1 });
});

for (const view of [{ width: 320, height: 480 }, { width: 480, height: 320 }]) {
  test(`settlement disclosure is bounded and keyboard-scrollable at ${view.width}x${view.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(view);
    await fixture(page);
    await settlement(page, 'side');
    await page.evaluate(() => { const g = (window as any).poker; g.motion.settle(); g.renderFrame(); });
    await page.locator('canvas').click({ position: { x: 5, y: 100 } });
    await page.touchscreen.tap(5, 100);
    expect(await page.evaluate(() => (window as any).poker.completedHands)).toBe(1);
    expect(await page.evaluate(() => (window as any).poker.state)).toBe('betweenHands');
    const toggle = action(page, 'details');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('[data-texashold-details]');
    await expect(panel).toHaveAttribute('role', 'region');
    expect(await toggle.getAttribute('aria-controls')).toBe(await panel.getAttribute('id'));
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(64);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(view.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(view.height);
    // Crossing the canvas gap or releasing a mouse is not an outside click.
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height + 10);
    await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    await expect(panel).toBeVisible();
    await page.locator('canvas').click({ position: { x: 5, y: 100 } });
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => (window as any).poker.completedHands)).toBe(1);
    await toggle.click();
    for (const button of await page.locator('[data-texashold-actions] > button:visible').all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBe(48);
      expect(box!.width).toBeGreaterThanOrEqual(48);
      expect(box!.y + box!.height).toBeLessThanOrEqual(view.height);
    }
    const overflow = await panel.evaluate(el => el.scrollHeight > el.clientHeight);
    // Narrow portrait must exercise scrolling; landscape may fit all rows already.
    if (view.width === 320) expect(overflow).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('hand-details.png') });
    await panel.focus();
    await page.keyboard.press('Space');
    if (overflow) await expect.poll(() => panel.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (window as any).poker.completedHands)).toBe(1);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();
    await action(page, 'next').focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (window as any).poker.completedHands)).toBe(1);
    expect(await page.evaluate(() => (window as any).poker.state)).toBe('playing');
    await expect(panel).toBeHidden();
  });
}

for (const input of ['native-next', 'global-enter'] as const) {
  test(`${input} explicitly advances exactly one hand`, async ({ page }) => {
    await fixture(page);
    await settlement(page);
    await page.evaluate(() => {
      const w = window as any, g = w.poker;
      w.nextCalls = 0;
      const next = g.startNewHand.bind(g);
      g.startNewHand = () => { w.nextCalls++; return next(); };
    });
    if (input === 'native-next') await action(page, 'next').click();
    else { await page.locator('canvas').focus(); await page.keyboard.press('Enter'); }
    expect(await page.evaluate(() => (window as any).nextCalls)).toBe(1);
    expect(await page.evaluate(() => (window as any).poker.state)).toBe('playing');
  });
}

test('winner highlights five actually revealed cards, explains kicker, and reports net not gross', async ({ page }) => {
  await fixture(page);
  await settlement(page);
  const result = await page.evaluate(() => {
    const w = window as any, g = w.poker;
    g.motion.settle();
    return { diagnostics: g.getDiagnostics(), cards: w.capturePokerCards(), hand: g.showdownHands.get(0),
      details: g.resultDetails(false), zh: g.resultDetails(true), pots: g.handPots,
      returned: g.players[0].wonThisHand, committed: g.players[0].committed };
  });
  expect(result.diagnostics.highlightedSeat).toBe(0);
  expect(result.hand.bestFive).toHaveLength(5);
  expect(new Set(result.hand.bestFive.map((c: any) => `${c.rank}:${c.suit}`)).size).toBe(5);
  expect(result.diagnostics.highlightedCards).toEqual(result.hand.bestFive);
  const visible = new Set(result.cards.filter((c: any) => c.faceUp).map((c: any) => `${c.rank}:${c.suit}`));
  for (const c of result.hand.bestFive) expect(visible.has(`${c.rank}:${c.suit}`)).toBe(true);
  expect(result.pots[0].explanation.en).toMatch(/Kicker 2: Q beats J/);
  expect(result.pots[0].explanation.zh).toContain('踢脚牌');
  expect(result.returned).toBe(160);
  expect(result.committed).toBe(40);
  expect(result.diagnostics.netReturns).toEqual([120, -40, -40, -40]);
  expect(result.details.body).toContain('You committed 40 · Returned 160 · Net +120');
  expect(result.zh.body).toContain('你的投入 40 · 收回 160 · 净收益 +120');
});

for (const kind of ['split', 'side', 'refund'] as const) {
  test(`${kind} pots conserve chips and duplicate showdown cannot pay twice`, async ({ page }) => {
    await fixture(page);
    await settlement(page, kind);
    const result = await page.evaluate(() => {
      const g = (window as any).poker;
      const before = { stacks: g.players.map((p: any) => p.chips), returns: g.players.map((p: any) => p.wonThisHand),
        committed: g.players.map((p: any) => p.committed), pots: structuredClone(g.handPots), completed: g.completedHands };
      g.resolveShowdown(); g.motion.update(2); g.renderFrame();
      const after = { stacks: g.players.map((p: any) => p.chips), returns: g.players.map((p: any) => p.wonThisHand),
        committed: g.players.map((p: any) => p.committed), pots: structuredClone(g.handPots), completed: g.completedHands };
      return { before, after };
    });
    expect(result.after).toEqual(result.before);
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    expect(sum(result.before.stacks)).toBe(800);
    expect(sum(result.before.returns)).toBe(sum(result.before.committed));
    expect(sum(result.before.pots.map((p: any) => p.amount))).toBe(sum(result.before.committed));
    for (const pot of result.before.pots) expect(sum(Object.values(pot.payouts) as number[])).toBe(pot.amount);
    if (kind === 'split') {
      expect(result.before.returns.slice(0, 2).sort((a: number, b: number) => a - b)).toEqual([7, 8]);
      expect(result.before.pots[0].winners.slice().sort()).toEqual([0, 1]);
      expect(result.before.pots[0].explanation.en).toContain('Tie');
    } else if (kind === 'side') {
      expect(result.before.returns).toEqual([200, 150, 100, 0]);
      expect(result.before.pots.map((p: any) => p.winners)).toEqual([[0], [1], [2]]);
    } else {
      expect(result.before.returns).toEqual([200, 150, 50, 0]);
      expect(result.before.pots[2].refund).toBe(true);
      expect(result.before.pots[2].explanation.en).toContain('Uncalled');
    }
  });
}

test('folded blind contributions do not invent a side pot', async ({ page }) => {
  await fixture(page);
  await settlement(page);
  const result = await page.evaluate(() => {
    const g = (window as any).poker;
    const commits = [100, 100, 20, 0];
    g.players.forEach((p: any, i: number) => {
      p.chips = 200 - commits[i]; p.committed = commits[i]; p.bet = commits[i];
      p.folded = i >= 2; p.out = false; p.allIn = false; p.wonThisHand = 0; p.lastAction = null;
    });
    g.state = 'playing'; g.stage = 'river'; g.completedHands = 0; g.motion.reset();
    g.resolveShowdown();
    return { pots: g.handPots, stacks: g.players.map((p: any) => p.chips), status: g.status(false), details: g.resultDetails(false) };
  });
  expect(result.pots).toHaveLength(1);
  expect(result.pots[0].amount).toBe(220);
  expect(result.pots[0].eligible).toEqual([0, 1]);
  expect(result.pots[0].payouts).toEqual({ 0: 220 });
  expect(result.stacks).toEqual([320, 100, 180, 200]);
  expect(result.status).not.toMatch(/Multiple pots|Split pot/);
  expect(result.details.body).toContain('Main pot 220');
  expect(result.details.body).not.toContain('Side pot');
});

test('real card motion changes rendered transforms and pixels, freezes on pause, and survives resize', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(() => {
    const w = window as any, g = w.poker;
    const canvas = document.querySelector('canvas')!;
    g.motion.deal('hole:0:0');
    const start = w.capturePokerCards();
    const firstPixels = canvas.toDataURL();
    g.update(0.06);
    const middle = w.capturePokerCards();
    const middlePixels = canvas.toDataURL();
    g.setPresentationPaused(true);
    const before = { time: g.motion.time, progress: g.motion.card('hole:0:0'), chips: g.players.map((p: any) => p.chips), cards: JSON.stringify(g.players.map((p: any) => p.hole)) };
    g.update(0.5);
    g.setViewport({ width: 480, height: 320, dpr: 2, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    const paused = { time: g.motion.time, progress: g.motion.card('hole:0:0'), chips: g.players.map((p: any) => p.chips), cards: JSON.stringify(g.players.map((p: any) => p.hole)) };
    g.setPresentationPaused(false); g.update(0.2);
    const end = w.capturePokerCards();
    return { start, middle, end, firstPixels, middlePixels, before, paused, progress: g.motion.card('hole:0:0') };
  });
  const human = (cards: any[]) => cards.find(c => c.seat === 0 && c.rank === 14);
  expect(human(result.start).transform.f).not.toBe(human(result.middle).transform.f);
  expect(result.firstPixels).not.toBe(result.middlePixels);
  expect(result.paused).toEqual(result.before);
  expect(result.progress).toBe(1);
  expect(human(result.end).alpha).toBe(1);
});

test('chip flights visibly move without changing the settled accounting', async ({ page }) => {
  await fixture(page);
  await settlement(page);
  const result = await page.evaluate(() => {
    const g = (window as any).poker;
    const ctx = document.querySelector('canvas')!.getContext('2d')!;
    const ellipse = ctx.ellipse;
    const capture = () => {
      const calls: number[][] = [];
      ctx.ellipse = function(...args: Parameters<CanvasRenderingContext2D['ellipse']>) { calls.push(args.slice(0, 4)); return ellipse.apply(this, args); };
      try { g.renderFrame(); } finally { ctx.ellipse = ellipse; }
      return calls.filter(c => c[2] === 5 && c[3] === 3);
    };
    const stacks = g.players.map((p: any) => p.chips);
    g.update(0.3); const first = capture();
    g.update(0.1); const second = capture();
    g.update(0.3); const end = capture();
    return { first, second, end, stacks, after: g.players.map((p: any) => p.chips) };
  });
  expect(result.first.length).toBeGreaterThan(0);
  expect(result.second.length).toBeGreaterThan(0);
  expect(result.first).not.toEqual(result.second);
  expect(result.end).toEqual([]);
  expect(result.after).toEqual(result.stacks);
});

test('reduced motion settles actual rendering with identical financial results', async ({ page }) => {
  await fixture(page);
  await settlement(page);
  const normal = await page.evaluate(() => (window as any).poker.players.map((p: any) => ({ chips: p.chips, committed: p.committed, returned: p.wonThisHand })));
  await fixture(page, true);
  await settlement(page);
  const reduced = await page.evaluate(() => {
    const w = window as any, g = w.poker;
    const calls = w.capturePokerCards();
    return { calls, motion: g.motion.diagnostics(), progress: g.motion.card('hole:0:0'),
      totals: g.players.map((p: any) => ({ chips: p.chips, committed: p.committed, returned: p.wonThisHand })) };
  });
  expect(reduced.totals).toEqual(normal);
  expect(reduced.motion.cards).toBe(0);
  expect(reduced.motion.chipFlights).toBe(0);
  expect(reduced.motion.reveal).toBe(1);
  expect(reduced.progress).toBe(1);
  for (const call of reduced.calls.filter((c: any) => c.seat >= 0 && c.seat < 3)) {
    expect(call.faceUp).toBe(true);
    expect(call.alpha).toBe(1);
    expect(call.transform.e).toBe(0);
    expect(call.transform.f).toBe(0);
  }
});

for (const reset of ['next', 'reset'] as const) {
  test(`${reset} cancels old payout flights without ghost winnings`, async ({ page }) => {
    await fixture(page);
    await settlement(page);
    const result = await page.evaluate(reset => {
      const g = (window as any).poker;
      const hadPayout = g.motion.chips.some((flight: any) => flight.kind === 'payout');
      if (reset === 'next') g.startNewHand(); else g.init();
      g.currentPlayerIndex = 0; g.pendingSystemAction = null;
      const before = { chips: g.players.map((p: any) => p.chips), pot: g.getPotSize() };
      const kinds = g.motion.chips.map((flight: any) => flight.kind);
      g.update(1); g.renderFrame();
      return { hadPayout, kinds, before, after: { chips: g.players.map((p: any) => p.chips), pot: g.getPotSize() },
        remaining: g.motion.chips, pots: g.handPots, highlightedSeat: g.highlightedSeat };
    }, reset);
    expect(result.hadPayout).toBe(true);
    expect(result.kinds).not.toContain('payout');
    expect(result.after).toEqual(result.before);
    expect(result.remaining).toEqual([]);
    expect(result.pots).toEqual([]);
    expect(result.highlightedSeat).toBeNull();
  });
}
