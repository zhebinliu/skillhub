import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Compass, LayoutDashboard, LogOut, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { useAuth } from '../lib/auth';
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
                <div className="hidden md:flex items-center gap-3 pl-3 border-l border-white/10">
                  <div className="text-right">
                    <div className="text-sm font-medium">{user.display_name || user.username}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      {user.is_admin ? 'admin' : 'creator'}
                    </div>
                  </div>
                  <Avatar name={user.display_name || user.username} />
                  <button
                    onClick={() => {
                      logout();
                      nav('/');
                    }}
                    className="text-zinc-400 hover:text-white transition-colors"
                    title="退出"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
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
