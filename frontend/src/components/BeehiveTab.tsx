import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hexagon, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { skillsApi } from '../lib/api';
import { useToast } from '../lib/toast';
import { relTime } from '../lib/format';

interface Props {
  skillId: string;
  isOwner: boolean;
}

export default function BeehiveTab({ skillId, isOwner }: Props) {
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reports-beehive', skillId],
    queryFn: () => skillsApi.reports(skillId, 'beehive'),
  });

  const mut = useMutation({
    mutationFn: () => skillsApi.inspectBeehive(skillId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports-beehive', skillId] });
      toast('蜂巢评测完成', 'success');
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail || '评测失败,请稍后重试', 'error');
    },
  });

  if (isLoading) return <div className="text-zinc-500 text-sm">加载中…</div>;
  const latest = data?.items?.[0];
  const md = latest?.llm_payload?.markdown || '';

  return (
    <div>
      {/* 顶栏:说明 + 评测按钮 */}
      <div className="surface p-4 mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-9 w-9 rounded-xl bg-iris-400/10 ring-1 ring-iris-400/30 flex items-center justify-center shrink-0">
            <Hexagon className="h-4 w-4 text-iris-300" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">蜂巢规范评审</div>
            <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
              基于《蜂巢平台 Skill 设计规范手册》做规范层面的细查 — 触发场景模拟 / Workflow 动作性 / references 调用说明 / Validation /
              占位符处理 等。<span className="text-zinc-600">TRACE 已覆盖的安全 / 可靠性 / frontmatter 完整等不重复评。</span>
            </div>
          </div>
        </div>
        {isOwner && (
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="btn-primary text-xs px-3 py-1.5 shrink-0"
          >
            {mut.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                评测中…
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                {latest ? '重新评测' : '开始评测'}
              </>
            )}
          </button>
        )}
      </div>

      {!latest ? (
        <div className="surface p-10 text-center">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-iris-400/10 flex items-center justify-center mb-4">
            <Hexagon className="h-6 w-6 text-iris-300" />
          </div>
          <div className="text-lg font-medium mb-1">还没有蜂巢评测报告</div>
          <div className="text-sm text-zinc-500">
            {isOwner ? '点击上方「开始评测」按钮触发蜂巢规范评审。' : '作者还没跑过蜂巢评测。'}
          </div>
        </div>
      ) : (
        <div className="surface p-6">
          {md ? (
            <div className="prose-skill max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {md}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="text-zinc-500 text-sm whitespace-pre-wrap">
              {latest.summary || '(蜂巢评测未返回内容)'}
            </div>
          )}
          <div className="mt-6 pt-4 border-t border-white/[0.05] text-[10px] text-zinc-600 font-mono text-right">
            最近评测 {relTime(latest.created_at)}
            {latest.llm_model && <span> · {latest.llm_model}</span>}
            {(data?.items.length ?? 0) > 1 && <span> · 共 {data!.items.length} 次评测历史</span>}
          </div>
        </div>
      )}
    </div>
  );
}
