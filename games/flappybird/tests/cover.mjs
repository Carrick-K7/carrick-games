export async function prepare(page) {
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(220); }
}
export const settleMs = 50;
