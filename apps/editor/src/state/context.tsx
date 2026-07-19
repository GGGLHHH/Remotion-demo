import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  createEditorStore,
  type EditorInitialState,
  type EditorStore,
  type EditorStoreApi,
} from './store';

/**
 * 每实例 store 经 context 下发（照 shadcn useSidebar/useChart 同款守卫模式）：
 * <EditorProvider> 建/持有一个 store，子树用 useEditor(selector) 订阅、useEditorApi() 取裸句柄。
 * 替代原来的全局单例 useEditorStore——一页可多个编辑器、可注入初始态、SSR 友好。
 */
const EditorContext = createContext<EditorStoreApi | null>(null);

export function EditorProvider({
  children,
  store,
  initialState,
}: {
  children: ReactNode;
  /** 受控：外部预建的 store（用于暴露 window.__editorStore / 测试 / 宿主自持） */
  store?: EditorStoreApi;
  /** 非受控：由 Provider 按初始态自建 store */
  initialState?: EditorInitialState;
}) {
  const storeRef = useRef<EditorStoreApi | null>(null);
  if (!storeRef.current) storeRef.current = store ?? createEditorStore(initialState);
  return <EditorContext.Provider value={storeRef.current}>{children}</EditorContext.Provider>;
}

/** 取当前实例的裸 store 句柄，供组件内命令式 getState()/subscribe()（性能敏感的直写 DOM 路径用） */
export function useEditorApi(): EditorStoreApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error('useEditor 必须在 <EditorProvider> 内使用');
  return api;
}

/** 订阅式选择器 hook（替代 useEditorStore）；越界即 throw */
export function useEditor<T>(selector: (s: EditorStore) => T): T {
  return useStore(useEditorApi(), selector);
}
