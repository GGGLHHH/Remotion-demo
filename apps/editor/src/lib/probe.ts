import { getGifDurationInSeconds } from '@remotion/gif';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

export type ProbeResult =
  | { kind: 'video'; width: number; height: number; durationInSeconds: number; hasAudio: boolean }
  | { kind: 'audio'; durationInSeconds: number }
  | { kind: 'image'; width: number; height: number }
  | { kind: 'gif'; width: number; height: number; durationInSeconds: number };

export const probeFile = async (file: File): Promise<ProbeResult> => {
  if (file.type === 'image/gif') {
    const bmp = await createImageBitmap(file);
    // 官方行为：媒体项自动获得固有时长；解析失败回退 3s（gif 循环播放，item 时长可自由拉伸）
    const url = URL.createObjectURL(file);
    let durationInSeconds = 3;
    try {
      durationInSeconds = await getGifDurationInSeconds(url);
    } catch {
      // 保持默认
    } finally {
      URL.revokeObjectURL(url);
    }
    return { kind: 'gif', width: bmp.width, height: bmp.height, durationInSeconds };
  }
  if (file.type.startsWith('image/')) {
    const bmp = await createImageBitmap(file);
    return { kind: 'image', width: bmp.width, height: bmp.height };
  }
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const durationInSeconds = await input.computeDuration();
  const videoTrack = await input.getPrimaryVideoTrack();
  const audioTrack = await input.getPrimaryAudioTrack();
  if (videoTrack) {
    return {
      kind: 'video',
      width: videoTrack.displayWidth,
      height: videoTrack.displayHeight,
      durationInSeconds,
      hasAudio: audioTrack !== null,
    };
  }
  if (audioTrack) return { kind: 'audio', durationInSeconds };
  throw new Error(`不支持的文件类型: ${file.type || file.name}`);
};
