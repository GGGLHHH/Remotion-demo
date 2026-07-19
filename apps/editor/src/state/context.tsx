import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  createEditorStore,
  type EditorInitialState,
  type EditorStore,
  type EditorStoreApi,
} from './store';
import { createInstanceRefs, type EditorInstanceRefs } from './instance-refs';

/**
 * 每实例 store + refs 经 context 下发（照 shadcn useSidebar/useChart 同款守卫模式）：
 * <EditorProvider> 建/持有一个 store 和一个 refs 袋子，子树用 useEditor(selector) 订阅、
 * useEditorApi() 取裸 store、useEditorRefs() 取 player/pan/舞台等实例 refs。
 * 替代原来的全局单例——一页可多个编辑器、可注入初始态、SSR 友好。
 */
const EditorContext = createContext<EditorStoreApi | null>(null);
const EditorRefsContext = createContext<EditorInstanceRefs | null>(null);

export function EditorProvider({
  children,
  store,
  refs,
  initialState,
}: {
  children: ReactNode;
  /** 受控：外部预建的 store（用于暴露 window.__editorStore / 测试 / 宿主自持） */
  store?: EditorStoreApi;
  /** 受控：外部预建的 refs 袋子（用于暴露 window.__playerRef） */
  refs?: EditorInstanceRefs;
  /** 非受控：由 Provider 按初始态自建 store */
  initialState?: EditorInitialState;
}) {
  const storeRef = useRef<EditorStoreApi | null>(null);
  if (!storeRef.current) storeRef.current = store ?? createEditorStore(initialState);
  const refsRef = useRef<EditorInstanceRefs | null>(null);
  if (!refsRef.current) refsRef.current = refs ?? createInstanceRefs();
  return (
    <EditorContext.Provider value={storeRef.current}>
      <EditorRefsContext.Provider value={refsRef.current}>{children}</EditorRefsContext.Provider>
    </EditorContext.Provider>
  );
}

/** 取当前实例的 refs 袋子（player/pan/fitScale/stageEl + getPlayerFrame/subscribeFrame/setPan） */
export function useEditorRefs(): EditorInstanceRefs {
  const refs = useContext(EditorRefsContext);
  if (!refs) throw new Error('useEditorRefs 必须在 <EditorProvider> 内使用');
  return refs;
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
