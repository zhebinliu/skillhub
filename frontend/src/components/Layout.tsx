import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Compass, KeyRound, LayoutDashboard, LogOut, Pencil, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { authApi } from '../lib/api';
import { useToast } from '../lib/toast';
import { clsx } from 'clsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-full flex flex-col bg-ink-950">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-ink-950/70 border-b border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="relative h-8 w-8 rounded-xl bg-gradient-warm flex items-center justify-center shadow-glow-ember">
              <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-semibold heading-display tracking-tight">
              Skill <span className="text-transparent bg-gradient-warm bg-clip-text">Hub</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavItem to="/explore" icon={<Compass className="h-4 w-4" />}>探索</NavItem>
            {user && (
              <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>我的</NavItem>
            )}
            {user?.is_admin && (
              <NavItem to="/admin" icon={<ShieldCheck className="h-4 w-4" />}>管理</NavItem>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link to="/dashboard/upload" className="btn-primary hidden sm:inline-flex">
                  <Upload className="h-4 w-4" />
                  上传 skill
                </Link>
                <UserMenu />
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">登录</Link>
                <Link to="/register" className="btn-primary">用邀请码加入</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        <Outlet />
      </main>

      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-zinc-500">
        Skill Hub · 让 skill 设计本身成为一种手艺
      </footer>
    </div>
  );
}

function NavItem({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all',
          isActive
            ? 'bg-white/10 text-white'
            : 'text-zinc-400 hover:text-white hover:bg-white/5'
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase();
  return (
    <div className="h-9 w-9 rounded-full bg-gradient-warm flex items-center justify-center text-sm font-semibold text-white shadow-glow">
      {initial}
    </div>
  );
}

function UserMenu() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (!user) return null;

  async function changeNickname() {
    setOpen(false);
    const cur = user!.display_name || user!.username;
    const name = window.prompt('新昵称(1-64 字):', cur);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === cur) return;
    try {
      const updated = await authApi.patchMe({ display_name: trimmed });
      setUser(updated);
      toast('昵称已更新', 'success');
    } catch (err: any) {
      toast(err?.response?.data?.detail || '更新失败', 'error');
    }
  }

  async function changePassword() {
    setOpen(false);
    const oldp = window.prompt('请输入当前密码:');
    if (!oldp) return;
    const newp = window.prompt('新密码(≥6 字):');
    if (!newp || newp.length < 6) {
      if (newp != null) toast('新密码至少 6 字', 'error');
      return;
    }
    try {
      await authApi.patchMe({ old_password: oldp, password: newp });
      toast('密码已更新,下次登录用新密码', 'success');
    } catch (err: any) {
      toast(err?.response?.data?.detail || '更新失败', 'error');
    }
  }

  return (
    <div ref={ref} className="hidden md:block relative pl-3 border-l border-white/10">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 hover:opacity-90 transition-opacity"
      >
        <div className="text-right">
          <div className="text-sm font-medium">{user.display_name || user.username}</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            {user.is_admin ? 'admin' : 'creator'}
          </div>
        </div>
        <Avatar name={user.display_name || user.username} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-ink-900/95 backdrop-blur-xl border border-white/10 shadow-glow overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="text-sm font-medium truncate">{user.display_name || user.username}</div>
            <div className="text-xs text-zinc-500 truncate">@{user.username} · {user.email}</div>
          </div>
          <button onClick={changeNickname} className="w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06] inline-flex items-center gap-2 transition-colors">
            <Pencil className="h-3.5 w-3.5" /> 改昵称
          </button>
          <button onClick={changePassword} className="w-full px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.06] inline-flex items-center gap-2 transition-colors">
            <KeyRound className="h-3.5 w-3.5" /> 改密码
          </button>
          <div className="border-t border-white/[0.06]" />
          <button
            onClick={() => { setOpen(false); logout(); nav('/'); }}
            className="w-full px-4 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10 inline-flex items-center gap-2 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> 退出登录
          </button>
        </div>
      )}
    </div>
  );
}
