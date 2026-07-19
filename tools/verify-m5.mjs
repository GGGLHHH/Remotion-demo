/* M5 验证：持久化(Cmd+S/reload/URL hash)/播放控制条(时间码/跳转/循环)/素材清理端到端 */
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

const S = () =>
  page.evaluate(() => {
    const s = window.__editorStore.getState();
    return {
      items: s.undoable.items,
      assets: s.undoable.assets,
      deletedAssets: s.undoable.deletedAssets,
      dirty: s.undoable !== s.lastSavedState,
      loop: s.loop,
      past: s.past.length,
    };
  });
const pickText = async () => {
  const s = await S();
  return Object.keys(s.items).find((k) => s.items[k].type === 'text');
};

// --- 1) 改属性 → Cmd+S → reload → 改动还原、脏标记消失 ---
{
  let s = await S();
  if (s.dirty) fail('initially dirty');
  const id = await pickText();
  await page.evaluate((i) => {
    window.__editorStore
      .getState()
      .updateUndoable((st) => ({ ...st, items: { ...st.items, [i]: { ...st.items[i], fontSize: 99 } } }));
  }, id);
  s = await S();
  if (!s.dirty) fail('not dirty after edit');
  await page.keyboard.press('Meta+s');
  s = await S();
  if (s.dirty) fail('still dirty after Cmd+S');
  await page.reload({ waitUntil: 'networkidle' });
  s = await S();
  if (s.items[id]?.fontSize !== 99) fail(`fontSize after reload: ${s.items[id]?.fontSize}`);
  if (s.dirty) fail('dirty after reload');
}

// --- 2) #state= base64 URL 加载 ---
{
  const state = await page.evaluate(() => window.__editorStore.getState().undoable);
  const id = Object.keys(state.items).find((k) => state.items[k].type === 'text');
  state.items[id].text = 'HASH-OK';
  const b64 = Buffer.from(JSON.stringify(state)).toString('base64');
  await page.goto('about:blank');
  await page.goto(`http://localhost:5173/#state=${encodeURIComponent(b64)}`, {
    waitUntil: 'networkidle',
  });
  const s = await S();
  if (s.items[id]?.text !== 'HASH-OK') fail(`hash state text: ${s.items[id]?.text}`);
  // 回到普通 URL（经 about:blank 强制整页重载）
  await page.goto('about:blank');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
}

// --- 3) 时间码：0:00.00 格式 + 跳尾变化 ---
{
  const tc = page.locator('[data-timecode]');
  const before = (await tc.textContent()).trim();
  if (!/^0:00\.00 \/ \d+:\d{2}\.\d{2}$/.test(before)) fail(`timecode format: ${before}`);
  await page.getByTitle('跳到结尾').click();
  await page.waitForFunction(
    (prev) => document.querySelector('[data-timecode]').textContent.trim() !== prev,
    before,
  );
  const after = (await tc.textContent()).trim();
  if (!/^\d+:\d{2}\.\d{2} \//.test(after)) fail(`timecode after seek: ${after}`);
}

// --- 4) 循环按钮切换 store.loop ---
{
  const s0 = await S();
  await page.getByTitle('循环').click();
  let s = await S();
  if (s.loop !== !s0.loop) fail('loop did not toggle');
  await page.getByTitle('循环').click();
  s = await S();
  if (s.loop !== s0.loop) fail('loop did not toggle back');
}

// --- 5) 素材清理端到端：PUT 到 MinIO → 引用 → 删除 → 清理 → 远端 404 ---
{
  // 上传一个 1x1 PNG 到 MinIO
  const up = await (
    await fetch('http://localhost:3001/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'm5-e2e.png', contentType: 'image/png' }),
    })
  ).json();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const putRes = await fetch(up.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  });
  if (putRes.status !== 200) fail(`PUT to MinIO: ${putRes.status}`);
  if ((await fetch(up.publicUrl)).status !== 200) fail('uploaded object not readable');

  // 塞入 asset + 引用它的 item，然后删除该 item
  await page.evaluate((url) => {
    const st = window.__editorStore.getState();
    st.updateUndoable((s) => ({
      ...s,
      assets: {
        ...s.assets,
        'e2e-asset': {
          id: 'e2e-asset',
          type: 'image',
          url,
          filename: 'm5-e2e.png',
          sizeInBytes: 68,
          width: 1,
          height: 1,
        },
      },
      items: {
        ...s.items,
        'e2e-item': {
          id: 'e2e-item',
          type: 'image',
          trackId: s.tracks[0].id,
          assetId: 'e2e-asset',
          crop: null,
          from: 0,
          durationInFrames: 30,
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          borderRadius: 0,
          fadeInDurationInFrames: 0,
          fadeOutDurationInFrames: 0,
        },
      },
    }));
    st.setSelected(['e2e-item']);
    st.deleteSelected();
  }, up.publicUrl);
  let s = await S();
  if (!s.deletedAssets.some((d) => d.assetId === 'e2e-asset')) fail('asset not in deletedAssets');

  // 点清理按钮 → AlertDialog 确认
  await page.getByRole('button', { name: /清理素材/ }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await page.waitForFunction(() => {
    const st = window.__editorStore.getState();
    return (
      st.undoable.deletedAssets.length === 0 &&
      !st.undoable.assets['e2e-asset'] &&
      st.past.length === 0
    );
  });
  const status = (await fetch(up.publicUrl)).status;
  if (status !== 404) fail(`remote object status after cleanup: ${status}`);
}

// ---- 播放跟随不抢用户滚动：右滚后不被拽回；循环回跳时视口跟回 ----
{
  await page.setViewportSize({ width: 800, height: 700 });
  await page.evaluate(() => {
    window.__editorStore.getState().setTimelineZoom(8);
    window.__playerRef.current.seekTo(0);
    window.__playerRef.current.play();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => (document.querySelector('[data-tl-scroll]').scrollLeft = 300));
  await page.waitForTimeout(500);
  const sl = await page.evaluate(() => document.querySelector('[data-tl-scroll]').scrollLeft);
  if (sl < 250) fail(`follow-scroll yanked user scroll back: ${sl}`);
  // 播放头越过右缘恢复翻页，随后循环回跳视口跟回（loop 默认开）
  await page.waitForFunction(
    () => document.querySelector('[data-tl-scroll]').scrollLeft > 500,
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () => document.querySelector('[data-tl-scroll]').scrollLeft < 150,
    { timeout: 8000 },
  );
  await page.evaluate(() => window.__playerRef.current.pause());
}

await page.screenshot({ path: process.argv[2] ?? 'm5.png' });
await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M5 VERIFY OK');
