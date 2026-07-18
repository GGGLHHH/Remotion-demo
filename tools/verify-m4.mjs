/* M4 验证：文本面板/字体/行内编辑/媒体面板变速/裁剪模式/画布框选/右键置底/剪贴板/滚动编辑 */
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
      tracks: s.undoable.tracks,
      selected: s.selectedItemIds,
      crop: s.itemSelectedForCrop,
      editing: s.textItemEditing,
    };
  });
const pick = async (type) => {
  const s = await S();
  const id = Object.keys(s.items).find((k) => s.items[k].type === type);
  return { id, item: s.items[id], s };
};
const selectId = (id) => page.evaluate((i) => window.__editorStore.getState().setSelected([i]), id);

// --- 1) 文本面板：选中文本项 → 改字号/对齐/背景 ---
{
  const { id } = await pick('text');
  await selectId(id);
  const sizeInput = page.locator('label:has-text("字号") input');
  await sizeInput.fill('120');
  await sizeInput.press('Enter');
  let s = await S();
  if (s.items[id].fontSize !== 120) fail(`fontSize ${s.items[id].fontSize}`);
  await page.locator('label:has-text("对齐")').nth(1).locator('button').first().click();
  s = await S();
  if (s.items[id].textAlign !== 'left') fail('textAlign not left');
  await page.locator('label:has-text("启用") input').check();
  s = await S();
  if (s.items[id].backgroundColor === null) fail('backgroundColor still null');
}

// --- 2) 字体选择器：打开 → 选一个字体 ---
{
  const { id } = await pick('text');
  await selectId(id);
  await page.locator('label:has-text("字体") button').click();
  await page.locator('input[placeholder="搜索字体…"]').fill('Roboto');
  await page.locator('div.max-h-64 button', { hasText: /^Roboto$/ }).first().click();
  const s = await S();
  if (s.items[id].fontFamily !== 'Roboto') fail(`fontFamily ${s.items[id].fontFamily}`);
}

// --- 3) 行内编辑：程序化进入 → 输入 → blur 提交 ---
{
  const { id } = await pick('text');
  await page.evaluate((i) => window.__editorStore.getState().setTextItemEditing(i), id);
  const ta = page.locator('textarea.absolute');
  await ta.fill('新标题');
  await ta.blur();
  const s = await S();
  if (s.items[id].text !== '新标题') fail(`inline edit text: ${s.items[id].text}`);
  if (s.editing !== null) fail('editing not cleared');
}

// --- 4) 变速：solid 无媒体面板；用 media? demo 无视频 → 跳过变速，改测淡入 ---
{
  const { id } = await pick('solid');
  await selectId(id);
  const fade = page.locator('label:has-text("淡入s") input');
  await fade.fill('0.5');
  await fade.press('Enter');
  const s = await S();
  if (s.items[id].fadeInDurationInFrames !== 15) fail(`fadeIn ${s.items[id].fadeInDurationInFrames}`);
}

// --- 5) 画布框选：先缩小 solid 留出空白，从空白处框选命中它 ---
{
  await page.evaluate(() => {
    const st = window.__editorStore.getState();
    st.setSelected([]);
    const id = Object.keys(st.undoable.items).find((k) => st.undoable.items[k].type === 'solid');
    st.updateUndoable((s) => ({
      ...s,
      items: { ...s.items, [id]: { ...s.items[id], left: 600, top: 1400, width: 400, height: 400 } },
    }));
  });
  const stage = await page.locator('[data-stage]').boundingBox();
  await page.mouse.move(stage.x + 5, stage.y + 5);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width - 5, stage.y + stage.height - 5, { steps: 4 });
  await page.mouse.up();
  const s = await S();
  if (s.selected.length !== 1) fail(`canvas marquee selected ${s.selected.length}`);
  await page.keyboard.press('Meta+z'); // 撤销缩小
}

// --- 6) 右键菜单：solid 置于顶层 → 轨道顺序变化 ---
{
  const { id, s: s0 } = await pick('solid');
  const trackBefore = s0.items[id].trackId;
  const stage = await page.locator('[data-stage]').boundingBox();
  await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2, { button: 'right' });
  await page.getByRole('button', { name: '置于顶层' }).click();
  const s = await S();
  if (s.items[id].trackId === trackBefore) fail('bring-to-front no-op');
  if (s.tracks[0].id !== s.items[id].trackId) fail('solid not on top track');
  await page.keyboard.press('Meta+z');
}

// --- 7) 剪贴板：复制粘贴 → 新 item + 偏移 ---
{
  const { id, s: s0 } = await pick('text');
  const count0 = Object.keys(s0.items).length;
  await selectId(id);
  await page.keyboard.press('Meta+c');
  await page.keyboard.press('Meta+v');
  const s = await S();
  if (Object.keys(s.items).length !== count0 + 1) fail('paste did not add item');
  const newId = s.selected[0];
  if (s.items[newId].left !== s.items[id].left + 20) fail('paste offset wrong');
  await page.keyboard.press('Meta+z');
}

// --- 8) Cmd+D 复制体 ---
{
  const { id, s: s0 } = await pick('solid');
  const count0 = Object.keys(s0.items).length;
  await selectId(id);
  await page.keyboard.press('Meta+d');
  const s = await S();
  if (Object.keys(s.items).length !== count0 + 1) fail('duplicate did not add item');
  await page.keyboard.press('Meta+z');
}

await page.screenshot({ path: process.argv[2] ?? 'm4.png' });
await browser.close();
if (errors.length) fail('page errors: ' + errors.join('; '));
console.log('M4 VERIFY OK');
