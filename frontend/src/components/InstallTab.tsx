import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Download, MessageSquare, Package, Terminal } from 'lucide-react';
import { skillsApi } from '../lib/api';
import { useToast } from '../lib/toast';

type Tab = 'chat' | 'cli' | 'zip';

const TABS: { key: Tab; icon: any; label: string }[] = [
  { key: 'chat', icon: MessageSquare, label: '通过对话安装' },
  { key: 'cli',  icon: Terminal,      label: '命令行安装' },
  { key: 'zip',  icon: Package,       label: 'Zip 包安装' },
];

export default function InstallTab({ skillId }: { skillId: string }) {
  const [tab, setTab] = useState<Tab>('chat');
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['install', skillId],
    queryFn: () => skillsApi.install(skillId),
  });

  if (isLoading || !data) return <div className="text-zinc-500 text-sm">加载中…</div>;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast('已复制', 'success');
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="space-y-5">
      {/* tab 切换 */}
      <div className="flex gap-1 p-1 rounded-full glass w-fit">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm transition-all ${
              tab === key ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'chat' && (
        <Section
          title={data.chat.title}
          subtitle={data.chat.subtitle}
          body={data.chat.prompt}
          onCopy={() => copy(data.chat.prompt)}
          copied={copied}
        />
      )}
      {tab === 'cli' && (
        <Section
          title={data.cli.title}
          subtitle={data.cli.subtitle}
          body={data.cli.command}
          mono
          onCopy={() => copy(data.cli.command)}
          copied={copied}
        />
      )}
      {tab === 'zip' && (
        <div className="surface p-6 space-y-4">
          <div>
            <div className="font-semibold text-zinc-100">{data.zip.title}</div>
            <div className="text-sm text-zinc-400 mt-1">{data.zip.subtitle}</div>
          </div>
          <a
            href={data.zip.download_url}
            className="btn-primary inline-flex"
            download={data.zip.filename}
          >
            <Download className="h-4 w-4" />
            下载 {data.zip.filename}
          </a>
          <div className="text-xs text-zinc-500 pt-2 border-t border-white/5">
            {data.zip.instruction}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  body,
  mono,
  onCopy,
  copied,
}: {
  title: string;
  subtitle: string;
  body: string;
  mono?: boolean;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="surface p-6 relative">
      <div className="font-semibold text-zinc-100">{title}</div>
      <div className="text-sm text-zinc-400 mt-1 mb-4">{subtitle}</div>

      <div className="relative">
        <pre
          className={`whitespace-pre-wrap break-words rounded-xl bg-black/40 border border-white/[0.06] p-4 text-sm text-zinc-200 ${
            mono ? 'font-mono' : ''
          }`}
        >
          {body}
        </pre>
        <button
          onClick={onCopy}
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
    </div>
  );
}
