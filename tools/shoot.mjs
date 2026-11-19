// SOLMAR HEAT screenshot runner: opens each ?shot scene in headless
// Chromium, waits for window.__shotReady, saves a JPEG into screenshots/.
// Usage: node tools/shoot.mjs [shot-name ...]
// With no args it shoots every scene in shots.json.
// The game must be served first: node serve.ts --port 8080
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/home/hatch/workspace/makefun/playwright-shot/package.json');
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8'));
const wanted = process.argv.slice(2);
const list = wanted.length ? shots.filter((s) => wanted.includes(s.name.replace(/\.jpg$/, ''))) : shots;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (error) => console.log('PAGE ERROR:', String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') console.log('CONSOLE ERROR:', message.text());
});
for (const shot of list) {
  await page.goto(`http://localhost:8080/${shot.query}`, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
  } catch {
    console.log(`${shot.name}: __shotReady never fired, screenshotting anyway`);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(ROOT, 'screenshots', shot.name), type: 'jpeg', quality: 82 });
  console.log('saved', shot.name);
}
await browser.close();
