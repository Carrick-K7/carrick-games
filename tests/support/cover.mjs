/** Input-only recipes for real screenshots; never substitute a game model. */
export async function tapPainted(page, pattern) {
  await page.waitForFunction(source => Object.keys(window.__coverLabels).some(text => new RegExp(source, 'i').test(text)), pattern.source);
  const point = await page.evaluate(source => Object.entries(window.__coverLabels).find(([text]) => new RegExp(source, 'i').test(text))?.[1], pattern.source);
  if (!point) throw new Error(`Missing painted control: ${pattern}`);
  await page.mouse.click(point.x + 8, point.y - 4);
}
export async function pressSequence(page, keys, interval = 100) {
  for (const key of keys) { await page.keyboard.press(key); await page.waitForTimeout(interval); }
}
