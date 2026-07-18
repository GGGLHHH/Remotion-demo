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

// 导入三个文件
await page.locator('input[type=file]').setInputFiles([
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

// 每个素材一条新轨道（3 新 + 原 2）
if (s.tracks.length !== 5) fail(`tracks ${s.tracks.length}, want 5`);

// 胶片 & 波形渲染出现
await page.waitForFunction(
  () => {
    const strips = document.querySelectorAll('[data-item-block] div[style*="background-image"]');
    const waves = document.querySelectorAll('[data-item-block] canvas');
    return strips.length >= 1 && waves.length >= 1;
  },
  { timeout: 15000 },
);

await page.screenshot({ path: process.argv[2] ?? 'm3.png' });
await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M3 VERIFY OK');
