import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, Eye, EyeOff, GaugeCircle, Loader2, Trash2,
} from 'lucide-react';
import { Report, skillsApi } from '../lib/api';
import FileTree from '../components/FileTree';
import FilePreview from '../components/FilePreview';
import { bytes, relTime, verdictMeta } from '../lib/format';
import { useToast } from '../lib/toast';

export default function MySkillPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);

  const { data, error } = useQuery({
    queryKey: ['skill', id],
    queryFn: () => skillsApi.get(id!),
    enabled: !!id,
  });
  const reports = useQuery({
    queryKey: ['reports', id],
    queryFn: () => skillsApi.reports(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (data && !selected) {
      setSelected(data.skill.entry_file || data.tree[0]?.path || null);
    }
  }, [data]); // eslint-disable-line

  const publishMut = useMutation({
    mutationFn: (publish: boolean) => skillsApi.publish(id!, publish),
    onSuccess: (r) => {
      toast(r.skill.is_published ? '已发布到广场' : '已撤回到草稿', 'success');
      qc.invalidateQueries({ queryKey: ['skill', id] });
      qc.invalidateQueries({ queryKey: ['skills', 'mine'] });
      qc.invalidateQueries({ queryKey: ['skills', 'landing'] });
    },
    onError: (err: any) => toast(err?.response?.data?.detail || '操作失败', 'error'),
  });

  const inspectMut = useMutation({
    mutationFn: (mode: 'static' | 'llm' | 'both') => skillsApi.inspect(id!, mode),
    onSuccess: (r) => {
      const label = r.report.mode === 'both' ? '静态+LLM' : r.report.mode === 'static' ? '仅静态' : '仅 LLM';
      toast(`质检完成 (${label},综合 ${r.report.score} 分)`, 'success');
      qc.invalidateQueries({ queryKey: ['reports', id] });
      qc.invalidateQueries({ queryKey: ['skill', id] });
    },
    onError: (err: any) => toast(err?.response?.data?.detail || '质检失败', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: () => skillsApi.remove(id!),
    onSuccess: () => {
      toast('已删除', 'success');
      nav('/dashboard');
    },
    onError: (err: any) => toast(err?.response?.data?.detail || '删除失败', 'error'),
  });

  if (error) {
    return <div className="p-12 text-center text-rose-300">无权限或 skill 不存在</div>;
  }
  if (!data) return <div className="p-12 text-center text-zinc-500">加载中…</div>;

  const s = data.skill;
  const v = verdictMeta(s.latest_verdict);
  const latest = reports.data?.items?.[0];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link to="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="h-3 w-3" />
        返回我的工作台
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold heading-display">{s.name}</h1>
            {s.is_published ? (
              <span className="chip text-emerald-300 ring-1 ring-emerald-400/30 bg-emerald-400/10">
                <Eye className="h-3 w-3" /> 已发布
              </span>
            ) : (
              <span className="chip text-amber-300 ring-1 ring-amber-400/30 bg-amber-400/10">
                <EyeOff className="h-3 w-3" /> 草稿
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-1 font-mono">
            {s.slug} {s.version && <span className="text-iris-400 ml-2">v{s.version}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-full glass overflow-hidden">
            <button
              onClick={() => inspectMut.mutate('static')}
              disabled={inspectMut.isPending}
              className="px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-50"
              title="纯静态启发式评分,秒级返回"
            >
              快检
            </button>
            <button
              onClick={() => inspectMut.mutate('both')}
              disabled={inspectMut.isPending}
              className="px-4 py-2 text-sm text-white bg-gradient-to-r from-ember-500/80 via-magenta-500/80 to-iris-500/80 hover:from-ember-500 hover:via-magenta-500 hover:to-iris-500 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {inspectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GaugeCircle className="h-4 w-4" />}
              {inspectMut.isPending ? '质检中…' : '全面质检'}
            </button>
            <button
              onClick={() => inspectMut.mutate('llm')}
              disabled={inspectMut.isPending}
              className="px-3 py-2 text-xs text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-50"
              title="只跑 LLM 内容评分(10-60s)"
            >
              仅 LLM
            </button>
          </div>
          <button
            onClick={() => publishMut.mutate(!s.is_published)}
            disabled={publishMut.isPending}
            className={s.is_published ? 'btn-ghost' : 'btn-primary'}
          >
            {s.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {s.is_published ? '撤回发布' : '发布到广场'}
          </button>
          <Link to={`/skill/${s.id}`} className="btn-ghost" title="预览公开页">
            <ExternalLink className="h-4 w-4" />
          </Link>
          <button
            onClick={() => {
              if (window.confirm('确认删除整个 skill?文件也会一并清除。')) deleteMut.mutate();
            }}
            disabled={deleteMut.isPending}
            className="btn-ghost text-rose-300 hover:text-rose-200 hover:border-rose-400/40"
            title="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500 font-mono">
        <span>{s.file_count} 文件</span>
        <span>·</span>
        <span>{bytes(s.size_bytes)}</span>
        <span>·</span>
        <span>更新 {relTime(s.updated_at)}</span>
        {s.latest_score != null && (
          <>
            <span>·</span>
            <span className={v.color}>最新评分 {s.latest_score} · {v.label}</span>
          </>
        )}
      </div>

      {latest && <ReportCard report={latest} />}

      <div className="grid grid-cols-12 gap-4 min-h-[65vh] mt-6">
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

const LLM_DIM_LABELS: Record<string, string> = {
  format: '格式合规',
  trigger: '触发清晰',
  content: '内容质量',
  structure: '结构组织',
};

const STATIC_DIM_LABELS: Record<string, string> = {
  matching: '问题-方案匹配度',
  completeness: '完成度',
  error_handling: '容错性',
  description: 'Description 精度',
  efficiency: 'Token 效率',
};

function ratingStars(score: number): string {
  if (score >= 90) return '⭐⭐⭐⭐⭐';
  if (score >= 75) return '⭐⭐⭐⭐';
  if (score >= 60) return '⭐⭐⭐';
  if (score >= 40) return '⭐⭐';
  return '⭐';
}

function ReportCard({ report }: { report: Report }) {
  const [tab, setTab] = React.useState<'static' | 'llm'>(
    report.mode === 'llm' ? 'llm' : 'static'
  );
  const v = verdictMeta(report.verdict);
  const hasBoth = report.mode === 'both' && report.static && report.llm;

  return (
    <div className="surface p-5">
      <div className="flex items-start gap-5">
        <div className="text-center shrink-0">
          <div className={`text-5xl font-bold heading-display ${v.color}`}>{report.score}</div>
          <div className={`text-xs mt-1 ${v.color}`}>{v.label}</div>
          <div className="text-sm mt-1">{ratingStars(report.score)}</div>
        </div>
        <div className="flex-1 min-w-0">
          {report.summary && <p className="text-sm text-zinc-300 leading-relaxed mb-3">{report.summary}</p>}

          {hasBoth && (
            <div className="flex gap-1 mb-3 p-1 glass rounded-full w-fit text-xs">
              <button
                onClick={() => setTab('static')}
                className={`px-3 py-1 rounded-full transition-all ${
                  tab === 'static' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                静态评分 {report.static!.score}/100
              </button>
              <button
                onClick={() => setTab('llm')}
                className={`px-3 py-1 rounded-full transition-all ${
                  tab === 'llm' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                LLM 评分 {report.llm!.score}/100
              </button>
            </div>
          )}

          {hasBoth ? (
            <ReportSliceView slice={tab === 'static' ? report.static! : report.llm!}
                             labelMap={tab === 'static' ? STATIC_DIM_LABELS : LLM_DIM_LABELS}
                             perDim={20} />
          ) : (
            <ReportSliceView slice={{
              mode: report.mode,
              score: report.score,
              verdict: report.verdict,
              dimensions: report.dimensions,
              suggestions: report.suggestions,
              llm_model: report.llm_model,
            }} labelMap={report.mode === 'static' ? STATIC_DIM_LABELS : LLM_DIM_LABELS}
              perDim={report.mode === 'static' ? 20 : 25} />
          )}
        </div>
      </div>
      <div className="mt-4 text-[10px] text-zinc-600 font-mono">
        模式 {report.mode} · {report.llm_model || '无 LLM'} · {report.duration_ms ? `${(report.duration_ms / 1000).toFixed(1)}s` : ''} · {relTime(report.created_at)}
      </div>
    </div>
  );
}

function ReportSliceView({
  slice, labelMap, perDim,
}: { slice: import('../lib/api').ReportSlice; labelMap: Record<string, string>; perDim: number }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {Object.entries(slice.dimensions || {}).map(([key, d]: any) => (
          <div key={key} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider truncate">
              {d.label || labelMap[key] || key}
            </div>
            <div className="text-lg font-semibold mt-0.5">
              {d.score}<span className="text-xs text-zinc-500">/{perDim}</span>
            </div>
            {d.comments && <div className="text-[11px] text-zinc-400 mt-1 line-clamp-4">{d.comments}</div>}
          </div>
        ))}
      </div>
      {slice.suggestions && slice.suggestions.length > 0 && (
        <details className="mt-4" open>
          <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-200">
            改进建议 ({slice.suggestions.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {slice.suggestions.map((s, i) => (
              <li key={i} className="flex gap-2 text-zinc-400">
                <span className={
                  s.severity === 'high' ? 'text-rose-400' :
                  s.severity === 'medium' ? 'text-amber-400' : 'text-zinc-500'
                }>●</span>
                <span><span className="text-zinc-500">[{s.area}]</span> {s.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
