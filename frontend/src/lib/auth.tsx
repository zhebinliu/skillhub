import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, AuthUser } from './api';

interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, invite: string, displayName?: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('skillhub_user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('skillhub_token'));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      setReady(true);
      return;
    }
    authApi
      .me()
      .then((u) => {
        setUser(u);
        localStorage.setItem('skillhub_user', JSON.stringify(u));
      })
      .catch(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('skillhub_token');
        localStorage.removeItem('skillhub_user');
      })
      .finally(() => setReady(true));
  }, []); // eslint-disable-line

  const login = useCallback(async (identifier: string, password: string) => {
    const r = await authApi.login({ identifier, password });
    localStorage.setItem('skillhub_token', r.access_token);
    localStorage.setItem('skillhub_user', JSON.stringify(r.user));
    setToken(r.access_token);
    setUser(r.user);
  }, []);

  const register = useCallback(
    async (email: string, username: string, password: string, invite: string, displayName?: string) => {
      const r = await authApi.register({ email, username, password, invite_code: invite, display_name: displayName });
      localStorage.setItem('skillhub_token', r.access_token);
      localStorage.setItem('skillhub_user', JSON.stringify(r.user));
      setToken(r.access_token);
      setUser(r.user);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem('skillhub_token');
    localStorage.removeItem('skillhub_user');
    setToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, token, ready, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth needs AuthProvider');
  return c;
}
