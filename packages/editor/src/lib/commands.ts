import { useMemo } from 'react';
import type { AnimatableProp, UndoableState } from '@gedatou/shared';
import type { PresetId } from '@gedatou/shared/composition';
import { useEditorApi, useEditorDeps, useEditorRefs } from '../state/context';
import type { CanvasTool } from '../state/store';
import { importFiles } from './import-assets';
import { startRender } from './render-client';
import { cleanupDeletedAssets } from './cleanup-assets';
import { addSolidItem, addTextItem } from './add-items';
import { applyAnimationPreset, toggleKeyframe } from './keyframe-ops';
import { copySelection, duplicateSelection, pasteClipboard } from './clipboard';
import { downloadStateFile, loadStateFromFile, saveState } from '../persistence/persistence';
import { bringToFront, resolveSplitTargets, sendToBack, splitItemsAtFrame } from '../timeline/ops';

/**
 * headless 命令面。把编辑器的所有操作绑成一套即用命令 —— 消费方据此自建工具栏 / 菜单 / 快捷键，
 * 无需依赖内置的 Editor.* 具体 UI。命令在**调用时**读最新 store 状态；返回对象引用稳定。
 * 响应式状态（canUndo / canvasZoom / selectedItemIds …）仍用 useEditor(selector) 取。
 */
export type EditorCommands = {
  // 历史
  undo: () => void;
  redo: () => void;
  // 播放
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (frame: number) => void;
  // 选择 & 剪贴板
  selectAll: () => void;
  deleteSelected: () => void;
  /** 把当前选中(≥2)组合成持久组 */
  group: () => void;
  /** 拆分当前选中所涉及的组 */
  ungroup: () => void;
  copy: () => void;
  cut: () => void;
  paste: (atFrame?: number) => void;
  duplicate: () => void;
  // 插入（at/rect 为合成坐标；atFrame 不传用当前播放头）
  addText: (at: { x: number; y: number }, atFrame?: number, text?: string) => void;
  addSolid: (rect: { left: number; top: number; width: number; height: number }, atFrame?: number) => void;
  importAssets: (files: File[]) => Promise<void>;
  // 关键帧（frame 不传用当前播放头相对项起点的帧数）
  toggleKeyframe: (itemId: string, prop: AnimatableProp, frame?: number) => void;
  applyAnimationPreset: (itemId: string, presetId: PresetId) => void;
  // 排列 / 时间线（itemId 不传作用于当前选中）
  bringToFront: (itemId?: string) => void;
  sendToBack: (itemId?: string) => void;
  splitAtPlayhead: () => void;
  toggleSnapping: () => void;
  // 画布工具模式
  setTool: (tool: CanvasTool) => void;
  // 视图 / 缩放
  setZoom: (zoom: number | 'fit') => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitZoom: () => void;
  // 持久化 & 渲染
  save: () => void;
  downloadState: () => void;
  loadState: (file: File) => Promise<boolean>;
  cleanupAssets: () => Promise<void>;
  render: (codec: 'mp4' | 'webm') => Promise<void>;
};

export function useEditorCommands(): EditorCommands {
  const api = useEditorApi();
  const deps = useEditorDeps();
  const refs = useEditorRefs();

  return useMemo<EditorCommands>(() => {
    const player = () => refs.player.current;
    const frame = () => refs.getPlayerFrame();
    const effectiveZoom = () => {
      const z = api.getState().canvasZoom;
      return z === 'fit' ? refs.fitScale.current : z;
    };
    // itemId 不传 → 作用于当前选中的每一项
    const forSelected =
      (fn: (state: UndoableState, id: string) => UndoableState) =>
      (itemId?: string): void => {
        const st = api.getState();
        const ids = itemId ? [itemId] : st.selectedItemIds;
        if (ids.length === 0) return;
        st.updateUndoable((s) => ids.reduce((acc, id) => fn(acc, id), s));
      };

    return {
      undo: () => api.getState().undo(),
      redo: () => api.getState().redo(),

      play: () => player()?.play(),
      pause: () => player()?.pause(),
      togglePlay: () => player()?.toggle(),
      seekTo: (f) => player()?.seekTo(Math.max(0, f)),

      selectAll: () => {
        const st = api.getState();
        st.setSelected(Object.keys(st.undoable.items));
      },
      deleteSelected: () => api.getState().deleteSelected(),
      group: () => api.getState().groupSelected(),
      ungroup: () => api.getState().ungroupSelected(),
      copy: () => copySelection(api),
      cut: () => {
        copySelection(api);
        api.getState().deleteSelected();
      },
      paste: (atFrame) => pasteClipboard(api, atFrame ?? frame()),
      duplicate: () => duplicateSelection(api),

      addText: (at, atFrame, text) => addTextItem(api, at, atFrame ?? frame(), text),
      addSolid: (rect, atFrame) => addSolidItem(api, rect, atFrame ?? frame()),
      importAssets: (files) => importFiles(api, deps, files, undefined, undefined, frame()),

      toggleKeyframe: (itemId, prop, frame) =>
        toggleKeyframe(api, itemId, prop, frame ?? refs.getPlayerFrame() - (api.getState().undoable.items[itemId]?.from ?? 0)),
      applyAnimationPreset: (itemId, presetId) => applyAnimationPreset(api, itemId, presetId),

      bringToFront: forSelected(bringToFront),
      sendToBack: forSelected(sendToBack),
      splitAtPlayhead: () => {
        const st = api.getState();
        const f = frame();
        st.updateUndoable((s) => splitItemsAtFrame(s, f, resolveSplitTargets(s, f, st.selectedItemIds)));
      },
      toggleSnapping: () => api.getState().toggleSnapping(),

      setTool: (tool) => api.getState().setCanvasTool(tool),

      setZoom: (zoom) => api.getState().setCanvasZoom(zoom),
      zoomIn: () => api.getState().setCanvasZoom(effectiveZoom() * 2),
      zoomOut: () => api.getState().setCanvasZoom(effectiveZoom() / 2),
      fitZoom: () => api.getState().setCanvasZoom('fit'),

      save: () => saveState(api, deps),
      downloadState: () => downloadStateFile(api),
      loadState: (file) => loadStateFromFile(api, deps, file),
      cleanupAssets: () => cleanupDeletedAssets(api, deps),
      render: (codec) => startRender(api, deps, codec),
    };
  }, [api, deps, refs]);
}
