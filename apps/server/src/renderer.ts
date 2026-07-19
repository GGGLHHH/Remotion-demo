import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { newId, type UndoableState } from '@gedatou/shared';
import { s3 } from './s3';
import { config } from './config';

export type RenderTask = {
  status: 'queued' | 'rendering' | 'done' | 'error';
  progress: number; // 0-1
  url?: string;
  error?: string;
};

export const tasks = new Map<string, RenderTask>();

// 懒初始化：首次渲染才打 bundle + 下载 headless 浏览器，进程内缓存 serveUrl
let serveUrlPromise: Promise<string> | null = null;
const getServeUrl = (): Promise<string> => {
  serveUrlPromise ??= (async () => {
    await ensureBrowser();
    return bundle({
      entryPoint: fileURLToPath(
        new URL('../../../packages/shared/src/composition/entry.tsx', import.meta.url),
      ),
    });
  })();
  return serveUrlPromise;
};

// ponytail: 内存 FIFO 单 worker，任务表随进程重启丢失；需要持久化/并发时换 BullMQ
const queue: (() => Promise<void>)[] = [];
let running = false;
const pump = async (): Promise<void> => {
  if (running) return;
  running = true;
  while (queue.length > 0) await queue.shift()!();
  running = false;
};

export const enqueueRender = (state: UndoableState, codec: 'mp4' | 'webm'): string => {
  const taskId = newId();
  tasks.set(taskId, { status: 'queued', progress: 0 });
  queue.push(async () => {
    const task = tasks.get(taskId)!;
    const outputLocation = path.join(tmpdir(), `render-${taskId}.${codec}`);
    try {
      task.status = 'rendering';
      const serveUrl = await getServeUrl();
      const inputProps = { state };
      const composition = await selectComposition({ serveUrl, id: 'Main', inputProps });
      await renderMedia({
        composition,
        serveUrl,
        inputProps,
        codec: codec === 'mp4' ? 'h264' : 'vp8',
        outputLocation,
        onProgress: ({ progress }) => {
          task.progress = progress;
        },
      });
      const key = `renders/${taskId}.${codec}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: config.s3.bucket,
          Key: key,
          Body: await fs.readFile(outputLocation),
          ContentType: codec === 'mp4' ? 'video/mp4' : 'video/webm',
        }),
      );
      task.url = `${config.s3.publicBaseUrl}/${config.s3.bucket}/${key}`;
      task.progress = 1;
      task.status = 'done';
    } catch (err) {
      task.status = 'error';
      task.error = err instanceof Error ? err.message : String(err);
    } finally {
      await fs.rm(outputLocation, { force: true });
    }
  });
  void pump();
  return taskId;
};
