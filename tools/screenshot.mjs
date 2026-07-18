import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
// 截第 0 帧
await page.screenshot({ path: process.argv[2] ?? 'frame0.png' });
// 点播放，等 1 秒后截图（标题应已淡入）
await page.keyboard.press('Space');
await page.waitForTimeout(1200);
await page.screenshot({ path: process.argv[3] ?? 'frame1s.png' });
await browser.close();
if (errors.length) {
  console.error('PAGE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK no page errors');
