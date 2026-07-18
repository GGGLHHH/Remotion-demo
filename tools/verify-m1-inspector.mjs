/* M1-T4 验证：Inspector 改 X → 画布移动可撤销；交换尺寸 → 合成比例变化 */
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

const getStore = () =>
  page.evaluate(() => {
    const s = window.__editorStore.getState();
    return {
      selected: s.selectedItemIds,
      items: s.undoable.items,
      w: s.undoable.compositionWidth,
      h: s.undoable.compositionHeight,
      past: s.past.length,
    };
  });

// 未选中：合成面板，交换尺寸
let s = await getStore();
if (s.w !== 1080 || s.h !== 1920) fail('unexpected comp size');
await page.getByRole('button', { name: /交换尺寸/ }).click();
s = await getStore();
if (s.w !== 1920 || s.h !== 1080) fail(`swap failed: ${s.w}x${s.h}`);
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
s = await getStore();
if (s.w !== 1080) fail('swap undo failed');

// 选中背景色块（程序化选择，避免坐标脆弱）
const bgId = await page.evaluate(() => {
  const s = window.__editorStore.getState();
  const id = Object.keys(s.undoable.items).find((k) => s.undoable.items[k].type === 'solid');
  s.setSelected([id]);
  return id;
});
// X 输入框改成 200
const xInput = page.locator('label:has-text("X") input');
await xInput.fill('200');
await xInput.press('Enter');
s = await getStore();
if (s.items[bgId].left !== 200) fail(`X commit failed: ${s.items[bgId].left}`);
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
s = await getStore();
if (s.items[bgId].left !== 0) fail('X undo failed');

await page.screenshot({ path: process.argv[2] ?? 'm1-inspector.png' });
await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M1 INSPECTOR VERIFY OK');
