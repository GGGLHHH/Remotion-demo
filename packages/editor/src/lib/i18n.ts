import { useEditorDeps } from '../state/context'
import { resolveMessage } from './i18n-core'

// React 组件用的文案 hook。拉 state/context(含模块级 createContext),故与纯内核分开:非 React 模块
// (persistence 等,会进 /adapters bundle)改从 ./i18n-core import tFor/resolveMessage,不经此文件、不把 React 拖进去。
export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const { t } = useEditorDeps()
  return (key, params) => resolveMessage(t, key, params)
}
