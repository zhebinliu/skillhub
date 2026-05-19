import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Eye, FileX } from 'lucide-react';
import { skillsApi } from '../lib/api';
import { bytes } from '../lib/format';

export default function FilePreview({ skillId, path }: { skillId: string; path: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['file', skillId, path],
    queryFn: () => skillsApi.getFile(skillId, path!),
    enabled: !!path,
  });

  if (!path) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm">
        <Eye className="h-8 w-8 mb-3 opacity-40" />
        左侧点一个文件来预览
      </div>
    );
  }

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
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
        <div className="font-mono text-xs text-zinc-300 truncate">{path}</div>
        <div className="text-[10px] text-zinc-500 font-mono">
          {data.truncated ? `${bytes(data.size)} / ${bytes(data.full_size)}` : bytes(data.size)} ·{' '}
          {data.mime || (data.is_text ? 'text' : 'binary')}
        </div>
      </div>
      {data.truncated && (
        <div className="px-5 py-2 text-[11px] text-amber-300 bg-amber-400/[0.06] border-b border-amber-400/20">
          ⚠ 文件超过预览上限,只展示前 {bytes(data.size)},完整 {bytes(data.full_size)}。在「版本历史」tab 下载 zip 看全部。
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {data.is_text && data.text != null ? (
          isMd ? (
            <div className="prose-skill px-8 py-6 max-w-4xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {data.text}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="px-5 py-4 text-xs font-mono text-zinc-200 whitespace-pre">
              <code>{data.text}</code>
            </pre>
          )
        ) : (
          <div className="p-6 text-zinc-500 text-sm">
            二进制文件,暂不支持预览({bytes(data.full_size)})
          </div>
        )}
      </div>
    </div>
  );
}
