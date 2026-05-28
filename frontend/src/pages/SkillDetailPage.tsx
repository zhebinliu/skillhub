import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, GaugeCircle, Hexagon, Layers, Package, Settings } from 'lucide-react';
import { skillsApi } from '../lib/api';
import OverviewTab from '../components/OverviewTab';
import InstallTab from '../components/InstallTab';
import VersionsTab from '../components/VersionsTab';
import ReportTab from '../components/ReportTab';
import BeehiveTab from '../components/BeehiveTab';
import ReactionBar from '../components/ReactionBar';
import CommentsSection from '../components/CommentsSection';
import { useAuth } from '../lib/auth';
import { bytes, relTime, skillTitle, verdictMeta } from '../lib/format';

type Tab = 'overview' | 'install' | 'versions' | 'report' | 'beehive';

const TABS: { key: Tab; icon: any; label: string }[] = [
  { key: 'overview', icon: Layers,       label: '概述' },
  { key: 'install',  icon: Package,      label: '安装方式' },
  { key: 'versions', icon: Download,     label: '版本历史' },
  { key: 'report',   icon: GaugeCircle,  label: '评测报告' },
  { key: 'beehive',  icon: Hexagon,      label: '蜂巢评测' },
];

export default function SkillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  const { data, error, isLoading } = useQuery({
    queryKey: ['skill', id],
    queryFn: () => skillsApi.get(id!),
    enabled: !!id,
  });

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
      <Link to="/explore" className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="h-3 w-3" />
        回到广场
      </Link>

      {/* 头部 */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold heading-display tracking-tight">{skillTitle(s)}</h1>
            <div className="text-sm text-zinc-500 mt-1 font-mono">
              {s.owner_display_name || s.owner_username}
              <span className="text-zinc-700 mx-1">/</span>
              <span title="技术名(英文)">{s.name}</span>
              {s.version && <span className="ml-2 text-iris-400">v{s.version}</span>}
            </div>
            {s.description && (
              <p className="text-zinc-300 mt-3 max-w-2xl leading-relaxed">{s.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ReactionBar skillId={s.id} />
            {s.latest_score != null && (
              <div className={`px-3 py-1.5 rounded-full text-sm ring-1 ${v.bg} ${v.color} ${v.ring}`}>
                <span className="font-mono">{(s.latest_score / 20).toFixed(1)}</span>
                <span className="text-xs opacity-70">/5</span>
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

      {/* tab 切换 */}
      <div className="border-b border-white/[0.06] mb-6">
        <div className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-all whitespace-nowrap ${
                tab === key
                  ? 'border-iris-400 text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* tab 内容 */}
      <div>
        {tab === 'overview' && <OverviewTab skillId={s.id} skill={s} tree={data.tree} />}
        {tab === 'install'  && <InstallTab skillId={s.id} />}
        {tab === 'versions' && <VersionsTab skillId={s.id} />}
        {tab === 'report'   && <ReportTab skillId={s.id} isOwner={isOwner} />}
        {tab === 'beehive'  && <BeehiveTab skillId={s.id} isOwner={isOwner} />}
      </div>

      {/* 评论区(始终显示在底部,不放进 tab) */}
      <CommentsSection skillId={s.id} skillOwnerId={s.owner_id} />
    </div>
  );
}
