import { describe, expect, it } from 'vitest';
import { nextGridIndex, renderGameCard, type LibraryGame } from '../src/ui/catalog-presentation.js';
import { sameOriginImageUrl } from '../src/ui/html.js';

const game: LibraryGame = {
  id: 'example', name: 'A quiet game', nameZh: '安静的游戏', desc: 'A short, useful description.', descZh: '简短而有用的玩法介绍。',
  icon: `/games/example/1.0.0/${'a'.repeat(40)}/icon.svg`,
  controls: { keyboard: [{ keys: ['Space'], action: 'Play', actionZh: '开始' }], touch: [{ icon: 'tap', action: 'Play', actionZh: '开始' }] },
};

const cover = { src: `/games/example/1.0.0/${'a'.repeat(40)}/cover.webp`, width: 640, height: 400, focalPoint: { x: .3, y: .8 } };

describe('art-led catalog presentation', () => {
  it('renders one accessible play target with visible copy, artwork fallback and no secondary buttons', () => {
    const html = renderGameCard(game, null, false);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('A short, useful description.');
    expect(html).toContain('game-list-cover');
    expect(html).toContain('game-list-icon');
    expect(html).not.toContain('game-cover-image');
    expect(html).toContain('aria-label="A quiet game — Play"');
    expect(html).toContain('aria-describedby="game-description-example"');
    expect(html).toContain('id="game-description-example"');
  });
  it('reads canonical optional cover metadata and preserves a fallback underneath lazy imagery', () => {
    const html = renderGameCard({ ...game, cover }, null, false);
    expect(html).toContain(cover.src);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('object-position:30% 80%');
    expect(html).toContain('width="640"');
    expect(html).toContain('height="400"');
    expect(html).toContain('game-list-icon');
    expect(html).toContain('alt=""');
  });
  it('communicates continue for the current game and never disguises it as restart', () => {
    const html = renderGameCard(game, game.id, true);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('继续游戏');
    expect(html).toContain('正在玩');
    expect(html).not.toContain('重新开始');
  });
  it('escapes metadata in labels, descriptions and attributes', () => {
    const html = renderGameCard({ ...game, id: 'x" onclick="bad', name: '<img onerror=bad>', desc: '<script>bad</script>' }, null, false);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).toContain('data-id="x&quot; onclick=&quot;bad"');
  });
  it('rejects active/foreign/credentialled image URLs and gracefully falls back', () => {
    for (const src of ['javascript:alert(1)', 'data:image/svg+xml,bad', 'https://foreign.example/cover.webp', 'https://a:b@games.carrick7.com/image.png']) {
      const html = renderGameCard({ ...game, cover: { ...cover, src } }, null, false);
      expect(html).not.toContain('game-cover-image');
      expect(html).toContain('game-list-icon');
      expect(sameOriginImageUrl(src)).toBeNull();
    }
    expect(sameOriginImageUrl('/cover.webp', 'http://localhost:8086/#/snake')).toBe('http://localhost:8086/cover.webp');
  });
  it('uses release-owned icon URLs or a generic fallback, not a game-id artwork registry', () => {
    expect(renderGameCard(game, null, false)).toContain(game.icon);
    const fallback = renderGameCard({ ...game, icon: '' }, null, false);
    expect(fallback).toMatch(/class="game-list-icon"><svg/);
    expect(fallback).not.toContain('game-cover-image');
  });
});

describe('visual-grid keyboard navigation', () => {
  it('moves down a row rather than to the next column', () => {
    expect(nextGridIndex(0, 17, 4, 'ArrowDown')).toBe(4);
    expect(nextGridIndex(4, 17, 4, 'ArrowUp')).toBe(0);
    expect(nextGridIndex(0, 17, 2, 'ArrowRight')).toBe(1);
    expect(nextGridIndex(1, 17, 2, 'ArrowDown')).toBe(3);
  });
  it('handles search entry, boundaries, empty grids and Home/End', () => {
    expect(nextGridIndex(-1, 7, 3, 'ArrowDown')).toBe(0);
    expect(nextGridIndex(-1, 7, 3, 'ArrowUp')).toBe(6);
    expect(nextGridIndex(0, 7, 3, 'ArrowLeft')).toBe(0);
    expect(nextGridIndex(6, 7, 3, 'ArrowDown')).toBe(6);
    expect(nextGridIndex(2, 7, 3, 'End')).toBe(6);
    expect(nextGridIndex(2, 7, 3, 'Home')).toBe(0);
    expect(nextGridIndex(-1, 0, 3, 'ArrowDown')).toBe(-1);
  });
});
