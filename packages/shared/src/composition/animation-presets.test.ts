import { describe, expect, it } from 'vitest';
import { createSolidItem } from '../factories';
import { PRESET_IDS, buildPreset } from './animation-presets';

const item = () => ({ ...createSolidItem({ trackId: 't', from: 0, width: 200, height: 100 }), left: 50, top: 30, opacity: 1, durationInFrames: 90 });

describe('buildPreset', () => {
  it('fadeIn:opacity 从 0 到 1,首帧在 0', () => {
    const p = buildPreset('fadeIn', item());
    expect(p.opacity![0]).toMatchObject({ frame: 0, value: 0 });
    expect(p.opacity![p.opacity!.length - 1].value).toBe(1);
  });
  it('fadeOut:末帧 opacity=0、末帧 frame=dur', () => {
    const p = buildPreset('fadeOut', item());
    const last = p.opacity![p.opacity!.length - 1];
    expect(last).toMatchObject({ frame: 90, value: 0 });
  });
  it('slideInLeft:left 从屏外(< item.left)回到 item.left', () => {
    const p = buildPreset('slideInLeft', item());
    expect(p.left![0].value).toBeLessThan(50);
    expect(p.left![p.left!.length - 1].value).toBe(50);
  });
  it('zoomIn:width/height 从 0 到原值', () => {
    const p = buildPreset('zoomIn', item());
    expect(p.width![0].value).toBe(0);
    expect(p.width![p.width!.length - 1].value).toBe(200);
    expect(p.height![p.height!.length - 1].value).toBe(100);
  });
  it('每个 PRESET_ID 都能产出至少一个属性', () => {
    for (const id of PRESET_IDS) expect(Object.keys(buildPreset(id, item())).length).toBeGreaterThan(0);
  });
});
