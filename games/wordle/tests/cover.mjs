export async function prepare(page) {
  for (const word of ['APPLE', 'CLOUD']) { await page.keyboard.type(word); await page.keyboard.press('Enter'); await page.waitForTimeout(800); }
  await page.keyboard.type('BR');
}
