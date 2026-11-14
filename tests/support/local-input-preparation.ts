import { expect, type Page } from '@playwright/test';
import { LOCAL_INPUT_PREPARATION_PROTOCOL, readLocalInputPreparation, type LocalInputPreparationDeclaration } from '@carrick/lifecycle';
import type { GameRelease } from '@carrick/game-sdk/catalog';

/** Inspect the ACTUAL tested immutable entry, not source metadata or a game ID.
 * Import is cached by the browser and never calls create a second time.
 */
export async function releaseInputDeclaration(page: Page, release: GameRelease): Promise<LocalInputPreparationDeclaration | undefined> {
  const exported = await page.evaluate(async entry => {
    const module = await import(/* @vite-ignore */ entry);
    const field = Object.getOwnPropertyDescriptor(module, 'localInputPreparation');
    let declaration: Record<string, unknown> | null = null;
    if (field && 'value' in field && field.value && typeof field.value === 'object' && !Array.isArray(field.value)) {
      const descriptors = Object.getOwnPropertyDescriptors(field.value);
      if (Reflect.ownKeys(descriptors).every(key => typeof key === 'string' && 'value' in descriptors[key]
        && ['string', 'number', 'boolean'].includes(typeof descriptors[key].value))) {
        declaration = Object.fromEntries(Object.entries(descriptors).map(([key, value]) => [key, value.value]));
      }
    }
    return { id: module.id, version: module.version, apiVersion: module.apiVersion, declared: !!field, declaration };
  }, release.entry);
  expect(exported.id).toBe(release.id); expect(exported.version).toBe(release.version); expect(exported.apiVersion).toBe(1);
  return readLocalInputPreparation(exported.declared ? { localInputPreparation: exported.declaration } : {});
}

/** Opted-in modules still need a supporting host and a valid host-owned receipt.
 * Loading/stopped/failed/absent or fabricated unnegotiated markers are not ready.
 */
export async function waitForLocalInputPresentation(page: Page, declaration: LocalInputPreparationDeclaration) {
  expect(declaration).toEqual({ protocol: LOCAL_INPUT_PREPARATION_PROTOCOL, version: 1, kind: 'files' });
  const canvas = page.locator('#gameCanvas');
  await expect(canvas).toHaveAttribute('data-game-preparation-protocol', declaration.protocol);
  await expect(canvas).toHaveAttribute('data-game-preparation-version', '1');
  await expect(canvas).toHaveAttribute('data-game-preparation-kind', 'files');
  await expect.poll(async () => {
    if (await canvas.getAttribute('data-game-running') === 'true') return 'running';
    return await canvas.getAttribute('data-game-preparation') === 'awaiting-input' ? 'awaiting-input' : 'not-ready';
  }, { timeout: 45_000 }).toMatch(/^(running|awaiting-input)$/);
  await expect(page.locator('#loadingOverlay')).not.toHaveClass(/active/);
  if (await canvas.getAttribute('data-game-running') === 'true') return 'running' as const;
  await assertLocalInputInteractive(page);
  return 'awaiting-input' as const;
}

export async function assertLocalInputInteractive(page: Page) {
  const canvas = page.locator('#gameCanvas');
  await expect(canvas).toHaveAttribute('data-game-running', 'false');
  await expect(canvas).toHaveAttribute('data-game-preparation', 'awaiting-input');
  const inputId = await canvas.getAttribute('data-game-preparation-input'); expect(inputId).toBeTruthy();
  const input = page.locator(`[id=${JSON.stringify(inputId)}]`);
  await expect(input).toHaveCount(1); await expect(input).toHaveJSProperty('type', 'file');
  await expect(input).toBeVisible(); await expect(input).toBeEnabled();
  await expect(input).toHaveAccessibleName(/.+/);
  expect(await input.evaluate(element => element.isConnected && !!element.closest('#gameApp') && !element.closest('[inert], [hidden]'))).toBe(true);
  return input;
}

/** Real trusted activation must open the native chooser. Cancellation supplies
 * no proprietary data and cannot count as VM running or successful gameplay.
 */
export async function exerciseLocalFileChooser(page: Page) {
  const input = await assertLocalInputInteractive(page);
  const choosing = page.waitForEvent('filechooser');
  await input.click();
  const chooser = await choosing;
  expect(await chooser.element().evaluate(element => element.id)).toBe(await input.getAttribute('id'));
  await chooser.setFiles([]);
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-game-running', 'false');
}
