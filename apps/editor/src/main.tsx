import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      {/* 单一深色应用：固定 dark，不跟随系统 */}
      <Toaster theme="dark" richColors position="bottom-right" />
    </TooltipProvider>
  </StrictMode>,
)
