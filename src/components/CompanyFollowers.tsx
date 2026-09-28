import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';
import { countFollowers, countFollowersRemote } from '@/lib/follows';

export type CompanyFollower = {
  user_id: string;
  display_name: string;
  followed_at: string;
};

export function useCompanyFollowers(companyId: string, canViewList = false) {
  const [followers, setFollowers] = useState<CompanyFollower[]>([]);
  const [count, setCount] = useState(() => countFollowers(companyId));

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      if (!companyId) {
        setFollowers([]);
        setCount(0);
        return;
      }
      if (!isSupabaseConfigured) {
        setFollowers([]);
        setCount(countFollowers(companyId));
        return;
      }
      const counted = await supabase.rpc('count_company_followers', { p_company_id: companyId });
      const listed = canViewList
        ? await supabase.rpc('list_company_followers', { p_company_id: companyId })
        : { data: [], error: null };
      if (stopped) return;
    if (!counted.error && counted.data != null && counted.data !== '') {
      const next = Number(counted.data);
      if (Number.isFinite(next)) setCount(next);
    } else {
        const fallback = await countFollowersRemote(companyId);
        if (!stopped) setCount(fallback);
      }
      if (canViewList && !listed.error && Array.isArray(listed.data)) {
        const rows = listed.data.filter((row) => row && typeof row === 'object').map((row) => {
          const item = row as Record<string, unknown>;
          return {
            user_id: String(item.user_id ?? ''),
            display_name: String(item.display_name ?? 'Üye'),
            followed_at: String(item.followed_at ?? ''),
          };
        });
        setFollowers(rows);
        if (counted.error) setCount(rows.length);
      } else if (!canViewList) {
        setFollowers([]);
      }
    };

    void load();
    const stop = subscribeTables(['follows'], (change) => {
      const next = change?.new as { business_id?: string; company_id?: string } | undefined;
      const prev = change?.old as { business_id?: string; company_id?: string } | undefined;
      const id = String(next?.business_id ?? prev?.business_id ?? next?.company_id ?? prev?.company_id ?? '');
      if (!id || id === companyId) void load();
    });
    return () => {
      stopped = true;
      stop();
    };
  }, [canViewList, companyId]);

  return { count, followers };
}

export function CompanyFollowers({
  companyId,
  canViewList = false,
}: {
  companyId: string;
  canViewList?: boolean;
}) {
  const { count, followers } = useCompanyFollowers(companyId, canViewList);
  const [open, setOpen] = useState(false);
  if (!canViewList) return null;

  return (
    <div className="mx-5 mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-2xl border border-mint-100 bg-[#f3faf7] px-3 py-2.5"
      >
        <span className="text-sm font-extrabold text-slate-800">Takipçiler</span>
        <span className="text-sm font-extrabold text-[#00A884]">{count}</span>
      </button>
      {open ? (
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-mint-100 bg-white">
          {followers.length === 0 ? (
            <li className="px-3 py-3 text-xs text-slate-400">Henüz takipçi yok.</li>
          ) : followers.map((item) => (
            <li key={item.user_id} className="border-t border-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 first:border-t-0">
              {item.display_name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
