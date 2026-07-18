import { getAvailableFonts } from '@remotion/google-fonts';

const available = getAvailableFonts();
const loading = new Map<string, Promise<void>>();

export const listFontFamilies = (): string[] => available.map((f) => f.fontFamily);

/** 懒加载 Google Font；重复调用返回同一 Promise。未知字体静默忽略（走系统回退） */
export const ensureFontLoaded = (family: string): Promise<void> => {
  const cached = loading.get(family);
  if (cached) return cached;
  const entry = available.find((f) => f.fontFamily === family);
  if (!entry) return Promise.resolve();
  // ponytail: loadFont() 全量加载该字体的所有字重/子集，首次略慢；需要更细粒度时按 weights 过滤
  const p = entry
    .load()
    .then((mod) => {
      (mod as { loadFont: () => unknown }).loadFont();
    })
    .catch(() => {
      loading.delete(family);
    });
  loading.set(family, p);
  return p;
};
