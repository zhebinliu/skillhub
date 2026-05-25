import axios from 'axios';

const baseURL = (import.meta as any).env?.VITE_API_BASE || '';

export const api = axios.create({
  baseURL,
  timeout: 120000,
});

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('skillhub_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('skillhub_token');
      localStorage.removeItem('skillhub_user');
    }
    return Promise.reject(err);
  }
);

// ── 类型 ──────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  display_name?: string | null;
  is_admin: boolean;
}

export interface Skill {
  id: string;
  owner_id: string;
  owner_username?: string | null;
  owner_display_name?: string | null;
  slug: string;
  name: string;                       // 技术名(SKILL.md frontmatter,通常英文)
  display_name?: string | null;       // 中文显示名,UI 优先展示;空则 fallback 到 name
  description?: string | null;
  version?: string | null;
  tags?: string[];
  entry_file: string;
  size_bytes: number;
  file_count: number;
  is_published: boolean;
  published_at?: string | null;
  latest_score?: number | null;
  latest_verdict?: string | null;
  inspecting?: boolean;
  inspecting_started_at?: string | null;
  view_count: number;
  install_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SkillFile {
  path: string;
  size: number;
  is_text: boolean;
}

export type TraceDim = 'trust' | 'reliability' | 'adaptability' | 'convention' | 'effectiveness';

export interface Report {
  id: string;
  mode: 'trace';
  score: number;          // 0-100
  verdict: string;        // excellent | good | pass | needs_work | fail
  summary?: string | null;
  dimensions: Partial<Record<TraceDim, { score: number; comments?: string; label?: string }>>;
  suggestions: Array<{ severity: string; area: string; message: string }>;
  clues?: {
    has_skill_md?: boolean;
    frontmatter_complete?: boolean;
    file_count?: number;
    size_bytes?: number;
    has_scripts?: boolean;
    has_references?: boolean;
    has_examples?: boolean;
    external_urls?: string[];
    security_risks?: string[];
  };
  llm_model?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface InstallInstructions {
  skill: { id: string; slug: string; name: string };
  chat: { title: string; subtitle: string; prompt: string };
  cli: { title: string; subtitle: string; command: string };
  zip: { title: string; subtitle: string; download_url: string; filename: string; instruction: string };
}

export interface SkillVersion {
  version: string;
  file_count: number;
  size_bytes: number;
  created_at: string;
  published_at: string | null;
  is_current: boolean;
}

export interface InviteCode {
  id: string;
  code: string;
  note?: string | null;
  grants_admin: boolean;
  created_at: string;
  expires_at?: string | null;
  used_at?: string | null;
  used_by_username?: string | null;
  created_by_username?: string | null;
}

// ── api 封装 ──────────────────────────────────────────────────────
export const authApi = {
  register: (body: { email: string; username: string; password: string; invite_code: string; display_name?: string }) =>
    api.post<{ access_token: string; user: AuthUser }>('/api/auth/register', body).then((r) => r.data),
  login: (body: { identifier: string; password: string }) =>
    api.post<{ access_token: string; user: AuthUser }>('/api/auth/login', body).then((r) => r.data),
  me: () => api.get<AuthUser>('/api/auth/me').then((r) => r.data),
  patchMe: (body: { display_name?: string; password?: string; old_password?: string }) =>
    api.patch<AuthUser>('/api/auth/me', body).then((r) => r.data),
};

export const skillsApi = {
  listPublished: (params: { q?: string; sort?: string; page?: number; page_size?: number } = {}) =>
    api.get<{ total: number; page: number; page_size: number; items: Skill[] }>('/api/skills', { params }).then((r) => r.data),
  mine: () => api.get<{ items: Skill[] }>('/api/skills/mine').then((r) => r.data),
  get: (id: string) =>
    api.get<{ skill: Skill; tree: SkillFile[] }>(`/api/skills/${id}`).then((r) => r.data),
  getFile: (id: string, path: string) =>
    api.get<{
      path: string; mime: string | null; is_text: boolean;
      text: string | null; base64: string | null;
      size: number; full_size: number; truncated: boolean;
    }>(`/api/skills/${id}/file`, { params: { path } }).then((r) => r.data),
  reports: (id: string) => api.get<{ items: Report[] }>(`/api/skills/${id}/reports`).then((r) => r.data),
  uploadZip: (file: File, nameHint?: string, version?: string) => {
    const fd = new FormData();
    fd.append('archive', file);
    if (nameHint) fd.append('name_hint', nameHint);
    if (version) fd.append('version', version);
    return api.post<{ skill: Skill }>('/api/skills/upload', fd).then((r) => r.data);
  },
  uploadFiles: (files: File[], paths: string[], nameHint?: string, version?: string) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    paths.forEach((p) => fd.append('paths', p));
    if (nameHint) fd.append('name_hint', nameHint);
    if (version) fd.append('version', version);
    return api.post<{ skill: Skill }>('/api/skills/upload-files', fd).then((r) => r.data);
  },
  uploadVersionZip: (id: string, file: File, version?: string) => {
    const fd = new FormData();
    fd.append('archive', file);
    if (version) fd.append('version', version);
    return api.post<{ skill: Skill }>(`/api/skills/${id}/upload-version`, fd).then((r) => r.data);
  },
  uploadVersionFiles: (id: string, files: File[], paths: string[], version?: string) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    paths.forEach((p) => fd.append('paths', p));
    if (version) fd.append('version', version);
    return api.post<{ skill: Skill }>(`/api/skills/${id}/upload-version`, fd).then((r) => r.data);
  },
  publish: (id: string, publish: boolean) =>
    api.post<{ skill: Skill }>(`/api/skills/${id}/publish`, null, { params: { publish } }).then((r) => r.data),
  inspect: (id: string) =>
    api.post<{ report: Report }>(`/api/skills/${id}/inspect`).then((r) => r.data),
  patch: (id: string, body: { display_name?: string; description?: string }) =>
    api.patch<{ skill: Skill }>(`/api/skills/${id}`, body).then((r) => r.data),
  install: (id: string) =>
    api.get<InstallInstructions>(`/api/skills/${id}/install`).then((r) => r.data),
  versions: (id: string) =>
    api.get<{ items: SkillVersion[] }>(`/api/skills/${id}/versions`).then((r) => r.data),
  downloadUrl: (id: string) => `/api/skills/${id}/download`,         // 公开安装入口(会计 install_count)
  exportUrl: (id: string, format: 'zip' | 'skill' = 'zip') =>
    `/api/skills/${id}/export?format=${format}`,                      // owner/admin 导出(不计数)
  rawUrl: (id: string, path: string) => `/api/skills/${id}/raw?path=${encodeURIComponent(path)}`,
  remove: (id: string) => api.delete(`/api/skills/${id}`).then((r) => r.data),
};

export type AdminUser = AuthUser & { is_active: boolean; created_at: string; skill_count?: number };

export const adminApi = {
  listInvites: () => api.get<{ items: InviteCode[] }>('/api/admin/invites').then((r) => r.data),
  createInvite: (body: { note?: string; grants_admin?: boolean; expires_in_days?: number }) =>
    api.post<{ code: string; id: string; expires_at: string | null }>('/api/admin/invites', body).then((r) => r.data),
  deleteInvite: (id: string) => api.delete(`/api/admin/invites/${id}`).then((r) => r.data),
  listUsers: () => api.get<{ items: AdminUser[] }>('/api/admin/users').then((r) => r.data),
  createUser: (body: {
    email: string; username: string; password: string;
    display_name?: string; is_admin?: boolean;
  }) => api.post<AdminUser>('/api/admin/users', body).then((r) => r.data),
  patchUser: (id: string, body: {
    display_name?: string; is_admin?: boolean; is_active?: boolean; password?: string;
  }) => api.patch<AdminUser>(`/api/admin/users/${id}`, body).then((r) => r.data),
  deleteUser: (id: string) => api.delete(`/api/admin/users/${id}`).then((r) => r.data),
};
