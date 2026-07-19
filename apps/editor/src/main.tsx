import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/sonner'
import { createEditorStore } from './state/store'
import { EditorProvider } from './state/context'
import { createInstanceRefs } from './state/instance-refs'
import { restoreLocalUrls } from './persistence/persistence'
import { createHttpTransport } from './lib/adapters/http-transport'
import { createBrowserStorage } from './lib/adapters/browser-storage'
import { sonnerNotify } from './lib/adapters/notify'
import { buildDemoState } from './demo-state'
import type { UndoableState } from '@gedatou/shared'

// demo 消费方：默认适配器（同源 /api + localStorage/IndexedDB + sonner）
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
    <EditorProvider store={editorStore} refs={editorRefs} deps={deps}>
      <TooltipProvider>
        <App />
        {/* 单一深色应用：固定 dark，不跟随系统 */}
        <Toaster theme="dark" richColors position="bottom-right" />
      </TooltipProvider>
    </EditorProvider>
  </StrictMode>,
)
