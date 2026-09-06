import { test, devices } from '@playwright/test';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { registerVillaInteractionTests } from './villaInteractionCases';

const loadRuntime = createRequire(join(process.cwd(), 'package.json'));
const webkitOptions = process.env.VILLA_WEBKIT_RUNTIME ? loadRuntime(process.env.VILLA_WEBKIT_RUNTIME) : {};

test.use({ ...devices['iPhone 13'], browserName: 'webkit', defaultBrowserType: 'webkit', launchOptions: webkitOptions });

test.describe('villa native interaction / webkit', registerVillaInteractionTests);
