import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { skillsApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { relTime } from '../lib/format';

interface Props {
  skillId: string;
  skillOwnerId: string;
}

export default function CommentsSection({ skillId, skillOwnerId }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [content, setContent] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['comments', skillId],
    queryFn: () => skillsApi.listComments(skillId),
  });

  const createMut = useMutation({
    mutationFn: (text: string) => skillsApi.createComment(skillId, text),
    onSuccess: () => {
      setContent('');
      qc.invalidateQueries({ queryKey: ['comments', skillId] });
      toast('已发布', 'success');
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail || '发布失败,请重试', 'error');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (cid: string) => skillsApi.deleteComment(skillId, cid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', skillId] }),
    onError: () => toast('删除失败', 'error'),
  });

  const submit = () => {
    if (!user) {
      toast('需要登录后才能评论', 'info');
      setTimeout(() => nav(`/login?next=${encodeURIComponent(window.location.pathname)}`), 600);
      return;
    }
    const t = content.trim();
    if (!t) return;
    if (t.length > 2000) {
      toast('评论最长 2000 字', 'error');
      return;
    }
    createMut.mutate(t);
  };

  const items = data?.items ?? [];

  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-4 w-4 text-iris-300" />
        <h2 className="text-base font-semibold">
          评论
          <span className="ml-2 text-xs text-zinc-500 font-mono">{items.length}</span>
        </h2>
      </div>

      {/* 发布区 */}
      <div className="surface p-4 mb-4">
        {user ? (
          <>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="说说这个 skill 怎么样、踩过什么坑、有什么建议..."
              maxLength={2000}
              rows={3}
              className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none resize-none"
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.05]">
              <span className="text-[10px] text-zinc-600 font-mono">
                {content.length} / 2000
              </span>
              <button
                onClick={submit}
                disabled={!content.trim() || createMut.isPending}
                className="btn-primary text-xs px-3 py-1.5"
              >
                <Send className="h-3 w-3" />
                {createMut.isPending ? '发布中...' : '发布'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-zinc-400 mb-2">需要登录后才能评论</p>
            <div className="inline-flex items-center gap-2">
              <Link
                to={`/login?next=${encodeURIComponent(window.location.pathname)}`}
                className="btn-primary text-xs px-3 py-1.5"
              >
                登录
              </Link>
              <Link to="/register" className="btn-ghost text-xs px-3 py-1.5">
                注册
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="text-zinc-500 text-sm">加载中…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-600">
          暂无评论,做第一个评论的人吧
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const canDelete = !!user && (user.id === c.user_id || user.is_admin || user.id === skillOwnerId);
            const name = c.display_name?.trim() || c.username || '匿名';
            return (
              <div key={c.id} className="surface p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-zinc-200">{name}</span>
                    {c.is_admin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-iris-400/15 text-iris-300 ring-1 ring-iris-400/30">
                        管理员
                      </span>
                    )}
                    <span className="text-xs text-zinc-600 font-mono">{relTime(c.created_at)}</span>
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => {
                        if (confirm('删除这条评论?')) deleteMut.mutate(c.id);
                      }}
                      className="text-zinc-600 hover:text-rose-400 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                  {c.content}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
