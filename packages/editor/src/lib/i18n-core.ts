import type { EditorDeps, EditorT } from '../state/runtime'
import { enMessages } from '../locales/en'

// 库内文本解析的**纯**内核:零 React / 零 state/context 依赖,可被非 React 模块(persistence 等,进 /adapters
// bundle)安全 import 而不把 React+zustand 传递性拖进来。React 组件用的 useT() 在 ./i18n(单独文件,拉 context)。
// 库不做 i18n,只提供 (a) 内置 en 默认字典 enMessages(对齐官方英文 UI),(b) 可选注入的 deps.t。

function interpolate(s: string, params?: Record<string, string | number>): string {
  return params ? s.replace(/\{\{(\w+)\}\}/g, (_m: string, k: string) => (k in params ? String(params[k]) : `{{${k}}}`)) : s
}

/** 解析一条文案:优先消费方注入的 t(返回值非空且不等于 key 本身才采纳),否则回落内置 en 默认。 */
export function resolveMessage(
  t: EditorT | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  if (t) {
    const r = t(key, params)
    if (r != null && r !== key)
      return r // 注入方(如 i18next)自行插值
  }
  return interpolate(enMessages[key] ?? key, params)
}

/** 非 React 模块用:绑定 deps 的 t(deps 已在这些函数的入参里)。 */
export function tFor(deps: Pick<EditorDeps, 't'>) {
  return (key: string, params?: Record<string, string | number>): string =>
    resolveMessage(deps.t, key, params)
}
