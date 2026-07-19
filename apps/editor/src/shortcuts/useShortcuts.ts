import { useEffect } from 'react';
import { useEditorStore } from '../state/store';
import { playerRef } from '../canvas/player-ref';
import { fitScaleRef } from '../canvas/fit-scale';
import { resolveSplitTargets, splitItemsAtFrame } from '../timeline/ops';
import { saveState } from '../persistence/persistence';
import { importFiles } from '../lib/import-assets';
import {
  CLIPBOARD_MARKER,
  buildClipboardPayload,
  duplicateSelection,
  parseClipboardHtml,
  pasteClipboard,
  pasteSerialized,
  pasteTextAsTextItem,
} from '../lib/clipboard';

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  if (target.tagName !== 'INPUT') return false;
  // 非文本输入控件不吞快捷键——滑杆(base-ui Slider)拖完后焦点会留在其隐藏的
  // input[type=range] 上，若一并拦截会造成"快捷键全失灵"直到下一次点击
  const type = (target as HTMLInputElement).type;
  return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color'].includes(type);
};

export const useShortcuts = () => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const store = useEditorStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 's') {
        e.preventDefault();
        saveState();
        return;
      }
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }
      if ((mod && key === 'y') || (mod && e.shiftKey && key === 'z')) {
        e.preventDefault();
        store.redo();
        return;
      }
      // Cmd+C/X/V 不在 keydown 处理：走原生 copy/cut/paste 事件（官方模型，系统剪贴板可跨标签页）
      if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        store.setSelected(Object.keys(store.undoable.items));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelected();
        return;
      }
      if (e.key === 'Escape') {
        if (store.itemSelectedForCrop) store.setItemSelectedForCrop(null);
        else if (store.textItemEditing) store.setTextItemEditing(null);
        else store.setSelected([]);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        playerRef.current?.toggle();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const p = playerRef.current;
        if (!p) return;
        // 官方：←/→ ±1 帧，Shift 加持 ±1 秒
        const step =
          (e.shiftKey ? store.undoable.fps : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
        p.pause();
        p.seekTo(Math.max(0, p.getCurrentFrame() + step));
        return;
      }
      // 相对步进（官方）：+ 当前缩放加倍，- 减半，0 适应
      if (e.key === '+' || e.key === '=') {
        const cur = store.canvasZoom === 'fit' ? fitScaleRef.current : store.canvasZoom;
        store.setCanvasZoom(cur * 2);
        return;
      }
      if (e.key === '-') {
        const cur = store.canvasZoom === 'fit' ? fitScaleRef.current : store.canvasZoom;
        store.setCanvasZoom(cur / 2);
        return;
      }
      if (e.key === '0') {
        store.setCanvasZoom('fit');
        return;
      }
      if (e.shiftKey && key === 'm') {
        store.toggleSnapping();
        return;
      }
      if (key === 's' && !mod) {
        const frame = playerRef.current?.getCurrentFrame();
        if (frame !== undefined) {
          // 有选中切选中，未选中切播放头下所有条目（与工具栏剪刀按钮一致）
          store.updateUndoable((s) =>
            splitItemsAtFrame(s, frame, resolveSplitTargets(s, frame, store.selectedItemIds)),
          );
        }
      }
    };

    // 复制/剪切：序列化选中项（含引用素材）写入系统剪贴板，可跨标签页粘贴（官方模型）
    const onCopy = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const payload = buildClipboardPayload();
      if (!payload || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData('text/html', payload.html);
      e.clipboardData.setData('text/plain', payload.plain);
    };
    const onCut = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const hadSelection = useEditorStore.getState().selectedItemIds.length > 0;
      onCopy(e);
      if (hadSelection) useEditorStore.getState().deleteSelected();
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const frame = playerRef.current?.getCurrentFrame() ?? 0;
      // 1) 我们的序列化载荷（本页或其他标签页复制的元素）→ 粘贴到播放头
      const html = dt.getData('text/html');
      if (html.includes(CLIPBOARD_MARKER)) {
        const payload = parseClipboardHtml(html);
        if (payload) {
          e.preventDefault();
          pasteSerialized(payload, frame);
          return;
        }
      }
      // 2) 文件 → 导入素材
      const files = Array.from(dt.files);
      if (files.length) {
        e.preventDefault();
        void importFiles(files);
        return;
      }
      // 3) 纯文本 → 画布居中文本项
      const text = dt.getData('text/plain');
      if (text.trim()) {
        e.preventDefault();
        pasteTextAsTextItem(text.trim(), frame);
        return;
      }
      // 4) 兜底：内部剪贴板（菜单复制且系统剪贴板写入失败时）
      if (useEditorStore.getState().clipboard.length) {
        e.preventDefault();
        pasteClipboard(frame);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
    };
  }, []);
};
