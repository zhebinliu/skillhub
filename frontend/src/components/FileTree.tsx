import { useMemo } from 'react';
import { ChevronRight, File, FileCode, FileText, Folder } from 'lucide-react';
import { SkillFile } from '../lib/api';
import { clsx } from 'clsx';

interface Node {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  isText?: boolean;
  children: Node[];
}

function buildTree(files: SkillFile[]): Node {
  const root: Node = { name: '', path: '', isDir: true, children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let cur = root;
    parts.forEach((p, i) => {
      const isLast = i === parts.length - 1;
      let child = cur.children.find((c) => c.name === p);
      if (!child) {
        child = {
          name: p,
          path: isLast ? f.path : parts.slice(0, i + 1).join('/'),
          isDir: !isLast,
          size: isLast ? f.size : undefined,
          isText: isLast ? f.is_text : undefined,
          children: [],
        };
        cur.children.push(child);
      }
      cur = child;
    });
  }
  // 排序:目录在前,字母序
  const sort = (n: Node) => {
    n.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function fileIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md') || lower === 'readme' || lower === 'license') return <FileText className="h-3.5 w-3.5" />;
  if (/\.(py|js|ts|tsx|jsx|sh|json|yaml|yml|toml|html|css)$/.test(lower)) return <FileCode className="h-3.5 w-3.5" />;
  return <File className="h-3.5 w-3.5" />;
}

export default function FileTree({
  files, selected, onSelect,
}: {
  files: SkillFile[];
  selected?: string;
  onSelect: (path: string) => void;
}) {
  const root = useMemo(() => buildTree(files), [files]);
  return (
    <div className="text-sm font-mono">
      {root.children.map((c) => (
        <TreeNode key={c.path} node={c} depth={0} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TreeNode({
  node, depth, selected, onSelect,
}: { node: Node; depth: number; selected?: string; onSelect: (p: string) => void }) {
  // 直接全展开(skill 一般不大),只在 dir 上加图标
  if (node.isDir) {
    return (
      <div>
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-zinc-300"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <ChevronRight className="h-3 w-3 text-zinc-600" />
          <Folder className="h-3.5 w-3.5 text-iris-400/80" />
          <span className="truncate">{node.name}</span>
        </div>
        <div>
          {node.children.map((c) => (
            <TreeNode key={c.path} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      </div>
    );
  }
  const active = selected === node.path;
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={clsx(
        'group w-full flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors',
        active ? 'bg-iris-500/15 text-iris-200' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
      )}
      style={{ paddingLeft: `${depth * 14 + 22}px` }}
    >
      <span className={active ? 'text-iris-400' : 'text-zinc-500 group-hover:text-zinc-300'}>
        {fileIcon(node.name)}
      </span>
      <span className="truncate flex-1">{node.name}</span>
      {node.size != null && (
        <span className="text-[10px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
          {fmt(node.size)}
        </span>
      )}
    </button>
  );
}

function fmt(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}
