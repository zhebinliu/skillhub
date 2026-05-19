import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { Download, Eye, FileX } from 'lucide-react';
import { skillsApi } from '../lib/api';
import { bytes } from '../lib/format';

// 扩展名 → highlight.js 语言
const HL_LANG: Record<string, string> = {
  py: 'python', pyi: 'python',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
  java: 'java', kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cxx: 'cpp',
  swift: 'swift', m: 'objectivec', mm: 'objectivec',
  lua: 'lua', pl: 'perl', r: 'r', jl: 'julia',
  html: 'xml', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  ini: 'ini', cfg: 'ini', conf: 'ini',
  dockerfile: 'dockerfile', makefile: 'makefile',
  vue: 'xml', astro: 'xml',
};

const FILENAME_LANG: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gemfile: 'ruby',
  rakefile: 'ruby',
};

function guessLang(path: string): string | null {
  const name = path.split('/').pop()!.toLowerCase();
  if (FILENAME_LANG[name]) return FILENAME_LANG[name];
  const m = name.match(/\.([a-z0-9]+)$/);
  if (m && HL_LANG[m[1]]) return HL_LANG[m[1]];
  return null;
}

const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']);
const PDF_EXT = new Set(['pdf']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v']);
const AUDIO_EXT = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac']);
const OFFICE_EXT = new Set([
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'odt', 'ods', 'odp', 'rtf', 'pages', 'numbers', 'key',
]);

function extOf(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export default function FilePreview({ skillId, path }: { skillId: string; path: string | null }) {
  const ext = path ? extOf(path) : '';
  const isImage = IMG_EXT.has(ext);
  const isPdf = PDF_EXT.has(ext);
  const isVideo = VIDEO_EXT.has(ext);
  const isAudio = AUDIO_EXT.has(ext);
  const isOffice = OFFICE_EXT.has(ext);

  // 非文本类的直接走 raw URL,不调 /file
  const needsFileApi = !!path && !isImage && !isPdf && !isVideo && !isAudio && !isOffice;

  const { data, isLoading, error } = useQuery({
    queryKey: ['file', skillId, path],
    queryFn: () => skillsApi.getFile(skillId, path!),
    enabled: needsFileApi,
  });

  if (!path) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm">
        <Eye className="h-8 w-8 mb-3 opacity-40" />
        左侧点一个文件来预览
      </div>
    );
  }

  const rawUrl = skillsApi.rawUrl(skillId, path);
  const downloadBtn = (
    <a href={rawUrl} download className="btn-ghost inline-flex" title="下载这个文件">
      <Download className="h-4 w-4" />
      下载文件
    </a>
  );

  // ── 图片 ──────────────────────────────────────────────
  if (isImage) {
    return (
      <PreviewFrame path={path} extraInfo={ext.toUpperCase()}>
        <div className="p-6 flex items-center justify-center min-h-[300px]">
          <img
            src={rawUrl}
            alt={path}
            className="max-w-full max-h-[70vh] rounded-lg shadow-glow object-contain bg-black/30"
          />
        </div>
      </PreviewFrame>
    );
  }

  // ── PDF ───────────────────────────────────────────────
  if (isPdf) {
    return (
      <PreviewFrame path={path} extraInfo="PDF" right={downloadBtn}>
        <iframe
          src={rawUrl}
          title={path}
          className="w-full h-[75vh] bg-white"
        />
      </PreviewFrame>
    );
  }

  // ── 视频 ──────────────────────────────────────────────
  if (isVideo) {
    return (
      <PreviewFrame path={path} extraInfo={ext.toUpperCase()} right={downloadBtn}>
        <div className="p-6 flex items-center justify-center bg-black/40">
          <video src={rawUrl} controls className="max-w-full max-h-[70vh] rounded-lg" />
        </div>
      </PreviewFrame>
    );
  }

  // ── 音频 ──────────────────────────────────────────────
  if (isAudio) {
    return (
      <PreviewFrame path={path} extraInfo={ext.toUpperCase()} right={downloadBtn}>
        <div className="p-10 flex items-center justify-center">
          <audio src={rawUrl} controls className="w-full max-w-xl" />
        </div>
      </PreviewFrame>
    );
  }

  // ── Office (.docx 等)──暂不支持,给下载兜底 ─────────
  if (isOffice) {
    return (
      <PreviewFrame path={path} extraInfo={ext.toUpperCase()}>
        <div className="p-12 flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
            <FileX className="h-6 w-6 text-zinc-400" />
          </div>
          <div className="text-lg font-medium mb-1">Office 文档暂不支持在线预览</div>
          <div className="text-sm text-zinc-500 mb-5">
            支持原生 markdown / 代码 / 图片 / PDF / 音视频在线看;Word / Excel / PPT 类请下载查看。
          </div>
          <a href={rawUrl} download className="btn-primary">
            <Download className="h-4 w-4" />
            下载 {path.split('/').pop()}
          </a>
        </div>
      </PreviewFrame>
    );
  }

  // ── 文本(走 /file)─────────────────────────────────
  if (isLoading) {
    return <div className="p-6 text-zinc-500 text-sm">加载中…</div>;
  }
  if (error || !data) {
    const detail = (error as any)?.response?.data?.detail || '加载失败';
    return (
      <div className="p-6 text-rose-300 text-sm flex items-center gap-2">
        <FileX className="h-4 w-4" />
        {detail}
      </div>
    );
  }

  const isMd = /\.md$|^README$|^LICENSE$/i.test(path);

  return (
    <PreviewFrame
      path={path}
      extraInfo={`${
        data.truncated ? `${bytes(data.size)} / ${bytes(data.full_size)}` : bytes(data.size)
      } · ${data.mime || (data.is_text ? 'text' : 'binary')}`}
    >
      {data.truncated && (
        <div className="px-5 py-2 text-[11px] text-amber-300 bg-amber-400/[0.06] border-b border-amber-400/20">
          ⚠ 文件超过预览上限,只展示前 {bytes(data.size)},完整 {bytes(data.full_size)}。
          <a href={rawUrl} download className="underline ml-1">下载完整文件</a>
        </div>
      )}
      <div className="overflow-auto">
        {data.is_text && data.text != null ? (
          isMd ? (
            <div className="prose-skill px-8 py-6 max-w-4xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {data.text}
              </ReactMarkdown>
            </div>
          ) : (
            <CodeBlock path={path} text={data.text} />
          )
        ) : (
          <div className="p-6 text-zinc-500 text-sm">
            二进制文件,暂不支持预览({bytes(data.full_size)})
          </div>
        )}
      </div>
    </PreviewFrame>
  );
}

function CodeBlock({ path, text }: { path: string; text: string }) {
  const lang = guessLang(path);

  // 行号 + 高亮的代码 HTML
  const html = useMemo(() => {
    let inner = '';
    if (lang) {
      try {
        inner = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
      } catch {
        inner = escapeHtml(text);
      }
    } else {
      // 没识别出语言:尝试 auto-detect,失败就 escape
      try {
        inner = hljs.highlightAuto(text).value;
      } catch {
        inner = escapeHtml(text);
      }
    }
    return inner;
  }, [text, lang]);

  const lineCount = text.split('\n').length;
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join('\n'),
    [lineCount]
  );

  return (
    <div className="flex text-xs font-mono leading-[1.6]">
      <pre className="select-none text-right text-zinc-600 px-3 py-4 border-r border-white/[0.04] bg-white/[0.02]">
        {lineNumbers}
      </pre>
      <pre className="flex-1 overflow-x-auto px-4 py-4 text-zinc-200">
        <code
          className={`hljs language-${lang || 'plaintext'}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function PreviewFrame({
  path,
  extraInfo,
  right,
  children,
}: {
  path: string;
  extraInfo?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0 gap-3">
        <div className="font-mono text-xs text-zinc-300 truncate flex-1">{path}</div>
        {extraInfo && <div className="text-[10px] text-zinc-500 font-mono shrink-0">{extraInfo}</div>}
        {right && <div className="shrink-0">{right}</div>}
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
