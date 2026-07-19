import type React from 'react';
import { useEditorApi, useEditorRefs } from '../state/context';
import { addTextItem } from '../lib/add-items';

/** 文本工具：点击画布放置一个自适应尺寸的文本项（不进入行内编辑），随后退出模式 */
export const TextToolOverlay: React.FC<{ scale: number; onDone: () => void }> = ({
  scale,
  onDone,
}) => {
  const editorApi = useEditorApi();
  const refs = useEditorRefs();
  return (
    <div
      className="absolute inset-0 z-30 cursor-text"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const r = e.currentTarget.getBoundingClientRect();
        addTextItem(
          editorApi,
          { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale },
          refs.getPlayerFrame(),
        );
        onDone();
      }}
    />
  );
};
