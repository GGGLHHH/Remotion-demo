import { useEffect } from 'react';
import { useEditorStore } from '../state/store';
import { playerRef } from '../canvas/player-ref';
import { fitScaleRef } from '../canvas/fit-scale';
import { resolveSplitTargets, splitItemsAtFrame } from '../timeline/ops';
import { saveState } from '../persistence/persistence';
import { importFiles } from '../lib/import-assets';
import {
  copySelection,
  duplicateSelection,
  pasteClipboard,
  pasteTextAsTextItem,
} from '../lib/clipboard';

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
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
      if (mod && key === 'c') {
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && key === 'x') {
        e.preventDefault();
        copySelection();
        store.deleteSelected();
        return;
      }
      if (mod && key === 'v') {
        // 内部剪贴板优先；系统剪贴板走 paste 事件
        if (store.clipboard.length) {
          e.preventDefault();
          pasteClipboard();
        }
        return;
      }
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
        const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
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

    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const files = Array.from(dt.files);
      if (files.length) {
        e.preventDefault();
        void importFiles(files);
        return;
      }
      const text = dt.getData('text/plain');
      if (text.trim() && useEditorStore.getState().clipboard.length === 0) {
        e.preventDefault();
        pasteTextAsTextItem(text.trim(), playerRef.current?.getCurrentFrame() ?? 0);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, []);
};
