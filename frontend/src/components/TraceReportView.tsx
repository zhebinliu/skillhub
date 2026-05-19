/**
 * TRACE 评测报告完整视图。参考 SkillHub 评测报告设计:
 * 顶部维度说明 → 雷达图 + 综合分 + 一句话评价 → 5 维卡片(进度条 + 数值 + 解释)→ 改进建议
 */
import { Info, Lightbulb, ShieldAlert } from 'lucide-react';
import { Report, TraceDim } from '../lib/api';
import RadarChart from './RadarChart';
import { verdictMeta } from '../lib/format';

const TRACE_FULL: Record<TraceDim, { letter: string; en: string; cn: string; color: string }> = {
  trust:         { letter: 'T', en: 'Trust',         cn: '信任性', color: '#34d399' },  // emerald
  reliability:   { letter: 'R', en: 'Reliability',   cn: '可靠性', color: '#60a5fa' },  // blue
  adaptability:  { letter: 'A', en: 'Adaptability',  cn: '适用性', color: '#fbbf24' },  // amber
  convention:    { letter: 'C', en: 'Convention',    cn: '规范性', color: '#f472b6' },  // pink
  effectiveness: { letter: 'E', en: 'Effectiveness', cn: '有效性', color: '#a78bfa' },  // violet
};

const TRACE_KEYS: TraceDim[] = ['trust', 'reliability', 'adaptability', 'convention', 'effectiveness'];

function stars(score: number): { full: number; half: boolean } {
  const x = (score / 20) * 2;
  const full = Math.floor(x / 2);
  const half = x % 2 >= 1;
  return { full, half };
}

export default function TraceReportView({ report }: { report: Report }) {
  const v = verdictMeta(report.verdict);
  const { full, half } = stars(report.score);

  const axes = TRACE_KEYS.map((k) => {
    const meta = TRACE_FULL[k];
    const d = report.dimensions[k];
    return {
      key: k,
      label: `${meta.letter} ${meta.cn}`,
      value: d?.score ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* 维度说明 */}
      <div className="rounded-2xl border border-iris-500/20 bg-iris-500/[0.04] p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-warm" />
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-iris-500/20 flex items-center justify-center shrink-0">
            <Info className="h-4 w-4 text-iris-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-zinc-100">TRACE 评测维度说明</div>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
              Skill Hub 的 TRACE 评测体系从{' '}
              <span className="text-emerald-300">信任(Trust)</span>、
              <span className="text-blue-300">可靠性(Reliability)</span>、
              <span className="text-amber-300">适用性(Adaptability)</span>、
              <span className="text-pink-300">规范性(Convention)</span>、
              <span className="text-violet-300">有效性(Effectiveness)</span>{' '}
              五个维度全面评估 Skill 的质量。
            </p>
            <div className="mt-2 text-xs text-amber-300/70 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300 inline-block" />
              评测主要基于 LLM 自动化检测,结果供参考
              {report.llm_model && <span className="text-zinc-500">· {report.llm_model}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* 雷达图 + 综合分 */}
      <div className="surface p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="flex justify-center">
            <RadarChart axes={axes} max={20} size={300} />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <div className={`text-6xl font-bold heading-display ${v.color}`}>
                {(report.score / 20).toFixed(1)}
              </div>
              <div className="text-xl text-zinc-500">/ 5</div>
            </div>
            <div className="mt-2 inline-flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs ring-1 ${v.bg} ${v.color} ${v.ring}`}>
                综合评级 · {v.label}
              </span>
              <span className="text-amber-400 text-lg select-none">
                {'★'.repeat(full)}
                {half ? '⯨' : ''}
                {'☆'.repeat(5 - full - (half ? 1 : 0))}
              </span>
            </div>
            {report.summary && (
              <p className="mt-4 text-sm text-zinc-300 leading-relaxed">{report.summary}</p>
            )}
            <div className="mt-4 text-[10px] text-zinc-600 font-mono">
              共 {report.score} 分 · 5 维度满分 100
              {report.duration_ms != null && ` · 评估用时 ${(report.duration_ms / 1000).toFixed(1)}s`}
            </div>
          </div>
        </div>
      </div>

      {/* 5 维详情 */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wider">评测详情</h3>
        <div className="surface divide-y divide-white/[0.04]">
          {TRACE_KEYS.map((k) => {
            const meta = TRACE_FULL[k];
            const d = report.dimensions[k];
            const score = d?.score ?? 0;
            const pct = (score / 20) * 100;
            return (
              <div key={k} className="p-5">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-6 w-6 rounded-md flex items-center justify-center text-xs font-bold"
                      style={{ background: `${meta.color}26`, color: meta.color }}
                    >
                      {meta.letter}
                    </span>
                    <span className="font-medium text-zinc-100">{meta.en}</span>
                    <span className="text-xs text-zinc-500">· {meta.cn}</span>
                  </div>
                  <div className="text-sm font-mono">
                    <span className="font-semibold">{score}</span>
                    <span className="text-zinc-500">/20</span>
                  </div>
                </div>
                {/* 进度条 */}
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${meta.color}, ${meta.color}dd)`,
                    }}
                  />
                </div>
                {d?.comments && (
                  <p className="text-sm text-zinc-400 leading-relaxed">{d.comments}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 改进建议 */}
      {report.suggestions && report.suggestions.length > 0 && (
        <div className="surface p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-amber-300" />
            <h3 className="text-sm font-semibold text-zinc-100">改进建议</h3>
            <span className="text-xs text-zinc-500">({report.suggestions.length})</span>
          </div>
          <ul className="space-y-2">
            {report.suggestions.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span
                  className={
                    'shrink-0 mt-1 h-2 w-2 rounded-full ' +
                    (s.severity === 'high'
                      ? 'bg-rose-400'
                      : s.severity === 'medium'
                      ? 'bg-amber-400'
                      : 'bg-zinc-500')
                  }
                />
                <div>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 font-mono mr-2">
                    {(s.area || '').toUpperCase()}
                  </span>
                  <span className="text-zinc-300">{s.message}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 安全启发(若有) */}
      {report.clues?.security_risks && report.clues.security_risks.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.04] p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-4 w-4 text-rose-300" />
            <span className="font-semibold text-rose-200">静态安全启发</span>
          </div>
          <ul className="text-sm text-rose-200/90 space-y-1">
            {report.clues.security_risks.map((r, i) => (
              <li key={i}>· {r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
