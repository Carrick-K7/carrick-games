import { pressSequence } from '../../../tests/support/cover.mjs';
export async function prepare(page) {
  for (const offset of [-4, 4, -1, 2, -3, 4]) {
    await pressSequence(page, Array(Math.abs(offset)).fill(offset < 0 ? 'ArrowLeft' : 'ArrowRight'), 35);
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space'); await page.waitForTimeout(150);
  }
}
