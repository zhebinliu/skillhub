import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useRef } from 'react';
import {
  ArrowLeft, ChevronDown, Download, ExternalLink, Eye, EyeOff, GaugeCircle,
  Loader2, Pencil, Trash2, Upload,
} from 'lucide-react';
import { Skill, skillsApi } from '../lib/api';
import FileTree from '../components/FileTree';
import FilePreview from '../components/FilePreview';
import TraceReportView from '../components/TraceReportView';
import { bytes, relTime, skillTitle, verdictMeta } from '../lib/format';
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
    refetchInterval: (q) => ((q.state.data as any)?.skill?.inspecting ? 6000 : false),
  });
  const reports = useQuery({
    queryKey: ['reports', id],
    queryFn: () => skillsApi.reports(id!),
    enabled: !!id,
    refetchInterval: () => (data?.skill?.inspecting ? 6000 : false),
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
    mutationFn: () => skillsApi.inspect(id!),
    onSuccess: (r) => {
      toast(`TRACE 评测完成 — ${(r.report.score / 20).toFixed(1)}/5`, 'success');
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

  const patchMut = useMutation({
    mutationFn: (body: { display_name?: string; description?: string }) => skillsApi.patch(id!, body),
    onSuccess: () => {
      toast('已更新', 'success');
      qc.invalidateQueries({ queryKey: ['skill', id] });
      qc.invalidateQueries({ queryKey: ['skills', 'mine'] });
      qc.invalidateQueries({ queryKey: ['skills', 'landing'] });
    },
    onError: (err: any) => toast(err?.response?.data?.detail || '更新失败', 'error'),
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
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold heading-display">{skillTitle(s)}</h1>
            <button
              onClick={() => {
                const cur = s.display_name || '';
                const name = window.prompt('改这个 skill 的显示名(中文,留空恢复用技术名):', cur);
                if (name == null) return;
                const trimmed = name.trim();
                if (trimmed === cur) return;
                patchMut.mutate({ display_name: trimmed });
              }}
              className="text-zinc-500 hover:text-zinc-200 transition-colors"
              title="改显示名"
              disabled={patchMut.isPending}
            >
              <Pencil className="h-4 w-4" />
            </button>
            {s.is_published ? (
              <span className="chip text-emerald-300 ring-1 ring-emerald-400/30 bg-emerald-400/10">
                <Eye className="h-3 w-3" /> 已发布
              </span>
            ) : (
              <span className="chip text-amber-300 ring-1 ring-amber-400/30 bg-amber-400/10">
                <EyeOff className="h-3 w-3" /> 草稿
              </span>
            )}
            {s.inspecting && (
              <span className="chip text-iris-300 ring-1 ring-iris-400/30 bg-iris-500/10 inline-flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-iris-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-iris-400" />
                </span>
                TRACE 评测中
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-1 font-mono">
            <span title="技术名(SKILL.md frontmatter)">{s.name}</span>
            <span className="text-zinc-700 mx-1.5">·</span>
            {s.slug}
            {s.version && <span className="text-iris-400 ml-2">v{s.version}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => inspectMut.mutate()}
            disabled={inspectMut.isPending}
            className="btn-primary"
          >
            {inspectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GaugeCircle className="h-4 w-4" />}
            {inspectMut.isPending ? '评估中(LLM 需 30-90 秒)…' : '跑 TRACE 评测'}
          </button>
          <button
            onClick={() => publishMut.mutate(!s.is_published)}
            disabled={publishMut.isPending}
            className={s.is_published ? 'btn-ghost' : 'btn-primary'}
          >
            {s.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {s.is_published ? '撤回发布' : '发布到广场'}
          </button>
          <UploadVersionButton skill={s} />
          <ExportButton skill={s} />
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

      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-zinc-500 font-mono">
        <span>{s.file_count} 文件</span>
        <span>·</span>
        <span>{bytes(s.size_bytes)}</span>
        <span>·</span>
        <span>更新 {relTime(s.updated_at)}</span>
        {s.latest_score != null && (
          <>
            <span>·</span>
            <span className={v.color}>最新评分 {(s.latest_score / 20).toFixed(1)}/5 · {v.label}</span>
          </>
        )}
      </div>

      {/* TRACE 报告(若有) */}
      {latest && (
        <div className="mb-8">
          <TraceReportView report={latest} />
        </div>
      )}

      {/* 文件结构 + 预览 */}
      <h3 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wider">内容预览</h3>
      <div className="grid grid-cols-12 gap-4 min-h-[55vh]">
        <aside className="col-span-12 md:col-span-3 surface p-3 overflow-auto max-h-[70vh]">
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

// ── 上传新版本按钮 ──────────────────────────────────────────────────────────
// 仅草稿(is_published=false)时可点。已发布的 skill 必须先撤回发布,防止用户
// 拿到的版本悄悄变。
function UploadVersionButton({ skill }: { skill: Skill }) {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const disabled = skill.is_published;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function submitZip(file: File) {
    const version = window.prompt(`新版本号(可选,留空用 frontmatter 里的;当前 v${skill.version || '—'}):`, '');
    if (version === null) return; // 用户取消
    setBusy(true); setOpen(false);
    try {
      await skillsApi.uploadVersionZip(skill.id, file, version.trim() || undefined);
      toast('新版本已收到,TRACE 自动评测中', 'success');
      qc.invalidateQueries({ queryKey: ['skill', skill.id] });
      qc.invalidateQueries({ queryKey: ['reports', skill.id] });
    } catch (err: any) {
      toast(err?.response?.data?.detail || '上传失败', 'error');
    } finally { setBusy(false); }
  }

  async function submitFolder(files: FileList) {
    const version = window.prompt(`新版本号(可选,留空用 frontmatter 里的;当前 v${skill.version || '—'}):`, '');
    if (version === null) return;
    const arr = Array.from(files);
    const paths = arr.map((f: any) => f.webkitRelativePath || f.name);
    const firstSeg = paths[0]?.split('/')[0];
    const allShare = firstSeg && paths.every((p) => p.split('/')[0] === firstSeg);
    const norm = allShare ? paths.map((p) => p.slice(firstSeg.length + 1)) : paths;
    setBusy(true); setOpen(false);
    try {
      await skillsApi.uploadVersionFiles(skill.id, arr, norm, version.trim() || undefined);
      toast('新版本已收到,TRACE 自动评测中', 'success');
      qc.invalidateQueries({ queryKey: ['skill', skill.id] });
      qc.invalidateQueries({ queryKey: ['reports', skill.id] });
    } catch (err: any) {
      toast(err?.response?.data?.detail || '上传失败', 'error');
    } finally { setBusy(false); }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => disabled ? toast('已发布的 skill 不能直接覆盖。先点「撤回发布」', 'error') : setOpen(!open)}
        disabled={busy}
        className={`btn-ghost ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={disabled ? '需先撤回发布' : '上传新版本'}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        新版本
        <ChevronDown className="h-3 w-3 -mr-1" />
      </button>
      {open && !disabled && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-ink-900/95 backdrop-blur-xl border border-white/10 shadow-glow overflow-hidden z-50">
          <button onClick={() => fileRef.current?.click()} className="w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]">
            上传 zip / tar.gz 包
          </button>
          <button onClick={() => folderRef.current?.click()} className="w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06]">
            上传整个文件夹
          </button>
          <div className="px-4 py-2 text-[10px] text-zinc-500 border-t border-white/[0.06]">
            覆盖现有内容并重跑 TRACE。安装次数 / 显示名等保留。
          </div>
        </div>
      )}
      <input
        ref={fileRef} type="file" className="hidden"
        accept=".zip,.tar,.tar.gz,.tgz,application/zip,application/gzip,application/x-tar"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) submitZip(f); e.target.value = ''; }}
      />
      <input
        ref={folderRef} type="file" className="hidden"
        // @ts-ignore
        webkitdirectory="true" directory="" multiple
        onChange={(e) => { const fs = e.target.files; if (fs && fs.length) submitFolder(fs); e.target.value = ''; }}
      />
    </div>
  );
}

// ── 导出按钮(owner / admin 不计 install_count)──────────────────────────────
function ExportButton({ skill }: { skill: Skill }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button onClick={() => setOpen(!open)} className="btn-ghost" title="导出 skill 源码(不计安装次数)">
        <Download className="h-4 w-4" />
        导出
        <ChevronDown className="h-3 w-3 -mr-1" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-xl bg-ink-900/95 backdrop-blur-xl border border-white/10 shadow-glow overflow-hidden z-50">
          <a
            href={skillsApi.exportUrl(skill.id, 'zip')}
            download={`${skill.slug}.zip`}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06]"
          >
            导出为 <span className="font-mono text-iris-300">.zip</span>
          </a>
          <a
            href={skillsApi.exportUrl(skill.id, 'skill')}
            download={`${skill.slug}.skill`}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06]"
          >
            导出为 <span className="font-mono text-iris-300">.skill</span>
            <span className="block text-[10px] text-zinc-500 mt-0.5">部分 AI 客户端识别此后缀自动装</span>
          </a>
          <div className="px-4 py-2 text-[10px] text-zinc-500 border-t border-white/[0.06]">
            owner / admin 限定 · 不计 install_count
          </div>
        </div>
      )}
    </div>
  );
}
