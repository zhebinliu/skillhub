import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { skillsApi, Skill, SkillFile } from '../lib/api';
import FileTree from './FileTree';

export default function OverviewTab({
  skillId,
  skill,
  tree,
}: {
  skillId: string;
  skill: Skill;
  tree: SkillFile[];
}) {
  // 默认选 SKILL.md / README.md
  const [selected, setSelected] = useState<string | null>(() => {
    const entry = skill.entry_file;
    if (entry && tree.find((f) => f.path === entry)) return entry;
    return tree[0]?.path || null;
  });
  useEffect(() => {
    if (!selected && tree.length > 0) setSelected(skill.entry_file || tree[0].path);
    // eslint-disable-next-line
  }, [tree]);

  const { data, isLoading } = useQuery({
    queryKey: ['file', skillId, selected],
    queryFn: () => skillsApi.getFile(skillId, selected!),
    enabled: !!selected,
  });

  return (
    <div className="grid grid-cols-12 gap-4 min-h-[65vh]">
      <aside className="col-span-12 md:col-span-3 surface p-3 overflow-auto max-h-[80vh]">
        <div className="label px-2 py-2 mb-1">文件结构</div>
        <FileTree files={tree} selected={selected ?? undefined} onSelect={setSelected} />
      </aside>
      <section className="col-span-12 md:col-span-9 surface overflow-hidden">
        {!selected && <Placeholder text="左侧点一个文件来预览" />}
        {selected && (
          <div className="h-full flex flex-col">
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div className="font-mono text-xs text-zinc-300 truncate">{selected}</div>
              {data && (
                <div className="text-[10px] text-zinc-500 font-mono">
                  {data.size} B · {data.mime || (data.is_text ? 'text' : 'binary')}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {isLoading && <div className="p-6 text-zinc-500 text-sm">加载中…</div>}
              {data && data.is_text && data.text != null ? (
                /\.md$|^README$|^LICENSE$/i.test(selected) ? (
                  <div className="prose-skill px-8 py-6 max-w-4xl">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {data.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <pre className="px-5 py-4 text-xs font-mono text-zinc-200 whitespace-pre">
                    <code>{data.text}</code>
                  </pre>
                )
              ) : data ? (
                <div className="p-6 text-zinc-500 text-sm">
                  二进制文件,暂不支持预览({data.size} B)
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-sm text-zinc-500">{text}</div>;
}
