import { useEffect, useState } from 'react';
import { Skill, SkillFile } from '../lib/api';
import FileTree from './FileTree';
import FilePreview from './FilePreview';

export default function OverviewTab({
  skillId,
  skill,
  tree,
}: {
  skillId: string;
  skill: Skill;
  tree: SkillFile[];
}) {
  const [selected, setSelected] = useState<string | null>(() => {
    const entry = skill.entry_file;
    if (entry && tree.find((f) => f.path === entry)) return entry;
    return tree[0]?.path || null;
  });
  useEffect(() => {
    if (!selected && tree.length > 0) setSelected(skill.entry_file || tree[0].path);
    // eslint-disable-next-line
  }, [tree]);

  return (
    <div className="grid grid-cols-12 gap-4 min-h-[65vh]">
      <aside className="col-span-12 md:col-span-3 surface p-3 overflow-auto max-h-[80vh]">
        <div className="label px-2 py-2 mb-1">文件结构</div>
        <FileTree files={tree} selected={selected ?? undefined} onSelect={setSelected} />
      </aside>
      <section className="col-span-12 md:col-span-9 surface overflow-hidden">
        <FilePreview skillId={skillId} path={selected} />
      </section>
    </div>
  );
}
