import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const [id, setId] = useState('');
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !pwd) return;
    setLoading(true);
    try {
      await login(id, pwd);
      toast('登录成功', 'success');
      nav(next);
    } catch (err: any) {
      toast(err?.response?.data?.detail || '登录失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-8rem)] flex items-center justify-center px-6">
      <div className="aurora" />
      <form onSubmit={submit} className="surface relative p-8 w-full max-w-md">
        <h1 className="text-2xl font-semibold heading-display mb-1">欢迎回来</h1>
        <p className="text-sm text-zinc-500 mb-6">用邮箱或用户名登录。</p>

        <div className="space-y-3">
          <div>
            <div className="label mb-1.5">邮箱 / 用户名</div>
            <input value={id} onChange={(e) => setId(e.target.value)} className="input" autoFocus />
          </div>
          <div>
            <div className="label mb-1.5">密码</div>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="input" />
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full mt-6">
          {loading ? '正在登录…' : '登录'}
        </button>

        <div className="mt-5 text-sm text-zinc-500 text-center">
          还没账号? <Link to="/register" className="text-iris-400 hover:text-iris-300">用邀请码注册</Link>
        </div>
      </form>
    </div>
  );
}
