import { test, devices } from '@playwright/test';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { registerVillaInteractionTests } from './villaInteractionCases';

/** Register the same native iPhone profile once: first for cold-release feedback,
 * late on periodic/forced soak runs to keep the historical ordering as a control. */
export function villaWebKitSuite() {
  const loadRuntime = createRequire(join(process.cwd(), 'package.json'));
  const launchOptions = process.env.VILLA_WEBKIT_RUNTIME ? loadRuntime(process.env.VILLA_WEBKIT_RUNTIME) : {};
  test.use({ ...devices['iPhone 13'], browserName:'webkit', defaultBrowserType:'webkit', launchOptions });
  test.describe('villa native interaction / webkit', registerVillaInteractionTests);
}
