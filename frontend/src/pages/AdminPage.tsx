import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Pencil, Plus, Power, ShieldCheck, Trash2, Users } from 'lucide-react';
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
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => adminApi.listUsers(),
  });

  const [showAdd, setShowAdd] = useState(false);

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => adminApi.patchUser(id, body),
    onSuccess: () => {
      toast('已更新', 'success');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast(err?.response?.data?.detail || '更新失败', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      toast('用户已删除', 'success');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast(err?.response?.data?.detail || '删除失败', 'error'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          管理团队成员。新增用户直接创建账号(免邀请码),也可以撤销 / 禁用 / 删除。
        </p>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
          <Plus className="h-4 w-4" />
          {showAdd ? '收起' : '新增用户'}
        </button>
      </div>

      {showAdd && <AddUserForm onDone={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ['users'] }); }} />}

      <div className="surface overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] text-sm font-medium">
          全部用户({data?.items.length || 0})
        </div>
        {isLoading && <div className="p-6 text-zinc-500 text-sm">加载中…</div>}
        <div className="divide-y divide-white/[0.04]">
          {data?.items.map((u) => (
            <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{u.display_name || u.username}</span>
                  <span className="text-xs text-zinc-500 font-mono">@{u.username}</span>
                  {u.is_admin && (
                    <span className="chip text-magenta-300 ring-1 ring-magenta-400/30 bg-magenta-400/10">admin</span>
                  )}
                  {!u.is_active && <span className="chip text-zinc-500">停用</span>}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">{u.email}</div>
              </div>
              <div className="text-right text-xs text-zinc-500 font-mono mr-3">
                <div>{u.skill_count ?? 0} skill</div>
                <div className="text-zinc-600">注册 {relTime(u.created_at)}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    const cur = u.display_name || u.username;
                    const name = window.prompt(`为 ${u.username} 改昵称(1-64 字):`, cur);
                    if (name != null) {
                      const trimmed = name.trim();
                      if (trimmed && trimmed !== cur) {
                        patchMut.mutate({ id: u.id, body: { display_name: trimmed } });
                      }
                    }
                  }}
                  className="btn-quiet"
                  title="改昵称"
                  disabled={patchMut.isPending}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => patchMut.mutate({ id: u.id, body: { is_admin: !u.is_admin } })}
                  className="btn-quiet"
                  title={u.is_admin ? '取消管理员' : '设为管理员'}
                  disabled={patchMut.isPending}
                >
                  <ShieldCheck className={`h-3.5 w-3.5 ${u.is_admin ? 'text-magenta-300' : ''}`} />
                </button>
                <button
                  onClick={() => patchMut.mutate({ id: u.id, body: { is_active: !u.is_active } })}
                  className="btn-quiet"
                  title={u.is_active ? '停用' : '启用'}
                  disabled={patchMut.isPending}
                >
                  {u.is_active ? <Power className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5 text-emerald-400" />}
                </button>
                <button
                  onClick={() => {
                    const pwd = window.prompt(`为 ${u.username} 重置密码(≥6 字)`);
                    if (pwd && pwd.length >= 6) patchMut.mutate({ id: u.id, body: { password: pwd } });
                  }}
                  className="btn-quiet"
                  title="重置密码"
                  disabled={patchMut.isPending}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`确认删除用户 ${u.username}?名下没有 skill 才能删。`)) deleteMut.mutate(u.id);
                  }}
                  className="btn-quiet text-rose-300 hover:text-rose-200"
                  title="删除"
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const createMut = useMutation({
    mutationFn: () => adminApi.createUser({
      email, username, password,
      display_name: displayName || undefined,
      is_admin: isAdmin,
    }),
    onSuccess: () => {
      toast(`已创建用户 ${username}`, 'success');
      onDone();
    },
    onError: (err: any) => toast(err?.response?.data?.detail || '创建失败', 'error'),
  });

  return (
    <div className="surface p-5">
      <div className="text-sm font-medium mb-3">新增用户</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="label mb-1.5">邮箱</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </div>
        <div>
          <div className="label mb-1.5">用户名(英文)</div>
          <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} className="input" />
        </div>
        <div>
          <div className="label mb-1.5">显示昵称(可选)</div>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" />
        </div>
        <div>
          <div className="label mb-1.5">初始密码(≥6)</div>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300 mt-3">
        <input
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="accent-iris-500"
        />
        授予管理员权限
      </label>
      <button
        onClick={() => createMut.mutate()}
        disabled={createMut.isPending || !email || !username || password.length < 6}
        className="btn-primary mt-4"
      >
        {createMut.isPending ? '创建中…' : '确认创建'}
      </button>
    </div>
  );
}
