import { useQuery } from '@tanstack/react-query';
import { Clock, Download } from 'lucide-react';
import { skillsApi } from '../lib/api';
import { bytes, relTime } from '../lib/format';

export default function VersionsTab({ skillId }: { skillId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['versions', skillId],
    queryFn: () => skillsApi.versions(skillId),
  });

  if (isLoading) return <div className="text-zinc-500 text-sm">加载中…</div>;
  const items = data?.items || [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        当前版本管理:每个 skill 一条记录。后续支持上传新版本时,在这里串成时间线。
      </p>
      <div className="surface divide-y divide-white/[0.04]">
        {items.map((v, i) => (
          <div key={i} className="p-5 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-iris-300 text-sm">
                  v{v.version}
                </span>
                {v.is_current && (
                  <span className="chip text-emerald-300 ring-1 ring-emerald-400/30 bg-emerald-400/10">
                    最新
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500 mt-1 font-mono inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                上传 {relTime(v.created_at)}
                {v.published_at && <span>· 发布 {relTime(v.published_at)}</span>}
                <span>· {v.file_count} 文件 · {bytes(v.size_bytes)}</span>
              </div>
            </div>
            <a
              href={skillsApi.downloadUrl(skillId)}
              className="btn-ghost"
              download
            >
              <Download className="h-4 w-4" />
              下载
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
