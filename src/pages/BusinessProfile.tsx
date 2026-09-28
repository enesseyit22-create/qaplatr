import { useEffect, useState } from 'react';
import { ArrowLeft, Heart, MapPin, MessageCircle, Pencil, Phone, UserMinus, UserPlus } from 'lucide-react';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { isFavorite, toggleFavorite } from '@/lib/favorites';
import { hydrateFollows, isFollowing, setFollowing } from '@/lib/follows';
import { CompanyFollowers, useCompanyFollowers } from '@/components/CompanyFollowers';
import { useCompanyPosts } from '@/lib/posts';
import { telHref, whatsappHref } from '@/lib/contact';
import { formatDurationLeft, getMsRemaining } from '@/lib/utils';
import { QapLaMark } from '@/components/QapLaMark';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { PostMediaTile } from '@/components/PostMediaTile';
import { readSavedAddress } from '@/lib/address';
import { distanceMeters, hasValidCoords } from '@/lib/geo';
import { postRadiusM, useReach } from '@/lib/reach';

const BRAND = '#00A884';

export function BusinessProfile({
  merchant,
  offers,
  onBack,
  onOffer,
  onRequireAuth,
  onEdit,
  owner = false,
  embedded = false,
}: {
  merchant: Merchant;
  offers: OfferWithMerchant[];
  onBack?: () => void;
  onOffer?: (offer: OfferWithMerchant) => void;
  onRequireAuth?: () => void;
  onEdit?: () => void;
  owner?: boolean;
  embedded?: boolean;
}) {
  const { user, profile } = useAuth();
  useReach();
  const guest = !user && !owner;
  const posts = useCompanyPosts(merchant.id);
  const origin = readSavedAddress();
  const postsNear = owner || profile?.role === 'admin' || !origin || !hasValidCoords(origin) || !hasValidCoords(merchant)
    || distanceMeters(origin.latitude, origin.longitude, merchant.latitude, merchant.longitude) <= postRadiusM();
  const [fav, setFav] = useState(() => (user ? isFavorite(user.id, merchant.id) : false));
  const [following, setFollowState] = useState(() => (user ? isFollowing(user.id, merchant.id) : false));
  const { count: remoteFollowers } = useCompanyFollowers(merchant.id);
  const [followerCount, setFollowerCount] = useState(remoteFollowers);

  useEffect(() => {
    setFollowerCount(remoteFollowers);
  }, [remoteFollowers]);

  useEffect(() => {
    if (!user) {
      setFollowState(false);
      return;
    }
    setFollowState(isFollowing(user.id, merchant.id));
    void hydrateFollows(user.id).then(() => {
      setFollowState(isFollowing(user.id, merchant.id));
    });
  }, [user, merchant.id]);

  const activeOffers = offers.filter(
    (item) => item.merchant_id === merchant.id && item.is_active && getMsRemaining(item.expires_at) > 0,
  );
  const cover = merchant.cover_url || merchant.image_url || null;
  const logo = merchant.logo_url || merchant.image_url || null;
  const wa = whatsappHref(merchant.whatsapp);
  const call = telHref(merchant.phone);

  const toggleFollow = async () => {
    if (!user) {
      onRequireAuth?.();
      return;
    }
    const next = !following;
    setFollowState(next);
    setFollowerCount((current) => Math.max(0, current + (next ? 1 : -1)));
    const saved = await setFollowing(user.id, merchant.id, next);
    if (saved !== next) {
      setFollowState(saved);
      setFollowerCount((current) => Math.max(0, current + (next ? -1 : 1)));
    }
  };

  return (
    <div className={embedded ? 'bg-white' : 'flex h-full min-h-0 flex-col overflow-hidden bg-white'}>
      <div className="relative shrink-0">
        {cover ? (
          <img src={cover} alt="" className={`w-full object-cover ${embedded ? 'h-36 rounded-t-3xl' : 'h-44'}`} />
        ) : (
          <div className={`w-full bg-gradient-to-br from-emerald-400 to-[#00A884] ${embedded ? 'h-36 rounded-t-3xl' : 'h-44'}`} />
        )}
        <div className={`absolute inset-x-0 top-0 flex items-center justify-between px-4 ${embedded ? 'pt-3' : 'pt-[max(0.85rem,env(safe-area-inset-top))]'}`}>
          {onBack && !embedded ? (
            <button type="button" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md">
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <span className="h-10 w-10" />
          )}
          {owner && onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-2 text-xs font-extrabold text-white backdrop-blur-md"
            >
              <Pencil className="h-3.5 w-3.5" /> Düzenle
            </button>
          ) : user ? (
            <button
              type="button"
              onClick={() => setFav(toggleFavorite(user.id, merchant.id))}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md"
            >
              <Heart className={`h-5 w-5 ${fav ? 'fill-white' : ''}`} />
            </button>
          ) : (
            <span className="h-10 w-10" />
          )}
        </div>
        <div className="absolute -bottom-10 left-1/2 h-20 w-20 -translate-x-1/2 overflow-hidden rounded-full bg-mint-100 ring-4 ring-white shadow-lg">
          {logo ? (
            <img src={logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl font-extrabold text-mint-700">
              {(merchant.name || '?').slice(0, 1).toLocaleUpperCase('tr')}
            </span>
          )}
        </div>
      </div>

      <div className={embedded ? 'pt-12' : 'min-h-0 flex-1 overflow-y-auto pb-28 pt-12'}>
        <div className="px-5 text-center">
          <h1 className="inline-flex items-center justify-center gap-1 text-xl font-extrabold leading-tight text-slate-900">{merchant.name}<VerifiedBadge verified={merchant.is_verified} /></h1>
          <p className="text-sm text-slate-500">{merchant.category}</p>
          <p className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-400">
            <MapPin className="h-3.5 w-3.5" /> {merchant.address || 'Adres yok'}
          </p>
        </div>

        <div className="mx-5 mt-4 grid grid-cols-3 divide-x divide-mint-100 rounded-2xl border border-mint-100 bg-[#f3faf7]">
          <Stat value={followerCount} label="Takipçi" />
          <Stat value={posts.length} label="Gönderi" />
          <Stat value={activeOffers.length} label="Kampanya" />
        </div>
        {owner ? <CompanyFollowers companyId={merchant.id} canViewList /> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 px-5">
          {owner ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-extrabold text-white"
              style={{ background: BRAND }}
            >
              <Pencil className="h-4 w-4" /> Düzenle
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void toggleFollow()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-extrabold"
              style={following ? { background: '#eef8f4', color: BRAND } : { background: BRAND, color: '#fff' }}
            >
              {following ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {following ? 'Takiptesin' : 'Takip Et'}
            </button>
          )}
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#25D366] py-2.5 text-sm font-extrabold text-white"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          ) : null}
          {call ? (
            <a
              href={call}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-mint-50 py-2.5 text-sm font-extrabold text-mint-800"
            >
              <Phone className="h-4 w-4" /> Ara
            </a>
          ) : null}
        </div>

        {merchant.description ? (
          <p className="mt-4 px-5 text-sm leading-relaxed text-slate-600">{merchant.description}</p>
        ) : null}

        <section className="mt-5 px-5">
          <h2 className="text-sm font-extrabold text-slate-800">Kampanyalar</h2>
          {activeOffers.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">Şu an aktif kampanya yok.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {activeOffers.map((offer) => (
                <li key={offer.id}>
                  <button
                    type="button"
                    onClick={() => onOffer?.(offer)}
                    className="w-full overflow-hidden rounded-2xl bg-white text-left shadow-md ring-1 ring-black/5"
                  >
                    {offer.image_url ? (
                      <div className="relative h-28">
                        <img src={offer.image_url} alt="" className={`h-full w-full object-cover ${guest ? 'scale-105 blur-md' : ''}`} />
                        {guest ? <div className="absolute inset-0 backdrop-blur-md" /> : null}
                      </div>
                    ) : null}
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-[#00A884] px-2 py-0.5 text-[10px] font-extrabold text-white">{offer.discount}</span>
                        <span className="text-[10px] font-bold text-[#00A884]">{formatDurationLeft(offer.expires_at)}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-extrabold text-slate-800">{offer.title}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`mt-5 px-5 ${embedded ? 'pb-2' : 'pb-6'}`}>
          <h2 className="text-sm font-extrabold text-slate-800">Gönderiler</h2>
          {!postsNear ? (
            <p className="mt-2 text-xs text-gray-400">Gönderiler bu mesafeden görünmüyor.</p>
          ) : posts.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">Henüz gönderi yok.</p>
          ) : (
            <div className="relative mt-2 grid grid-cols-3 gap-0.5">
              {posts.map((post) => (
                <PostMediaTile key={post.id} post={post} guest={guest} onRequireAuth={onRequireAuth} />
              ))}
              {guest ? (
                <div className="absolute inset-0 flex items-center justify-center p-3">
                  <button
                    type="button"
                    onClick={() => onRequireAuth?.()}
                    className="w-full max-w-[240px] rounded-3xl border border-white/60 bg-white/80 p-4 text-center shadow-xl backdrop-blur-md"
                  >
                    <QapLaMark className="mx-auto h-10 w-10" />
                    <p className="mt-2 text-sm font-extrabold text-slate-800">Üyelik kartı</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">Vitrini net görmek ve beğenmek için üye ol.</p>
                    <span className="mt-3 inline-flex rounded-2xl px-4 py-2 text-xs font-extrabold text-white" style={{ background: BRAND }}>
                      Üye Ol
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          )}
          {guest && posts.length === 0 ? (
            <button
              type="button"
              onClick={() => onRequireAuth?.()}
              className="mt-3 w-full rounded-3xl border border-mint-100 bg-white/80 p-4 text-center shadow-sm backdrop-blur-md"
            >
              <QapLaMark className="mx-auto h-10 w-10" />
              <p className="mt-2 text-sm font-extrabold text-slate-800">Üyelik kartı</p>
              <p className="mt-1 text-[11px] text-slate-500">Kampanya görselleri üyelere açık.</p>
              <span className="mt-3 inline-flex rounded-2xl px-4 py-2 text-xs font-extrabold text-white" style={{ background: BRAND }}>
                Üye Ol
              </span>
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-2 py-3 text-center">
      <p className="text-lg font-extrabold text-slate-900">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-mint-600">{label}</p>
    </div>
  );
}
