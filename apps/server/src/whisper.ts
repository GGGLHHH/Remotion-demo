import path from 'node:path';
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
  type WhisperModel,
} from '@remotion/install-whisper-cpp';
import type { Caption } from '@editor/shared';

const WHISPER_VERSION = '1.5.5';
const WHISPER_DIR = path.join(import.meta.dirname, '..', '.whisper');

// base 模型小、e2e 快；生产中文识别建议 WHISPER_MODEL=medium（多语种，效果明显更好）
const MODEL = (process.env.WHISPER_MODEL ?? 'base') as WhisperModel;

// 懒初始化：首次转录才编译 whisper.cpp + 下载模型（几分钟）；失败清空以便重试
let ready: Promise<void> | null = null;
const ensureWhisper = (): Promise<void> => {
  if (!ready) {
    ready = (async () => {
      await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION });
      await downloadWhisperModel({ model: MODEL, folder: WHISPER_DIR });
    })();
    ready.catch(() => {
      ready = null;
    });
  }
  return ready;
};

/** 转录 16kHz 单声道 WAV，返回 @remotion/captions 结构的逐词字幕 */
export const transcribeAudio = async (wavPath: string): Promise<Caption[]> => {
  await ensureWhisper();
  const whisperCppOutput = await transcribe({
    inputPath: wavPath,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model: MODEL,
    modelFolder: WHISPER_DIR,
    tokenLevelTimestamps: true,
    printOutput: false,
  });
  return toCaptions({ whisperCppOutput }).captions;
};
