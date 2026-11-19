// SOLMAR HEAT interactive playtest: drives the real game with keyboard and
// mouse and asserts the systems work — start, walk, steal a car, drive,
// shoot, wanted level, missions — instead of only staging screenshots.
// Usage: node tools/playtest.mjs   (game served on :8080)
import { createRequire } from 'node:module';

const require = createRequire('/home/hatch/workspace/makefun/playwright-shot/package.json');
const { chromium } = require('playwright');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:8080/?seed=1', { waitUntil: 'load' });
await page.waitForTimeout(2500);
const hasGame = await page.evaluate(() => !!window.__game);
check('game boots, window.__game present', hasGame);
check('title screen shown', await page.evaluate(() => window.__game.screen === 'title'));

// Start the story, begin the first mission.
await page.click('#btn-start');
await page.waitForTimeout(500);
check('intro screen after Start', await page.evaluate(() => window.__game.screen === 'intro'));
await page.click('#btn-begin');
await page.waitForTimeout(500);
check('playing after Begin', await page.evaluate(() => window.__game.screen === 'play'));
check('mission 1 active', await page.evaluate(() => window.__game.missions.active));

// Walk forward and confirm the player moves. Headless SwiftShader renders
// slowly, so hold the key by game time (state.elapsed), not wall time.
async function holdKeyForGameSeconds(key, seconds) {
  const t0 = await page.evaluate(() => window.__game.state.elapsed);
  await page.keyboard.down(key);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const t = await page.evaluate(() => window.__game.state.elapsed);
    if (t - t0 >= seconds) break;
    await page.waitForTimeout(200);
  }
  await page.keyboard.up(key);
}

const p0 = await page.evaluate(() => ({ x: window.__game.player.position.x, z: window.__game.player.position.z }));
await holdKeyForGameSeconds('w', 2);
const p1 = await page.evaluate(() => ({ x: window.__game.player.position.x, z: window.__game.player.position.z }));
const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
check('player walks with W', walked > 8, `moved ${walked.toFixed(1)} units`);

// Teleport next to the parked sedan and steal it with E.
await page.evaluate(() => {
  window.__game.player.position.set(66, 0, -40);
});
await page.waitForTimeout(300);
await page.keyboard.press('e');
await page.waitForTimeout(500);
const inCar = await page.evaluate(() => window.__game.player.inCar);
check('enter car with E', inCar);
const wanted = await page.evaluate(() => window.__game.state.wanted);
check('stealing a parked car is not a crime (parked, not traffic)', wanted === 0, `wanted=${wanted}`);

// Drive forward.
const carPos = () => {
  const car = window.__game.playerCar;
  const p = car ? car.position : window.__game.player.position;
  return { x: p.x, z: p.z };
};
const c0 = await page.evaluate(carPos);
await holdKeyForGameSeconds('w', 3);
const c1 = await page.evaluate(carPos);
const drove = Math.hypot(c1.x - c0.x, c1.z - c0.z);
check('car drives with W', drove > 25, `drove ${drove.toFixed(1)} units`);
const speed = await page.evaluate(() => Math.abs(window.__game.playerCar ? window.__game.playerCar.speed : 0));
check('car has speed', speed > 15, `speed=${speed.toFixed(1)}`);

// Exit, then shoot and confirm wanted rises and ammo drops.
await page.keyboard.press('e');
await page.waitForTimeout(400);
check('exit car with E', await page.evaluate(() => !window.__game.player.inCar));
const ammo0 = await page.evaluate(() => document.getElementById('ammo').textContent);
await page.mouse.click(640, 400);
await page.waitForTimeout(400);
const ammo1 = await page.evaluate(() => document.getElementById('ammo').textContent);
check('shooting spends ammo', ammo0 !== ammo1, `${ammo0} -> ${ammo1}`);
const wanted2 = await page.evaluate(() => window.__game.state.wanted);
check('shooting raises wanted', wanted2 >= 1, `wanted=${wanted2}`);

// Police should be chasing now.
await page.waitForTimeout(3000);
const cops = await page.evaluate(() => window.__game.police.count());
check('police respond to wanted level', cops >= 1, `${cops} cop(s)`);

// Minimap and HUD are visible.
check('minimap visible', await page.evaluate(() => {
  const el = document.getElementById('minimap');
  return el && el.offsetWidth > 0;
}));
check('HUD visible', await page.evaluate(() => {
  const el = document.getElementById('hud');
  return el && getComputedStyle(el).display !== 'none';
}));

// Pause menu opens and lists missions.
await page.keyboard.press('p');
await page.waitForTimeout(400);
check('pause menu opens', await page.evaluate(() => window.__game.screen === 'pause'));
check('mission list has 8 jobs', await page.evaluate(() => document.querySelectorAll('#mission-list .mission-row').length === 8));
await page.screenshot({ path: '/tmp/solmar-playtest.jpg', type: 'jpeg', quality: 80 });

check('no page errors during playtest', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? 'ALL PLAYTEST CHECKS PASSED' : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
