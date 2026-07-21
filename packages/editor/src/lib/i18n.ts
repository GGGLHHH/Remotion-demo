import { useEditorDeps } from '../state/context';
import { zhMessages } from '../locales/zh';
import type { EditorDeps, EditorT } from '../state/runtime';

// 库内文本解析：库不做 i18n，只提供 (a) 内置 zh 默认字典 zhMessages，(b) 可选注入的 deps.t。
// 组件用 useT()，非 React 模块（拿到 deps）用 tFor(deps)。均先问注入的 t，未命中回落 zh 默认。

const interpolate = (s: string, params?: Record<string, string | number>): string =>
  params ? s.replace(/\{\{(\w+)\}\}/g, (_m, k) => (k in params ? String(params[k]) : `{{${k}}}`)) : s;

/** 解析一条文案：优先消费方注入的 t（返回值非空且不等于 key 本身才采纳），否则回落内置 zh 默认。 */
export function resolveMessage(
  t: EditorT | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  if (t) {
    const r = t(key, params);
    if (r != null && r !== key) return r; // 注入方（如 i18next）自行插值
  }
  return interpolate(zhMessages[key] ?? key, params);
}

/** 非 React 模块用：绑定 deps 的 t（deps 已在这些函数的入参里）。 */
export const tFor =
  (deps: Pick<EditorDeps, 't'>) =>
  (key: string, params?: Record<string, string | number>): string =>
    resolveMessage(deps.t, key, params);

/** React 组件用：从 context 取 deps.t 并绑定。 */
export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const { t } = useEditorDeps();
  return (key, params) => resolveMessage(t, key, params);
}
