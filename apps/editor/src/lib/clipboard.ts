import { createTextItem, newId, type EditorStarterAsset, type EditorStarterItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { normalizeLegacyFades } from '../persistence/persistence';
import { addTrack } from '../timeline/ops';

/** 系统剪贴板 text/html 载荷的标记属性（与官方 editor-starter 同名，格式互通） */
export const CLIPBOARD_MARKER = 'data-remotion-editor-starter';

type ClipboardPayload = { items: EditorStarterItem[]; assets: Record<string, EditorStarterAsset> };

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 选中项 + 引用的素材 → 系统剪贴板载荷；无选中返回 null（同时镜像到内部剪贴板供菜单用） */
export const buildClipboardPayload = (): { html: string; plain: string } | null => {
  const store = useEditorStore.getState();
  const items = store.selectedItemIds
    .map((id) => store.undoable.items[id])
    .filter((i): i is EditorStarterItem => Boolean(i));
  if (!items.length) return null;
  store.setClipboard(items);
  const assets: Record<string, EditorStarterAsset> = {};
  for (const it of items) {
    if ('assetId' in it && store.undoable.assets[it.assetId]) {
      assets[it.assetId] = store.undoable.assets[it.assetId];
    }
  }
  const json = JSON.stringify({ items, assets } satisfies ClipboardPayload);
  return { html: `<div ${CLIPBOARD_MARKER}>${escapeHtml(json)}</div>`, plain: json };
};

/** 菜单用复制：内部剪贴板 + 尽力写系统剪贴板（异步，失败静默） */
export const copySelection = (): void => {
  const payload = buildClipboardPayload();
  if (!payload || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return;
  void navigator.clipboard
    .write([
      new ClipboardItem({
        'text/html': new Blob([payload.html], { type: 'text/html' }),
        'text/plain': new Blob([payload.plain], { type: 'text/plain' }),
      }),
    ])
    .catch(() => undefined);
};

/** 解析系统剪贴板 html 载荷；不是我们的格式或损坏则 null */
export const parseClipboardHtml = (html: string): ClipboardPayload | null => {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const holder = doc.querySelector(`[${CLIPBOARD_MARKER}]`);
    if (!holder?.textContent) return null;
    const parsed = JSON.parse(holder.textContent) as ClipboardPayload;
    if (!Array.isArray(parsed.items)) return null;
    const items = parsed.items.filter((i) => i && typeof i === 'object' && 'type' in i && 'durationInFrames' in i);
    if (!items.length) return null;
    // 旧版本载荷的视频单淡变对同时驱动画面与音量 ⇒ 粘贴时迁移
    normalizeLegacyFades(items);
    return { items, assets: parsed.assets ?? {} };
  } catch {
    return null;
  }
};

/** 每项落入新建顶部轨道（避免任何重叠冲突） */
const placeItems = (
  items: EditorStarterItem[],
  opts?: { atFrame?: number; offsetPx?: number; assets?: Record<string, EditorStarterAsset> },
): void => {
  const store = useEditorStore.getState();
  const offset = opts?.offsetPx ?? 0;
  // 粘贴到播放头：整体平移，保持多项之间的相对帧距
  const minFrom = Math.min(...items.map((i) => i.from));
  const frameShift = opts?.atFrame !== undefined ? opts.atFrame - minFrom : 0;
  const newIds: string[] = [];
  store.updateUndoable((s) => {
    let st = s;
    const newItems = { ...s.items };
    const newAssets = { ...s.assets };
    for (const [id, asset] of Object.entries(opts?.assets ?? {})) {
      if (!newAssets[id]) newAssets[id] = asset;
    }
    for (const item of items) {
      const added = addTrack(st, 0);
      st = added.state;
      const id = newId();
      newIds.push(id);
      newItems[id] = {
        ...item,
        id,
        trackId: added.trackId,
        from: Math.max(0, item.from + frameShift),
        left: item.left + offset,
        top: item.top + offset,
      };
    }
    return { ...st, items: newItems, assets: newAssets };
  });
  store.setSelected(newIds);
  // 跨标签页粘贴的远程素材：标记为已上传
  for (const [id, asset] of Object.entries(opts?.assets ?? {})) {
    if (asset.url.startsWith('http') && !store.assetStatus[id]) store.setAssetStatus(id, 'uploaded');
  }
};

/** 系统剪贴板载荷粘贴：落在播放头帧（官方行为） */
export const pasteSerialized = (payload: ClipboardPayload, atFrame: number): void => {
  placeItems(payload.items, { atFrame, assets: payload.assets });
};

/** 内部剪贴板兜底粘贴（菜单复制后系统剪贴板写入失败时仍可用） */
export const pasteClipboard = (atFrame?: number): void => {
  const { clipboard } = useEditorStore.getState();
  if (clipboard.length) placeItems(clipboard, { atFrame });
};

export const duplicateSelection = (): void => {
  const store = useEditorStore.getState();
  const items = store.selectedItemIds
    .map((id) => store.undoable.items[id])
    .filter((i): i is EditorStarterItem => Boolean(i));
  if (items.length) placeItems(items, { offsetPx: 20 });
};

/** 系统剪贴板文本 → 文本项（放画布中心、当前帧） */
export const pasteTextAsTextItem = (text: string, currentFrame: number): void => {
  const store = useEditorStore.getState();
  store.updateUndoable((s) => {
    const { state: st, trackId } = addTrack(s, 0);
    const item = createTextItem({ trackId, from: currentFrame, text });
    item.left = Math.round((st.compositionWidth - item.width) / 2);
    item.top = Math.round((st.compositionHeight - item.height) / 2);
    return { ...st, items: { ...st.items, [item.id]: item } };
  });
};
