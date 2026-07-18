// 与 @remotion/captions 的 Caption 结构一致；shared 不引该包，M7 接入时直接兼容
export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
};
