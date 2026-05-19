import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

export default function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [pwd, setPwd] = useState('');
  const [invite, setInvite] = useState(sp.get('invite') || '');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !pwd || !invite) {
      toast('请填齐必填项', 'error');
      return;
    }
    setLoading(true);
    try {
      await register(email, username, pwd, invite, displayName);
      toast('注册成功,欢迎', 'success');
      nav('/dashboard');
    } catch (err: any) {
      toast(err?.response?.data?.detail || '注册失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-8rem)] flex items-center justify-center px-6 py-10">
      <div className="aurora" />
      <form onSubmit={submit} className="surface relative p-8 w-full max-w-md">
        <h1 className="text-2xl font-semibold heading-display mb-1">加入 Skill Hub</h1>
        <p className="text-sm text-zinc-500 mb-6">需要管理员发的邀请码。</p>

        <div className="space-y-3">
          <div>
            <div className="label mb-1.5">邀请码</div>
            <input value={invite} onChange={(e) => setInvite(e.target.value)} className="input font-mono" autoFocus />
          </div>
          <div>
            <div className="label mb-1.5">邮箱</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </div>
          <div>
            <div className="label mb-1.5">用户名(英文,登录用)</div>
            <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} className="input" />
          </div>
          <div>
            <div className="label mb-1.5">显示昵称(可选)</div>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" />
          </div>
          <div>
            <div className="label mb-1.5">密码(≥6)</div>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="input" />
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full mt-6">
          {loading ? '正在创建账号…' : '创建账号'}
        </button>

        <div className="mt-5 text-sm text-zinc-500 text-center">
          已有账号? <Link to="/login" className="text-iris-400 hover:text-iris-300">直接登录</Link>
        </div>
      </form>
    </div>
  );
}
