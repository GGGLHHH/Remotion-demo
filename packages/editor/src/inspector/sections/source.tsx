import type React from 'react';
import { CloudUploadIcon } from 'lucide-react';
import type { AssetStatus, EditorStarterAsset } from '@gedatou/shared';
import { Badge } from '../../components/ui/badge';
import { useEditor } from '../../state/context';
import { useT } from '../../lib/i18n';
import { Section } from '../fields';

// ---- 源信息（官方 Source 区：文件名 / 时长 / 大小 + 云图标） ----

/** 字节数转人类可读 */
const formatBytes = (n: number): string => {
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log2(n) / 10));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatSeconds = (s: number): string => {
  const t = Math.round(s);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const UPLOAD_STATUS_KEY: Record<AssetStatus, string> = {
  'pending-upload': 'inspector.statusPendingUpload',
  'in-progress': 'inspector.statusInProgress',
  uploaded: 'inspector.statusUploaded',
  error: 'inspector.statusError',
};

export const SourceSection: React.FC<{ asset: EditorStarterAsset }> = ({ asset }) => {
  const t = useT();
  const status = useEditor((s) => s.assetStatus[asset.id]);
  const progress = useEditor((s) => s.uploadProgress[asset.id]);
  const duration =
    asset.type === 'video' || asset.type === 'audio' || asset.type === 'gif'
      ? asset.durationInSeconds
      : null;
  return (
    <Section title={t('inspector.source')} collapsible defaultOpen>
      <div className="break-all text-xs">{asset.filename}</div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {duration !== null ? <span className="tabular-nums">{formatSeconds(duration)}</span> : null}
        <span className="flex items-center gap-1">
          <CloudUploadIcon className="size-3.5" />
          {formatBytes(asset.sizeInBytes)}
        </span>
        {/* 上传未完成/失败才显示状态（官方无此行，仅作瞬时提示） */}
        {status && status !== 'uploaded' ? (
          <Badge variant={status === 'error' ? 'destructive' : 'secondary'}>
            {status === 'in-progress' && progress !== undefined
              ? t('inspector.uploading', { progress })
              : t(UPLOAD_STATUS_KEY[status])}
          </Badge>
        ) : null}
      </div>
    </Section>
  );
};
