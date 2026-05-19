import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { skillsApi } from '../lib/api';
import SkillCard from '../components/SkillCard';

const SORTS = [
  { key: 'recent', label: '最新' },
  { key: 'score', label: '高分优先' },
  { key: 'popular', label: '最热' },
];

export default function ExplorePage() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const { data, isFetching } = useQuery({
    queryKey: ['skills', 'explore', q, sort],
    queryFn: () => skillsApi.listPublished({ q: q || undefined, sort, page_size: 36 }),
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold heading-display">探索 skill</h1>
        <p className="text-sm text-zinc-500 mt-1">所有已发布的 skill,搜搜看有没有顺手能用的。</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜 skill 名 / 描述 / slug"
            className="input pl-10"
          />
        </div>
        <div className="flex gap-1 p-1 rounded-full glass">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                sort === s.key ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {isFetching && !data && (
        <div className="text-center text-zinc-500 py-12">加载中…</div>
      )}

      {data && data.items.length === 0 && (
        <div className="surface p-10 text-center text-zinc-500">没找到匹配的 skill</div>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className="text-xs text-zinc-500 mb-4 font-mono">共 {data.total} 个 skill</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.items.map((s) => (
              <SkillCard key={s.id} skill={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
