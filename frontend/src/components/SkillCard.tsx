import { Link } from 'react-router-dom';
import { FileCode2, Sparkles } from 'lucide-react';
import { Skill } from '../lib/api';
import { bytes, relTime, verdictMeta } from '../lib/format';

export default function SkillCard({ skill, to }: { skill: Skill; to?: string }) {
  const v = verdictMeta(skill.latest_verdict);
  const target = to || `/skill/${skill.id}`;
  return (
    <Link
      to={target}
      className="group relative block rounded-2xl glass p-5 hover:border-white/20 transition-all overflow-hidden hover:-translate-y-0.5 hover:shadow-glow"
    >
      <div className="absolute -top-px right-0 left-1/3 h-px bg-gradient-to-r from-transparent via-iris-400/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold heading-display tracking-tight truncate group-hover:text-iris-200 transition-colors">
            {skill.name}
          </h3>
          <div className="text-xs text-zinc-500 mt-0.5 truncate font-mono">
            {skill.owner_display_name || skill.owner_username || '—'} / {skill.slug}
          </div>
        </div>
        {skill.latest_score != null && (
          <div className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-mono ring-1 ${v.bg} ${v.color} ${v.ring}`}>
            {skill.latest_score}
            <span className="opacity-60 ml-1 text-[10px]">{v.label}</span>
          </div>
        )}
      </div>

      <p className="text-sm text-zinc-400 line-clamp-3 min-h-[3.75rem]">
        {skill.description || <span className="italic text-zinc-600">作者还没写简介</span>}
      </p>

      <div className="mt-4 flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
        <span className="inline-flex items-center gap-1">
          <FileCode2 className="h-3 w-3" />
          {skill.file_count} 文件
        </span>
        <span>·</span>
        <span>{bytes(skill.size_bytes)}</span>
        <span>·</span>
        <span>{relTime(skill.published_at || skill.created_at)}</span>
        {skill.version && (
          <>
            <span>·</span>
            <span className="text-iris-400">v{skill.version}</span>
          </>
        )}
      </div>

      {skill.latest_verdict === 'excellent' && (
        <div className="absolute top-3 right-3 text-iris-400/0 group-hover:text-iris-400/80 transition-colors">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      )}
    </Link>
  );
}
