/* M7 验证：导入语音 → whisper 转录 → CaptionsItem 渲染逐词高亮 → 面板逐词修正 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};

// 前置：用 macOS say + ffmpeg 生成 16kHz 单声道语音 fixture（已存在则跳过）
const wavPath = 'tools/fixtures/speech.wav';
if (!existsSync(wavPath)) {
  const aiff = path.join(os.tmpdir(), 'm7-speech.aiff');
  // 显式 en_US voice：部分系统默认 voice 对该短语输出会被截断
  execSync(`say -v Samantha -o ${aiff} "hello world this is a caption test"`);
  execSync(`ffmpeg -i ${aiff} -ar 16000 -ac 1 ${wavPath} -y`, { stdio: 'ignore' });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

// 导入语音（第一个 file input = 导入素材）
await page.locator('input[type=file]').first().setInputFiles(wavPath);
await page.waitForFunction(
  () => {
    const s = window.__editorStore.getState();
    return Object.values(s.undoable.items).some((i) => i.type === 'audio');
  },
  null,
  { timeout: 30000 },
);
const audioId = await page.evaluate(
  () =>
    Object.values(window.__editorStore.getState().undoable.items).find((i) => i.type === 'audio')
      .id,
);

// 选中 audio item → 展开「字幕」折叠区（官方默认折叠）→ 点"生成字幕"
await page.evaluate((id) => window.__editorStore.getState().setSelected([id]), audioId);
await page.getByRole('button', { name: '字幕', exact: true }).click();
await page.getByRole('button', { name: '生成字幕' }).click();

// 等任务终态。首跑要编译 whisper.cpp + 下载 base 模型，最长 600s
await page.waitForFunction(
  () => {
    const t = window.__editorStore.getState().captioningTasks[0];
    return t && (t.status === 'done' || t.status === 'error');
  },
  null,
  { timeout: 600_000, polling: 1000 },
);
const task = await page.evaluate(() => window.__editorStore.getState().captioningTasks[0]);
if (task.status !== 'done') fail(`captioning task error: ${task.error}`);

// CaptionsItem + CaptionAsset 断言
const cap = await page.evaluate(() => {
  const s = window.__editorStore.getState().undoable;
  const item = Object.values(s.items).find((i) => i.type === 'captions');
  return item ? { item, asset: s.assets[item.assetId], fps: s.fps } : null;
});
if (!cap) fail('no captions item created');
if (cap.asset?.type !== 'caption' || cap.asset.captions.length === 0) fail('caption asset empty');
const fullText = cap.asset.captions.map((c) => c.text).join('');
if (!/hello/i.test(fullText)) fail(`transcript missing "hello": ${fullText}`);
if (cap.item.from !== 0 || cap.item.durationInFrames < 1) fail('captions item timing wrong');

// seek 到某 token 中段帧：Player DOM 出现该词且被高亮
const tok = cap.asset.captions.find((c) => /hello/i.test(c.text)) ?? cap.asset.captions[0];
const frame = cap.item.from + Math.round(((tok.startMs + tok.endMs) / 2 / 1000) * cap.fps);
await page.evaluate((f) => window.__playerRef.current.seekTo(f), frame);
const word = tok.text.trim().toLowerCase();
await page.waitForFunction(
  (w) => {
    const el = document.querySelector('[data-captions-item]');
    if (!el || !el.textContent.toLowerCase().includes(w)) return false;
    // 当前词应套用高亮色 #facc15
    return [...el.querySelectorAll('span')].some(
      (s) => getComputedStyle(s).color === 'rgb(250, 204, 21)',
    );
  },
  word,
  { timeout: 15000 },
);

// 面板逐词修正：选中 captions item → 改第一个词 → asset.captions 更新
await page.evaluate((id) => window.__editorStore.getState().setSelected([id]), cap.item.id);
const wordInput = page.locator('input[data-caption-word="0"]');
await wordInput.fill('EDITED');
await wordInput.blur();
await page.waitForFunction(
  (assetId) => {
    const a = window.__editorStore.getState().undoable.assets[assetId];
    return a && a.captions[0].text === 'EDITED';
  },
  cap.asset.id,
  { timeout: 5000 },
);

await page.screenshot({ path: process.argv[2] ?? 'm7.png' });
await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M7 VERIFY OK');
