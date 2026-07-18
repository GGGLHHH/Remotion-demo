import { useEffect } from 'react';
import { useEditorStore } from '../state/store';
import { playerRef } from '../canvas/player-ref';
import { splitItemsAtFrame } from '../timeline/ops';

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
  );
};

export const useShortcuts = () => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const store = useEditorStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }
      if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        store.redo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelected();
        return;
      }
      if (e.key === 'Escape') {
        store.setSelected([]);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        playerRef.current?.toggle();
        return;
      }
      if (e.key === '+' || e.key === '=') {
        const cur = store.canvasZoom === 'fit' ? 1 : store.canvasZoom;
        store.setCanvasZoom(cur * 1.25);
        return;
      }
      if (e.key === '-') {
        const cur = store.canvasZoom === 'fit' ? 1 : store.canvasZoom;
        store.setCanvasZoom(cur / 1.25);
        return;
      }
      if (e.key === '0') {
        store.setCanvasZoom('fit');
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === 'm') {
        store.toggleSnapping();
        return;
      }
      if (e.key.toLowerCase() === 's' && !mod) {
        const frame = playerRef.current?.getCurrentFrame();
        if (frame !== undefined && store.selectedItemIds.length > 0) {
          store.updateUndoable((s) => splitItemsAtFrame(s, frame, store.selectedItemIds));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
