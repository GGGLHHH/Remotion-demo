/* M2 时间轴验证：条块显示/拖动/吸附/跨轨/新轨道/修剪/分割/框选/标尺 seek/undo */
import { chromium } from 'playwright';

const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const getStore = () =>
  page.evaluate(() => {
    const s = window.__editorStore.getState();
    return {
      items: s.undoable.items,
      tracks: s.undoable.tracks,
      selected: s.selectedItemIds,
      past: s.past.length,
      zoom: s.timelineZoom,
    };
  });

const ids = async () => {
  const s = await getStore();
  const solidId = Object.keys(s.items).find((k) => s.items[k].type === 'solid');
  const textId = Object.keys(s.items).find((k) => s.items[k].type === 'text');
  return { s, solidId, textId };
};

const blockBox = async (id) => {
  const b = await page.locator(`[data-item-block="${id}"]`).boundingBox();
  if (!b) fail(`no block ${id}`);
  return b;
};

const dragBy = async (x, y, dx, dy) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
};

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

// 1) 条块显示
if ((await page.locator('[data-item-block]').count()) !== 2) fail('expected 2 item blocks');

// 2) 拖动 solid +100px（zoom=2 ⇒ 50 帧；无吸附候选干扰）
{
  const { solidId } = await ids();
  const b = await blockBox(solidId);
  await dragBy(b.x + b.width / 2, b.y + b.height / 2, 100, 0);
  const s = await getStore();
  if (s.items[solidId].from !== 50) fail(`drag: from=${s.items[solidId].from}, want 50`);
  if (s.past !== 1) fail(`drag should add 1 undo entry, past=${s.past}`);
  await page.keyboard.press('Meta+z');
  if ((await getStore()).items[solidId].from !== 0) fail('drag undo failed');
}

// 3) 吸附：拖 text 使左端接近 solid 右端 150 帧（300px）⇒ 吸附到 150
{
  const { textId } = await ids();
  const b = await blockBox(textId);
  // text.from=15 ⇒ 目标 raw≈148（+133 帧=+266px），容差 4 帧内吸到 150
  await dragBy(b.x + 10, b.y + b.height / 2, 266, 0);
  const s = await getStore();
  if (s.items[textId].from !== 150) fail(`snap: from=${s.items[textId].from}, want 150`);
  await page.keyboard.press('Meta+z');
}

// 4) 跨轨拖动到下边缘 ⇒ 新建底部轨道，原空轨道被自动清理
{
  const { s: s0, textId } = await ids();
  const trackBefore = s0.items[textId].trackId;
  const b = await blockBox(textId);
  await dragBy(b.x + b.width / 2, b.y + b.height / 2, 0, 2 * 56 + 10);
  const s = await getStore();
  const newTrack = s.tracks[s.tracks.length - 1];
  if (s.items[textId].trackId === trackBefore) fail('text did not change track');
  if (s.items[textId].trackId !== newTrack.id) fail('text not on last (new) track');
  if (s.tracks.some((t) => t.id === trackBefore)) fail('emptied track not cleaned up');
  await page.keyboard.press('Meta+z');
  const s2 = await getStore();
  if (s2.items[textId].trackId !== trackBefore) fail('cross-track undo failed');
}

// 5) 修剪 solid 末端 -40px ⇒ 130 帧
{
  const { solidId } = await ids();
  const b = await blockBox(solidId);
  await dragBy(b.x + b.width - 2, b.y + b.height / 2, -40, 0);
  const s = await getStore();
  if (s.items[solidId].durationInFrames !== 130) {
    fail(`trim end: dur=${s.items[solidId].durationInFrames}, want 130`);
  }
  await page.keyboard.press('Meta+z');
}

// 6) 标尺 seek + S 分割
{
  const { solidId } = await ids();
  const ruler = await page.locator('[data-ruler]').boundingBox();
  await page.mouse.click(ruler.x + 120, ruler.y + 12); // 120px ⇒ 60 帧
  await page.locator(`[data-item-block="${solidId}"]`).click();
  await page.keyboard.press('s');
  const s = await getStore();
  const solids = Object.values(s.items).filter((i) => i.type === 'solid');
  if (solids.length !== 2) fail(`split: ${solids.length} solids, want 2`);
  const durs = solids.map((i) => i.durationInFrames).sort((a, b) => a - b);
  if (durs[0] + durs[1] !== 150) fail(`split durations ${durs} sum != 150`);
  await page.keyboard.press('Meta+z');
  const s2 = await getStore();
  if (Object.values(s2.items).filter((i) => i.type === 'solid').length !== 1) fail('split undo failed');
}

// 7) 框选：在轨道区空白拖出矩形覆盖两条轨道 ⇒ 全选 2 项
{
  const scroll = await page.locator('[data-tl-scroll]').boundingBox();
  await dragBy(scroll.x + 380, scroll.y + 30, -370, 100);
  const s = await getStore();
  if (s.selected.length !== 2) fail(`marquee selected ${s.selected.length}, want 2`);
}

await page.screenshot({ path: process.argv[2] ?? 'm2.png' });
await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M2 VERIFY OK');
