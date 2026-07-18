/* M1 交互验证：点选 → 拖拽 → 撤销 → 手柄缩放 → 画布缩放 */
import { chromium } from 'playwright';

const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

const stage = page.locator('[data-stage]');
const box = await stage.boundingBox();
if (!box) fail('no stage');

const getStore = () =>
  page.evaluate(() => {
    const s = window.__editorStore.getState();
    return {
      selected: s.selectedItemIds,
      items: s.undoable.items,
      past: s.past.length,
      zoom: s.canvasZoom,
    };
  });

// 合成坐标 -> 屏幕坐标
const compW = 1080;
const scale = box.width / compW;
const toScreen = (cx, cy) => ({ x: box.x + cx * scale, y: box.y + cy * scale });

// 1) 点击标题（合成中心540,960 落在标题内）
const c = toScreen(540, 960);
await page.mouse.click(c.x, c.y);
let s = await getStore();
if (s.selected.length !== 1) fail(`expected 1 selected, got ${s.selected.length}`);
const titleId = s.selected[0];
const leftBefore = s.items[titleId].left;
const outline = await page.locator('.border-blue-500').count();
if (outline < 1) fail('no selection outline');

// 2) 拖拽 100 屏幕像素
await page.mouse.move(c.x, c.y);
await page.mouse.down();
await page.mouse.move(c.x + 100, c.y, { steps: 5 });
await page.mouse.up();
s = await getStore();
const leftAfter = s.items[titleId].left;
const expectedDelta = Math.round(100 / scale);
if (Math.abs(leftAfter - leftBefore - expectedDelta) > 2) {
  fail(`drag delta wrong: ${leftAfter - leftBefore} vs ${expectedDelta}`);
}
if (s.past !== 1) fail(`drag should be 1 undo entry, past=${s.past}`);

// 3) Cmd+Z 撤销回原位
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
s = await getStore();
if (s.items[titleId].left !== leftBefore) fail('undo did not restore position');

// 4) 手柄缩放（重新选中后拖 se 角）：solid 角拖自由缩放（双轴独立，官方行为）
await page.mouse.click(c.x, c.y);
const item = (await getStore()).items[titleId];
const se = toScreen(item.left + item.width, item.top + item.height);
await page.mouse.move(se.x, se.y);
await page.mouse.down();
await page.mouse.move(se.x + 60, se.y + 10, { steps: 5 });
await page.mouse.up();
s = await getStore();
const it2 = s.items[titleId];
if (Math.abs(it2.width - (item.width + 60 / scale)) > 3) {
  fail(`free resize width: ${it2.width} vs ${item.width + 60 / scale}`);
}
if (Math.abs(it2.height - (item.height + 10 / scale)) > 3) {
  fail(`free resize height: ${it2.height} vs ${item.height + 10 / scale}`);
}

// 5) 画布缩放快捷键
await page.keyboard.press('+');
s = await getStore();
if (s.zoom === 'fit') fail('zoom + did not change');
await page.keyboard.press('0');
s = await getStore();
if (s.zoom !== 'fit') fail('zoom 0 did not reset');

await page.screenshot({ path: process.argv[2] ?? 'm1.png' });
await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M1 VERIFY OK');
