/**
 * UndoableState 里的 items/assets/groups/transitions 类型上都是 `Record<string, T | undefined>`
 * —— 那个 undefined 表示的是「这个 id 查不到」（旧存档、已删对象、跨实例引用），
 * 是正常路径,不是稀疏数组式的空洞:实际存进去的值永远非空。
 *
 * 所以查询要判空,而遍历不必 —— 这两个函数把遍历时那层多余的 undefined 收掉。
 */

export function dictValues<T>(dict: Record<string, T | undefined>): T[] {
  return Object.values(dict).filter((v): v is T => v !== undefined)
}

export function dictEntries<T>(dict: Record<string, T | undefined>): [string, T][] {
  return Object.entries(dict).filter((e): e is [string, T] => e[1] !== undefined)
}
