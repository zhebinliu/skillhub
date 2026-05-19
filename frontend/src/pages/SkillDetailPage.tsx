import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Settings, Eye } from 'lucide-react';
import { skillsApi } from '../lib/api';
import FileTree from '../components/FileTree';
import FilePreview from '../components/FilePreview';
import { useAuth } from '../lib/auth';
import { bytes, relTime, verdictMeta } from '../lib/format';

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ['skill', id],
    queryFn: () => skillsApi.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (data && !selected) {
      setSelected(data.skill.entry_file || data.tree[0]?.path || null);
    }
  }, [data]); // eslint-disable-line

  if (isLoading) return <div className="p-12 text-center text-zinc-500">加载中…</div>;
  if (error || !data) {
    return (
      <div className="p-12 text-center text-zinc-500">
        skill 不存在,或还未公开。 <Link to="/explore" className="text-iris-400">回到广场</Link>
      </div>
    );
  }

  const s = data.skill;
  const v = verdictMeta(s.latest_verdict);
  const isOwner = !!user && (user.id === s.owner_id || user.is_admin);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* 头 */}
      <div className="mb-6">
        <Link to="/explore" className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1 mb-3">
          <ArrowLeft className="h-3 w-3" />
          回到广场
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold heading-display tracking-tight">{s.name}</h1>
            <div className="text-sm text-zinc-500 mt-1 font-mono">
              {s.owner_display_name || s.owner_username} <span className="text-zinc-700 mx-1">/</span> {s.slug}
              {s.version && <span className="ml-2 text-iris-400">v{s.version}</span>}
            </div>
            {s.description && (
              <p className="text-zinc-300 mt-3 max-w-2xl leading-relaxed">{s.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {s.latest_score != null && (
              <div className={`px-3 py-1.5 rounded-full text-sm ring-1 ${v.bg} ${v.color} ${v.ring}`}>
                <span className="font-mono">{s.latest_score}</span>
                <span className="text-xs opacity-70 ml-1.5">{v.label}</span>
              </div>
            )}
            {!s.is_published && (
              <span className="px-3 py-1.5 rounded-full text-xs bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/30">
                未发布
              </span>
            )}
            {isOwner && (
              <Link to={`/dashboard/skill/${s.id}`} className="btn-ghost">
                <Settings className="h-4 w-4" />
                管理
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500 font-mono">
          <span>{s.file_count} 文件</span>
          <span>·</span>
          <span>{bytes(s.size_bytes)}</span>
          <span>·</span>
          <span>{s.is_published ? '发布于' : '创建于'} {relTime(s.published_at || s.created_at)}</span>
          {s.view_count > 0 && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {s.view_count}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 工作区 */}
      <div className="grid grid-cols-12 gap-4 min-h-[70vh]">
        <aside className="col-span-12 md:col-span-3 surface p-3 overflow-auto max-h-[80vh]">
          <div className="label px-2 py-2 mb-1">文件结构</div>
          <FileTree files={data.tree} selected={selected ?? undefined} onSelect={setSelected} />
        </aside>
        <section className="col-span-12 md:col-span-9 surface overflow-hidden">
          <FilePreview skillId={s.id} path={selected} />
        </section>
      </div>
    </div>
  );
}
