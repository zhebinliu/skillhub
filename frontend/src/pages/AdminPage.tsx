import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { adminApi } from '../lib/api';
import { useToast } from '../lib/toast';
import { relTime } from '../lib/format';

export default function AdminPage() {
  const [tab, setTab] = useState<'invites' | 'users'>('invites');

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold heading-display">管理后台</h1>
        <p className="text-sm text-zinc-500 mt-1">发邀请码、看注册用户。</p>
      </div>

      <div className="flex gap-1 p-1 rounded-full glass w-fit mb-6">
        <TabBtn active={tab === 'invites'} onClick={() => setTab('invites')} icon={<KeyRound className="h-4 w-4" />}>
          邀请码
        </TabBtn>
        <TabBtn active={tab === 'users'} onClick={() => setTab('users')} icon={<Users className="h-4 w-4" />}>
          用户
        </TabBtn>
      </div>

      {tab === 'invites' ? <InvitesTab /> : <UsersTab />}
    </div>
  );
}

function TabBtn({
  active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm transition-all inline-flex items-center gap-2 ${
        active ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function InvitesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['invites'],
    queryFn: () => adminApi.listInvites(),
  });

  const [note, setNote] = useState('');
  const [grantsAdmin, setGrantsAdmin] = useState(false);
  const [expDays, setExpDays] = useState<string>('');
  const [copied, setCopied] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      adminApi.createInvite({
        note: note || undefined,
        grants_admin: grantsAdmin,
        expires_in_days: expDays ? Number(expDays) : undefined,
      }),
    onSuccess: (r) => {
      toast(`已生成: ${r.code}`, 'success');
      setNote('');
      setGrantsAdmin(false);
      setExpDays('');
      qc.invalidateQueries({ queryKey: ['invites'] });
    },
    onError: (err: any) => toast(err?.response?.data?.detail || '生成失败', 'error'),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminApi.deleteInvite(id),
    onSuccess: () => {
      toast('已撤销', 'success');
      qc.invalidateQueries({ queryKey: ['invites'] });
    },
    onError: (err: any) => toast(err?.response?.data?.detail || '撤销失败', 'error'),
  });

  return (
    <div className="space-y-6">
      <div className="surface p-5">
        <div className="text-sm font-medium mb-3">生成一条新邀请码</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注(给谁的)"
            className="input md:col-span-2"
          />
          <input
            value={expDays}
            onChange={(e) => setExpDays(e.target.value.replace(/\D/g, ''))}
            placeholder="多少天过期(空=永不)"
            className="input"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-300 px-2">
            <input
              type="checkbox"
              checked={grantsAdmin}
              onChange={(e) => setGrantsAdmin(e.target.checked)}
              className="accent-iris-500"
            />
            授予 admin
          </label>
        </div>
        <button onClick={() => create.mutate()} disabled={create.isPending} className="btn-primary mt-4">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          生成
        </button>
      </div>

      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] text-sm font-medium">
          已有邀请码({data?.items.length || 0})
        </div>
        {isLoading && <div className="p-6 text-zinc-500 text-sm">加载中…</div>}
        {data && data.items.length === 0 && <div className="p-6 text-zinc-500 text-sm">还没生成过</div>}
        <div className="divide-y divide-white/[0.04]">
          {data?.items.map((inv) => {
            const used = !!inv.used_at;
            return (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-iris-300">{inv.code}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inv.code);
                        setCopied(inv.code);
                        setTimeout(() => setCopied(null), 1500);
                      }}
                      className="text-zinc-500 hover:text-zinc-200"
                    >
                      {copied === inv.code ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    {inv.grants_admin && (
                      <span className="chip text-magenta-300 ring-1 ring-magenta-400/30 bg-magenta-400/10">admin</span>
                    )}
                    {used && (
                      <span className="chip text-zinc-400">已使用 · {inv.used_by_username}</span>
                    )}
                  </div>
                  {inv.note && <div className="text-xs text-zinc-500 mt-1">备注:{inv.note}</div>}
                  <div className="text-[10px] text-zinc-600 font-mono mt-1">
                    生成于 {relTime(inv.created_at)}
                    {inv.expires_at && ` · 到期 ${relTime(inv.expires_at)}`}
                  </div>
                </div>
                {!used && (
                  <button
                    onClick={() => del.mutate(inv.id)}
                    className="text-zinc-500 hover:text-rose-300 transition-colors"
                    title="撤销"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => adminApi.listUsers(),
  });
  return (
    <div className="surface overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.06] text-sm font-medium">
        全部用户({data?.items.length || 0})
      </div>
      {isLoading && <div className="p-6 text-zinc-500 text-sm">加载中…</div>}
      <div className="divide-y divide-white/[0.04]">
        {data?.items.map((u) => (
          <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{u.display_name || u.username}</span>
                <span className="text-xs text-zinc-500 font-mono">@{u.username}</span>
                {u.is_admin && <span className="chip text-magenta-300 ring-1 ring-magenta-400/30 bg-magenta-400/10">admin</span>}
                {!u.is_active && <span className="chip text-zinc-500">停用</span>}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">{u.email}</div>
            </div>
            <div className="text-right text-xs text-zinc-500 font-mono">
              <div>{u.skill_count} skill</div>
              <div className="text-zinc-600">注册 {relTime(u.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
