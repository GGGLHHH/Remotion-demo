import type React from 'react';
import { useEffect } from 'react';
import { cn } from '../lib/utils';
import { useEditor } from '../state/context';
import { useShortcuts } from '../shortcuts/useShortcuts';

/**
 * 外壳行为收口:快捷键 + Escape 退出画布工具 + 上传/渲染/转录未完成时拦刷新。
 * 自拼壳的宿主一行接回这三样（否则会静默丢掉"进行中拦关闭"这类保护）。EditorContainer 内部已调。
 */
export function useEditorChrome(): void {
  useShortcuts();
  const tool = useEditor((s) => s.canvasTool);
  const setCanvasTool = useEditor((s) => s.setCanvasTool);
  const hasActiveUploads = useEditor((s) =>
    Object.values(s.assetStatus).some((st) => st === 'pending-upload' || st === 'in-progress'),
  );
  const hasActiveRenders = useEditor((s) =>
    s.renderingTasks.some((t) => t.status === 'queued' || t.status === 'rendering'),
  );
  const hasActiveCaptioning = useEditor((s) =>
    s.captioningTasks.some((t) => t.status === 'extracting' || t.status === 'transcribing'),
  );

  // Escape 退出画布工具模式
  useEffect(() => {
    if (!tool) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCanvasTool(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool, setCanvasTool]);

  // 上传/渲染/转录未完成时拦截关闭/刷新，避免丢素材或丢进度
  useEffect(() => {
    if (!hasActiveUploads && !hasActiveRenders && !hasActiveCaptioning) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasActiveUploads, hasActiveRenders, hasActiveCaptioning]);
}

/**
 * 编辑器外层容器:纵向 flex 壳 + 调 useEditorChrome()。
 * fill=内嵌（h-full 填父容器）；默认 h-screen 占满视口。布局内容由宿主填 children。
 */
export const EditorContainer: React.FC<{
  fill?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ fill, className, children }) => {
  useEditorChrome();
  return (
    <div className={cn('flex flex-col bg-card text-foreground', fill ? 'h-full' : 'h-screen', className)}>
      {children}
    </div>
  );
};
