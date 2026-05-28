import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { skillsApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

/** 点赞 / 踩 二选一,再点同样的算取消。 */
export default function ReactionBar({ skillId }: { skillId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['reactions', skillId],
    queryFn: () => skillsApi.getReactions(skillId),
  });

  const mut = useMutation({
    mutationFn: (reaction: 'like' | 'dislike') => skillsApi.setReaction(skillId, reaction),
    onSuccess: (resp) => {
      qc.setQueryData(['reactions', skillId], resp);
    },
    onError: () => toast('操作失败,请重试', 'error'),
  });

  const handle = (r: 'like' | 'dislike') => {
    if (!user) {
      toast('需要登录后才能点赞 / 踩', 'info');
      setTimeout(() => nav(`/login?next=${encodeURIComponent(window.location.pathname)}`), 600);
      return;
    }
    mut.mutate(r);
  };

  const my = data?.my_reaction ?? null;
  const likeActive = my === 'like';
  const dislikeActive = my === 'dislike';

  return (
    <div className="inline-flex items-center gap-1 rounded-full ring-1 ring-white/10 bg-white/[0.03] px-1 py-1">
      <button
        onClick={() => handle('like')}
        disabled={mut.isPending}
        title={likeActive ? '点击取消点赞' : '点赞'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
          likeActive
            ? 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30'
            : 'text-zinc-400 hover:text-emerald-300 hover:bg-emerald-400/10'
        }`}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        <span className="font-mono">{data?.like_count ?? 0}</span>
      </button>
      <button
        onClick={() => handle('dislike')}
        disabled={mut.isPending}
        title={dislikeActive ? '点击取消踩' : '踩'}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
          dislikeActive
            ? 'bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/30'
            : 'text-zinc-400 hover:text-rose-300 hover:bg-rose-400/10'
        }`}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        <span className="font-mono">{data?.dislike_count ?? 0}</span>
      </button>
    </div>
  );
}
