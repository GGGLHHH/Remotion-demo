import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { createEditorStore } from './state/store'
import { EditorProvider } from './state/context'
import { playerRef } from './canvas/player-ref'
import { resolveInitialState, restoreLocalUrls } from './persistence/persistence'
import { buildDemoState } from './demo-state'

// 初始状态：URL hash > localStorage > demo；启动即视为“已保存”
const initialState = resolveInitialState() ?? buildDemoState()
const editorStore = createEditorStore({ undoable: initialState })
editorStore.setState({ lastSavedState: initialState })
void restoreLocalUrls(editorStore, initialState)

// e2e 测试用（仅开发构建）
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__editorStore = editorStore
  ;(window as unknown as Record<string, unknown>).__playerRef = playerRef
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorProvider store={editorStore}>
      <TooltipProvider>
        <App />
        {/* 单一深色应用：固定 dark，不跟随系统 */}
        <Toaster theme="dark" richColors position="bottom-right" />
      </TooltipProvider>
    </EditorProvider>
  </StrictMode>,
)
