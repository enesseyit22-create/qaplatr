import { Heart, Store, User } from 'lucide-react';
import type { Merchant } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { TabPageShell, tabCard, tabIconWrap, tabPrimary } from '@/components/TabPageShell';

export { ProfileTabScreen, SettingsTabScreen } from '@/components/ProfileAccountScreen';

export function SavedPlacesScreen({
  merchants,
  onOpen,
  onRequireAuth,
}: {
  merchants: Merchant[];
  onOpen: (merchant: Merchant) => void;
  onRequireAuth: () => void;
}) {
  const { user } = useAuth();
  if (!user) {
    return <GuestPane title="Kaydedilenler" copy="Favori işletmelerini görmek için giriş yap." onRequireAuth={onRequireAuth} />;
  }
  return (
    <TabPageShell title="Kaydedilenler" subtitle="Beğendiğin işletmeler burada.">
      {merchants.length === 0 ? (
        <p className="rounded-2xl border border-mint-100 bg-white px-4 py-10 text-center text-sm text-gray-400">Henüz kayıtlı işletme yok.</p>
      ) : (
        <div className="space-y-2">
          {merchants.map((item) => (
            <button key={item.id} type="button" onClick={() => onOpen(item)} className={tabCard}>
              <span className={tabIconWrap}>
                <Store className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold text-mint-800">{item.name}</span>
                <span className="block truncate text-xs text-gray-400">{item.category}</span>
              </span>
              <Heart className="h-4 w-4 fill-mint-500 text-mint-500" />
            </button>
          ))}
        </div>
      )}
    </TabPageShell>
  );
}

function GuestPane({
  title,
  copy,
  onRequireAuth,
}: {
  title: string;
  copy: string;
  onRequireAuth: () => void;
}) {
  return (
    <TabPageShell title={title} subtitle={copy}>
      <div className="flex flex-col items-center rounded-3xl border border-mint-100 bg-white px-6 py-10 text-center shadow-sm">
        <span className={`${tabIconWrap} mb-3 h-14 w-14 rounded-3xl`}>
          <User className="h-6 w-6" />
        </span>
        <p className="text-sm text-gray-500">{copy}</p>
        <button type="button" onClick={onRequireAuth} className={`${tabPrimary} mt-5 max-w-[12rem]`}>
          Giriş yap
        </button>
      </div>
    </TabPageShell>
  );
}
