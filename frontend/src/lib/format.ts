export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function relTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return d.toLocaleDateString('zh-CN');
}

export function verdictMeta(verdict?: string | null) {
  switch (verdict) {
    case 'excellent':
      return { label: '极佳', color: 'text-emerald-300', bg: 'bg-emerald-400/10', ring: 'ring-emerald-400/30' };
    case 'good':
      return { label: '优秀', color: 'text-iris-300', bg: 'bg-iris-400/10', ring: 'ring-iris-400/30' };
    case 'pass':
      return { label: '合格', color: 'text-amber-300', bg: 'bg-amber-400/10', ring: 'ring-amber-400/30' };
    case 'needs_work':
      return { label: '待打磨', color: 'text-orange-300', bg: 'bg-orange-400/10', ring: 'ring-orange-400/30' };
    case 'fail':
      return { label: '不通过', color: 'text-rose-300', bg: 'bg-rose-400/10', ring: 'ring-rose-400/30' };
    default:
      return { label: '未质检', color: 'text-zinc-400', bg: 'bg-white/5', ring: 'ring-white/10' };
  }
}
