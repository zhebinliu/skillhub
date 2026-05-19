import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderUp, Loader2, Package, UploadCloud } from 'lucide-react';
import { skillsApi } from '../lib/api';
import { useToast } from '../lib/toast';

type Mode = 'archive' | 'folder';

export default function UploadPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('archive');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const archiveRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const submitArchive = async (file: File) => {
    if (busy) return;
    setBusy(true);
    try {
      const { skill } = await skillsApi.uploadZip(file, file.name);
      toast('已收到 skill,先存为草稿', 'success');
      nav(`/dashboard/skill/${skill.id}`);
    } catch (err: any) {
      toast(err?.response?.data?.detail || '上传失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitFolder = async (files: FileList) => {
    if (busy) return;
    const arr = Array.from(files);
    const paths = arr.map((f: any) => f.webkitRelativePath || f.name);
    // 去掉外层公共目录前缀(folder picker 总会有一个 root)
    const firstSeg = paths[0]?.split('/')[0];
    const allShare = firstSeg && paths.every((p) => p.split('/')[0] === firstSeg);
    const norm = allShare ? paths.map((p) => p.slice(firstSeg.length + 1)) : paths;
    const nameHint = allShare ? firstSeg : undefined;
    setBusy(true);
    try {
      const { skill } = await skillsApi.uploadFiles(arr, norm, nameHint);
      toast('已收到 skill,先存为草稿', 'success');
      nav(`/dashboard/skill/${skill.id}`);
    } catch (err: any) {
      toast(err?.response?.data?.detail || '上传失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!/\.(zip|tar|tar\.gz|tgz)$/i.test(f.name)) {
      toast('只支持 .zip / .tar.gz / .tgz', 'error');
      return;
    }
    submitArchive(f);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold heading-display">上传 skill</h1>
      <p className="text-sm text-zinc-500 mt-1 mb-6">默认存为草稿。预览 + 质检过后再决定要不要发布。</p>

      <div className="flex gap-1 p-1 rounded-full glass w-fit mb-6">
        <button
          onClick={() => setMode('archive')}
          className={`px-4 py-1.5 rounded-full text-sm transition-all inline-flex items-center gap-2 ${
            mode === 'archive' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Package className="h-4 w-4" /> 压缩包
        </button>
        <button
          onClick={() => setMode('folder')}
          className={`px-4 py-1.5 rounded-full text-sm transition-all inline-flex items-center gap-2 ${
            mode === 'folder' ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <FolderUp className="h-4 w-4" /> 文件夹
        </button>
      </div>

      {mode === 'archive' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => archiveRef.current?.click()}
          className={`surface p-12 text-center cursor-pointer transition-all ${
            drag ? 'border-iris-400/60 bg-iris-500/[0.06]' : 'hover:border-white/20'
          } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <input
            ref={archiveRef}
            type="file"
            accept=".zip,.tar,.tar.gz,.tgz,application/zip,application/gzip,application/x-tar"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) submitArchive(f);
            }}
            className="hidden"
          />
          <div className="h-16 w-16 mx-auto rounded-2xl bg-white/[0.05] flex items-center justify-center mb-4">
            {busy ? <Loader2 className="h-6 w-6 animate-spin text-iris-400" /> : <UploadCloud className="h-7 w-7 text-iris-300" />}
          </div>
          <div className="text-lg font-medium">{busy ? '正在上传…' : '把 zip / tar.gz 拖到这里,或点这里选'}</div>
          <div className="text-xs text-zinc-500 mt-2 font-mono">单包 ≤ 50MB · 单文件 ≤ 50MB · 文件数 ≤ 500</div>
        </div>
      ) : (
        <div className="surface p-12 text-center">
          <input
            ref={folderRef}
            type="file"
            // @ts-ignore
            webkitdirectory="true"
            directory=""
            multiple
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length) submitFolder(files);
            }}
            className="hidden"
          />
          <div className="h-16 w-16 mx-auto rounded-2xl bg-white/[0.05] flex items-center justify-center mb-4">
            {busy ? <Loader2 className="h-6 w-6 animate-spin text-iris-400" /> : <FolderUp className="h-7 w-7 text-iris-300" />}
          </div>
          <div className="text-lg font-medium mb-2">选一个 skill 文件夹</div>
          <div className="text-xs text-zinc-500 mb-5 font-mono">浏览器会把整个文件夹的文件一次性发上来。</div>
          <button onClick={() => folderRef.current?.click()} disabled={busy} className="btn-primary">
            {busy ? '正在上传…' : '选择文件夹'}
          </button>
          <div className="text-[11px] text-zinc-600 mt-4">需 Chrome / Edge / Firefox 等支持 webkitdirectory 的浏览器。</div>
        </div>
      )}

      <div className="mt-8 surface p-5 text-sm text-zinc-400 leading-relaxed">
        <div className="font-medium text-zinc-200 mb-2">建议结构</div>
        <pre className="font-mono text-xs text-zinc-300 bg-black/30 rounded-lg p-4 overflow-x-auto">{`my-skill/
├── SKILL.md           ← frontmatter 含 name / description / 可选 allowed-tools
├── README.md          ← 可选,人读的介绍
├── scripts/           ← 可选,辅助脚本
└── references/        ← 可选,要被引用的文档`}</pre>
      </div>
    </div>
  );
}
