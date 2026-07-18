/* M8 对齐验证：时间线音量线/淡入手柄/最大裁剪指示器/文件拖放时间线 + 源信息/裁剪数值 + 拖拽绘制色块 */
import { readFileSync } from 'node:fs';
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

const getState = () => page.evaluate(() => window.__editorStore.getState());

// 导入视频 + 音频
await page.locator('input[type=file][accept*="video"]').setInputFiles([
  'tools/fixtures/video.mp4',
  'tools/fixtures/audio.wav',
]);
await page.waitForFunction(
  () => {
    const vals = Object.values(window.__editorStore.getState().assetStatus);
    return vals.length === 2 && vals.every((v) => v === 'uploaded');
  },
  { timeout: 30000 },
);

let s = await getState();
const findItem = (t) => Object.values(s.undoable.items).find((i) => i.type === t);
const audio = findItem('audio');
const video = findItem('video');
if (!audio || !video) fail('missing imported items');

// ---- 选中音频块：音量线 + 淡入淡出手柄存在 ----
const audioBlock = page.locator(`[data-item-block="${audio.id}"]`);
await audioBlock.click({ position: { x: 30, y: 25 } });
await page.waitForSelector(`[data-item-block="${audio.id}"] [data-volume-line]`, { timeout: 5000 });
await page.waitForSelector(`[data-item-block="${audio.id}"] [data-fade="in"]`, { timeout: 5000 });

// ---- 源信息：显示文件名 ----
const srcInfo = await page.getByText('源信息').count();
if (!srcInfo) fail('源信息 section missing');
if (!(await page.getByText('audio.wav').count())) fail('源信息 filename missing');

// ---- 音量线拖动：音量下降 ----
const vLine = await page.locator(`[data-item-block="${audio.id}"] [data-volume-line]`).boundingBox();
await page.mouse.move(vLine.x + vLine.width / 2, vLine.y + vLine.height / 2);
await page.mouse.down();
await page.mouse.move(vLine.x + vLine.width / 2, vLine.y + vLine.height / 2 + 20, { steps: 5 });
await page.mouse.up();
s = await getState();
const newVol = s.undoable.items[audio.id].volume;
if (!(newVol < 1)) fail(`volume not lowered: ${newVol}`);

// ---- 淡入手柄拖动：fadeIn > 0 ----
const fadeIn = await page.locator(`[data-item-block="${audio.id}"] [data-fade="in"]`).boundingBox();
await page.mouse.move(fadeIn.x + fadeIn.width / 2, fadeIn.y + fadeIn.height / 2);
await page.mouse.down();
await page.mouse.move(fadeIn.x + fadeIn.width / 2 + 30, fadeIn.y + fadeIn.height / 2, { steps: 5 });
await page.mouse.up();
s = await getState();
if (!(s.undoable.items[audio.id].fadeInDurationInFrames > 0)) fail('fadeIn not set by handle drag');

// ---- 最大裁剪指示器：先缩短条目，再次拖动 trim 手柄时出现斜纹 ----
const durBefore = s.undoable.items[audio.id].durationInFrames;
let trimEnd = await page.locator(`[data-item-block="${audio.id}"] [data-trim="end"]`).boundingBox();
await page.mouse.move(trimEnd.x + trimEnd.width / 2, trimEnd.y + trimEnd.height / 2);
await page.mouse.down();
await page.mouse.move(trimEnd.x + trimEnd.width / 2 - 60, trimEnd.y + trimEnd.height / 2, { steps: 5 });
await page.mouse.up();
s = await getState();
if (!(s.undoable.items[audio.id].durationInFrames < durBefore)) fail('trim-end shrink failed');
// 二次拖动：此时右侧有可扩展空间，指示器应显示
trimEnd = await page.locator(`[data-item-block="${audio.id}"] [data-trim="end"]`).boundingBox();
await page.mouse.move(trimEnd.x + trimEnd.width / 2, trimEnd.y + trimEnd.height / 2);
await page.mouse.down();
await page.mouse.move(trimEnd.x + trimEnd.width / 2 + 10, trimEnd.y + trimEnd.height / 2, { steps: 3 });
const hatch = await page.evaluate(() =>
  [...document.querySelectorAll('[data-tl-scroll] *')].some((el) =>
    (el.getAttribute('style') ?? '').includes('repeating-linear-gradient'),
  ),
);
await page.mouse.up();
if (!hatch) fail('max-trim indicator not shown during trim drag');

// ---- 选中视频：裁剪数值输入存在 ----
await page.locator(`[data-item-block="${video.id}"]`).click({ position: { x: 30, y: 25 } });
await page.waitForSelector('text=裁剪', { timeout: 5000 });
// 视频块底部波形（有音轨的视频）
await page.waitForFunction(
  (id) => !!document.querySelector(`[data-item-block="${id}"] canvas`),
  video.id,
  { timeout: 15000 },
);

// ---- 拖拽绘制色块 ----
const before = Object.keys(s.undoable.items).length;
await page.locator('button[title*="绘制色块"]').click();
if ((await page.locator('button[title*="绘制色块"]').getAttribute('aria-pressed')) !== 'true')
  fail('draw mode not active');
const overlay = await page.locator('.cursor-crosshair').boundingBox();
if (!overlay) fail('draw overlay missing');
const ox = overlay.x + overlay.width / 3;
const oy = overlay.y + overlay.height / 3;
await page.mouse.move(ox, oy);
await page.mouse.down();
await page.mouse.move(ox + 120, oy + 80, { steps: 5 });
await page.mouse.up();
s = await getState();
const solids = Object.values(s.undoable.items).filter((i) => i.type === 'solid');
if (Object.keys(s.undoable.items).length !== before + 1 || !solids.length) fail('solid not drawn');
if (!(solids[0].width > 10 && solids[0].height > 10)) fail(`solid rect too small: ${solids[0].width}x${solids[0].height}`);
if ((await page.locator('button[title*="绘制色块"]').getAttribute('aria-pressed')) === 'true')
  fail('draw mode should exit after drawing');

// ---- OS 文件拖放到时间线 ----
const pngB64 = readFileSync('tools/fixtures/image.png').toString('base64');
const lane = await page.locator('[data-tl-scroll] > div').first().boundingBox();
const beforeDrop = Object.keys(s.undoable.items).length;
await page.evaluate(
  async ({ b64, x, y }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'dropped.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = document.elementFromPoint(x, y);
    for (const type of ['dragover', 'drop']) {
      target.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }),
      );
    }
  },
  { b64: pngB64, x: lane.x + 200, y: lane.y + 24 + 28 },
);
await page.waitForFunction(
  (n) => Object.keys(window.__editorStore.getState().undoable.items).length === n + 1,
  beforeDrop,
  { timeout: 15000 },
);
s = await getState();
const dropped = Object.values(s.undoable.items).find(
  (i) => i.type === 'image' && s.undoable.assets[i.assetId]?.filename?.includes('dropped'),
);
if (!dropped) fail('dropped image item not created');
if (!(dropped.from > 0)) fail(`dropped item frame ${dropped.from}, want > 0`);

// ---- 磁吸开关按钮 ----
const magnetBtn = page.locator('button[title*="吸附"]');
const snapBefore = await page.evaluate(() => window.__editorStore.getState().snappingEnabled);
await magnetBtn.click();
if ((await page.evaluate(() => window.__editorStore.getState().snappingEnabled)) !== !snapBefore)
  fail('magnet button did not toggle snapping');
await magnetBtn.click();

// ---- 剪刀按钮：未选中时分割播放头下所有条目 ----
await page.evaluate(() => {
  window.__editorStore.getState().setSelected([]);
  window.__playerRef.current.pause();
  window.__playerRef.current.seekTo(10);
});
const beforeSplit = await page.evaluate(() => Object.keys(window.__editorStore.getState().undoable.items).length);
await page.locator('button[title*="在播放头处分割"]').click();
const afterSplit = await page.evaluate(() => Object.keys(window.__editorStore.getState().undoable.items).length);
if (!(afterSplit > beforeSplit)) fail(`scissors split created no items (${beforeSplit} -> ${afterSplit})`);

await page.screenshot({ path: process.argv[2] ?? 'm8.png' });
await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M8 VERIFY OK');
