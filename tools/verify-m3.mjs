/* M3 素材管线验证：导入 mp4/wav/png → item 创建 → 上传 MinIO → 远端可读 → 缩略图/波形出现 */
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
      items: s.undoable.items,
      assets: s.undoable.assets,
      tracks: s.undoable.tracks,
      assetStatus: s.assetStatus,
    };
  });

// 记录初始轨道，并把播放头移到 149 帧：Track 1 的 text（15..135）已结束有空间，
// Track 2 的 solid（0..150）仍占用 —— 用于验证「导入落在播放头处有空间的现有轨道」
await page.waitForFunction(() => Boolean(window.__playerRef?.current));
const before = await getStore();
const track1Id = before.tracks[0].id;
await page.evaluate(() => window.__playerRef.current.seekTo(149));

// 导入三个文件
await page.locator('input[type=file][accept*="video"]').setInputFiles([
  'tools/fixtures/video.mp4',
  'tools/fixtures/audio.wav',
  'tools/fixtures/image.png',
]);

// 等全部上传完成
await page.waitForFunction(
  () => {
    const st = window.__editorStore.getState().assetStatus;
    const vals = Object.values(st);
    return vals.length === 3 && vals.every((v) => v === 'uploaded');
  },
  { timeout: 30000 },
);

const s = await getStore();
const byType = (t) => Object.values(s.items).find((i) => i.type === t);
const video = byType('video');
const audio = byType('audio');
const image = byType('image');
if (!video || !audio || !image) fail('missing imported items');

// 视频元数据
const vAsset = s.assets[video.assetId];
if (vAsset.width !== 640 || vAsset.height !== 360) fail(`video dims ${vAsset.width}x${vAsset.height}`);
if (Math.abs(vAsset.durationInSeconds - 2) > 0.2) fail(`video duration ${vAsset.durationInSeconds}`);
if (!vAsset.hasAudio) fail('video hasAudio should be true');
if (video.durationInFrames < 55 || video.durationInFrames > 65) fail(`video item frames ${video.durationInFrames}`);
// 视觉适配：640x360 缩放到宽 1080 内
if (video.width !== 640) fail(`video item width ${video.width} (no upscale expected)`);

// 远端 URL 可匿名读取
for (const a of [vAsset, s.assets[audio.assetId], s.assets[image.assetId]]) {
  if (!a.url.startsWith('http://localhost:9100/')) fail(`asset url not remote: ${a.url}`);
  const res = await fetch(a.url);
  if (!res.ok) fail(`remote GET ${a.url} -> ${res.status}`);
}

// 播放头落位：三个 item 都从 149 帧开始；视频（60 帧）落在有空间的现有 Track 1，
// 音频/图片在 149 帧处与已有内容重叠 ⇒ 各新建一条顶部轨道（2 新 + 原 2 = 4）
if (video.from !== 149 || audio.from !== 149 || image.from !== 149)
  fail(`items not at playhead 149: ${video.from}/${audio.from}/${image.from}`);
if (s.tracks.length !== 4) fail(`tracks ${s.tracks.length}, want 4`);
if (video.trackId !== track1Id) fail('video should land on existing Track 1');
if (image.trackId !== s.tracks[0].id) fail('image should be on new top track');
if (audio.trackId !== s.tracks[1].id) fail('audio should be on second new track');

// 胶片 & 波形渲染出现
await page.waitForFunction(
  () => {
    const strips = document.querySelectorAll('[data-item-block] div[style*="background-image"]');
    const waves = document.querySelectorAll('[data-item-block] canvas');
    return strips.length >= 1 && waves.length >= 1;
  },
  { timeout: 15000 },
);

// ---- 刷新后预览恢复：清空 IndexedDB 强制走远程 URL（需 crossOrigin 抽帧）----
await page.getByRole('button', { name: '保存' }).click();
await page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  await Promise.all(
    dbs.map(
      (d) =>
        new Promise((res) => {
          const r = indexedDB.deleteDatabase(d.name);
          r.onsuccess = r.onerror = r.onblocked = () => res(null);
        }),
    ),
  );
});
await page.reload({ waitUntil: 'networkidle' });
// 胶片重新出现（远程 URL 路径）；波形 canvas 必须真的画了内容
await page.waitForFunction(
  () => {
    const strips = document.querySelectorAll('[data-item-block] div[style*="background-image"]');
    const waves = [...document.querySelectorAll('[data-item-block] canvas')].filter((c) => {
      if (!(c instanceof HTMLCanvasElement) || c.width === 0) return false;
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, Math.min(c.width, 200), c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
      return false;
    });
    return strips.length >= 1 && waves.length >= 1;
  },
  { timeout: 20000 },
);

await page.screenshot({ path: process.argv[2] ?? 'm3.png' });
await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M3 VERIFY OK');
