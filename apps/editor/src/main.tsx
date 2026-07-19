import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import type { UndoableState } from '@gedatou/shared'
import {
  EditorRoot,
  createEditorStore,
  createInstanceRefs,
  restoreLocalUrls,
} from '@gedatou/editor'
import { createHttpTransport, createBrowserStorage } from '@gedatou/editor/adapters'
import { sonnerNotify } from './notify'
import { Toaster } from './toaster'
import { buildDemoState } from './demo-state'

// demo 消费方：组装默认适配器（同源 /api + localStorage/IndexedDB + sonner）
const transport = createHttpTransport()
const storage = createBrowserStorage()
const deps = { transport, storage, notify: sonnerNotify }

// 初始状态：URL hash > localStorage > demo；启动即视为“已保存”（默认 storage 同步返回）
const initialState = (storage.loadProject() as UndoableState | null) ?? buildDemoState()
const editorStore = createEditorStore({ undoable: initialState })
editorStore.setState({ lastSavedState: initialState })
void restoreLocalUrls(editorStore, deps, initialState)
const editorRefs = createInstanceRefs()

// e2e 测试用（仅开发构建）
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__editorStore = editorStore
  ;(window as unknown as Record<string, unknown>).__playerRef = editorRefs.player
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorRoot store={editorStore} refs={editorRefs} deps={deps} />
    {/* 单一深色应用：固定 dark，不跟随系统 */}
    <Toaster theme="dark" richColors position="bottom-right" />
  </StrictMode>,
)
