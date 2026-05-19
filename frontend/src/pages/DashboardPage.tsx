import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, FileCode2, Plus, Upload } from 'lucide-react';
import { skillsApi } from '../lib/api';
import { bytes, relTime, verdictMeta } from '../lib/format';
import { useAuth } from '../lib/auth';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['skills', 'mine'],
    queryFn: () => skillsApi.mine(),
  });

  const items = data?.items || [];
  const published = items.filter((s) => s.is_published).length;
  const drafts = items.length - published;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold heading-display">我的工作台</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {user?.display_name || user?.username},一共 {items.length} 个 skill,{published} 个已发布,{drafts} 个草稿。
          </p>
        </div>
        <Link to="/dashboard/upload" className="btn-primary">
          <Upload className="h-4 w-4" />
          上传新 skill
        </Link>
      </div>

      {isLoading && <div className="text-center text-zinc-500 py-12">加载中…</div>}

      {!isLoading && items.length === 0 && (
        <Link to="/dashboard/upload" className="surface p-12 block text-center group hover:border-iris-400/40 transition-all">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4 group-hover:bg-iris-500/20 transition-colors">
            <Plus className="h-6 w-6 text-iris-300" />
          </div>
          <div className="text-lg font-medium">上传你的第一个 skill</div>
          <div className="text-sm text-zinc-500 mt-1">zip 拖进来,或者整个文件夹选起来一起传。</div>
        </Link>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((s) => {
            const v = verdictMeta(s.latest_verdict);
            return (
              <Link
                key={s.id}
                to={`/dashboard/skill/${s.id}`}
                className="group relative surface p-5 hover:border-white/20 hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold heading-display truncate">{s.name}</h3>
                  {s.is_published ? (
                    <span className="chip text-emerald-300 ring-1 ring-emerald-400/30 bg-emerald-400/10">
                      <Eye className="h-3 w-3" />
                      已发布
                    </span>
                  ) : (
                    <span className="chip text-amber-300 ring-1 ring-amber-400/30 bg-amber-400/10">
                      <EyeOff className="h-3 w-3" />
                      草稿
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 font-mono mb-3 truncate">{s.slug}</div>
                <p className="text-sm text-zinc-400 line-clamp-2 min-h-[2.5rem]">
                  {s.description || <span className="italic text-zinc-600">没写简介</span>}
                </p>
                <div className="mt-3 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-500 inline-flex items-center gap-1">
                    <FileCode2 className="h-3 w-3" /> {s.file_count} · {bytes(s.size_bytes)}
                  </span>
                  {s.latest_score != null ? (
                    <span className={`${v.color}`}>{s.latest_score} 分 · {v.label}</span>
                  ) : (
                    <span className="text-zinc-600">未质检</span>
                  )}
                </div>
                <div className="mt-2 text-[10px] text-zinc-600 font-mono">更新 {relTime(s.updated_at)}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
