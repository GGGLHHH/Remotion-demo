/* M6 验证：一键导出——渲染按钮 → 服务端 bundle+渲染 → MinIO 产物可下载 */
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

// 小合成：320x240、一条轨道、一个 15 帧纯色块（不含 text，避免渲染端拉外网字体）
await page.evaluate(() => {
  const st = window.__editorStore.getState();
  st.setSelected([]);
  st.updateUndoable(() => ({
    tracks: [{ id: 't1', name: '轨道 1', hidden: false, muted: false }],
    items: {
      s1: {
        id: 's1',
        type: 'solid',
        trackId: 't1',
        from: 0,
        durationInFrames: 15,
        color: '#e11d48',
        left: 0,
        top: 0,
        width: 320,
        height: 240,
        rotation: 0,
        opacity: 1,
        borderRadius: 0,
        fadeInDurationInFrames: 0,
        fadeOutDurationInFrames: 0,
      },
    },
    assets: {},
    fps: 30,
    compositionWidth: 320,
    compositionHeight: 240,
    deletedAssets: [],
  }));
});

// 点渲染按钮（默认 MP4），等任务终态。首次会下载 headless 浏览器 + 打 bundle，很慢。
await page.getByRole('button', { name: '渲染', exact: true }).click();
await page.waitForFunction(
  () => {
    const t = window.__editorStore.getState().renderingTasks[0];
    return t && (t.status === 'done' || t.status === 'error');
  },
  null,
  { timeout: 240_000, polling: 1000 },
);
const task = await page.evaluate(() => window.__editorStore.getState().renderingTasks[0]);
if (task.status !== 'done') fail(`render task error: ${task.error}`);
if (!task.url) fail('done task has no url');

// 产物可下载且非空
const res = await fetch(task.url);
if (res.status !== 200) fail(`artifact fetch status: ${res.status}`);
const len = Number(res.headers.get('content-length'));
if (!(len > 1000)) fail(`artifact content-length: ${len}`);

await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M6 VERIFY OK');
