import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, GaugeCircle, Sparkles, Upload } from 'lucide-react';
import { skillsApi } from '../lib/api';
import SkillCard from '../components/SkillCard';

export default function LandingPage() {
  const { data } = useQuery({
    queryKey: ['skills', 'landing'],
    queryFn: () => skillsApi.listPublished({ sort: 'recent', page_size: 9 }),
  });

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="aurora" />
        <div className="aurora-3" />
        <div className="mx-auto max-w-7xl px-6 pt-20 pb-28 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-xs text-zinc-300 mb-6">
              <Sparkles className="h-3 w-3 text-iris-400" />
              <span>把 skill 当艺术品搭,而不是当一坨 prompt 凑</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold heading-display leading-[1.05] tracking-tight">
              Skill,值得
              <br />
              <span className="text-transparent bg-gradient-warm bg-clip-text">被认真对待。</span>
            </h1>
            <p className="mt-6 text-lg text-zinc-400 max-w-xl leading-relaxed">
              一个属于纷享销客团队的 Claude Skill 仓库。
              <br />
              上传、预览、质检、发布 —— 让你写的 skill,被人愿意点开看完。
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/dashboard/upload" className="btn-primary">
                <Upload className="h-4 w-4" />
                上传我的 skill
              </Link>
              <Link to="/explore" className="btn-ghost">
                逛逛全部
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Feature
                icon={<FileText className="h-4 w-4" />}
                title="文件树 + 渲染预览"
                body="进站就能读完整 SKILL.md,markdown / 代码高亮在线渲染。"
              />
              <Feature
                icon={<GaugeCircle className="h-4 w-4" />}
                title="一键质检 + 评分"
                body="格式 / 触发 / 内容 / 结构四维度打分,Claude 当审稿人。"
              />
              <Feature
                icon={<Sparkles className="h-4 w-4" />}
                title="默认草稿"
                body="上传完先留底,改到满意再发布到广场。不慌不忙。"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Recent skills */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold heading-display">最新上线</h2>
            <p className="text-sm text-zinc-500 mt-1">大家最近发布的 skill。</p>
          </div>
          <Link to="/explore" className="text-sm text-iris-400 hover:text-iris-300 inline-flex items-center gap-1">
            查看全部 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {(!data || data.items.length === 0) ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.items.map((s) => (
              <SkillCard key={s.id} skill={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="surface p-5">
      <div className="h-9 w-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-iris-300 mb-3">
        {icon}
      </div>
      <div className="font-medium text-zinc-100">{title}</div>
      <div className="text-sm text-zinc-400 mt-1 leading-relaxed">{body}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="surface p-10 text-center">
      <div className="text-zinc-400 mb-3">广场上还没有已发布的 skill</div>
      <div className="text-xs text-zinc-500">
        第一个上传 + 发布的人会出现在这里 ✦
      </div>
    </div>
  );
}
