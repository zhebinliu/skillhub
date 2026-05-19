import { useQuery } from '@tanstack/react-query';
import { GaugeCircle } from 'lucide-react';
import { skillsApi } from '../lib/api';
import TraceReportView from './TraceReportView';
import { relTime } from '../lib/format';

export default function ReportTab({ skillId, isOwner }: { skillId: string; isOwner: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', skillId],
    queryFn: () => skillsApi.reports(skillId),
  });

  if (isLoading) return <div className="text-zinc-500 text-sm">加载中…</div>;
  const latest = data?.items?.[0];

  if (!latest) {
    return (
      <div className="surface p-10 text-center">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-white/[0.04] flex items-center justify-center mb-4">
          <GaugeCircle className="h-6 w-6 text-iris-300" />
        </div>
        <div className="text-lg font-medium mb-1">还没有评测报告</div>
        <div className="text-sm text-zinc-500">
          {isOwner ? '到「我的工作台」对这个 skill 跑一次质检。' : '作者还没跑过质检评估。'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <TraceReportView report={latest} />
      <div className="mt-4 text-[10px] text-zinc-600 font-mono text-right">
        最近评估 {relTime(latest.created_at)}
        {data!.items.length > 1 && <span> · 共 {data!.items.length} 次评测历史</span>}
      </div>
    </div>
  );
}
