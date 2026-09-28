import { Heart } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { togglePostLike, usePostLikes } from '@/lib/postLikes';
import type { CompanyPost } from '@/lib/posts';

export function PostMediaTile({
  post,
  guest = false,
  onRequireAuth,
  onDelete,
}: {
  post: CompanyPost;
  guest?: boolean;
  onRequireAuth?: () => void;
  onDelete?: (id: string) => void;
}) {
  const { user } = useAuth();
  const { liked, count } = usePostLikes(post.id, user?.id);

  return (
    <article className="relative aspect-square overflow-hidden bg-mint-50">
      {post.image_url ? (
        <img
          src={post.image_url}
          alt=""
          className={`h-full w-full object-cover ${guest ? 'scale-110 blur-md' : ''}`}
        />
      ) : null}
      {guest ? <div className="absolute inset-0 bg-white/10 backdrop-blur-md" /> : null}
      {!guest ? (
        <button
          type="button"
          onClick={() => {
            if (!user) {
              onRequireAuth?.();
              return;
            }
            void togglePostLike(user.id, post.id);
          }}
          className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-extrabold text-white backdrop-blur-md"
        >
          <Heart className={`h-3 w-3 ${liked ? 'fill-rose-400 text-rose-400' : ''}`} />
          {count}
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          onClick={() => onDelete(post.id)}
          className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-extrabold text-red-500"
        >
          Sil
        </button>
      ) : null}
    </article>
  );
}
