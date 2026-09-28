import { useMemo, useState } from 'react';
import { ArrowLeft, Heart, MapPin, Phone, Star, Tag } from 'lucide-react';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { isFavorite, toggleFavorite } from '@/lib/favorites';
import { addReview, reviewsForCompany } from '@/lib/reviews';
import { readLocalClaims } from '@/lib/demoData';
import { formatDurationLeft, getMsRemaining } from '@/lib/utils';
import { FirmName } from '@/components/VerifiedBadge';

export function CompanyPage({
  merchant,
  offers,
  onBack,
  onOffer,
}: {
  merchant: Merchant;
  offers: OfferWithMerchant[];
  onBack: () => void;
  onOffer?: (offer: OfferWithMerchant) => void;
}) {
  const { user } = useAuth();
  const [fav, setFav] = useState(() => (user ? isFavorite(user.id, merchant.id) : false));
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const [reviews, setReviews] = useState(() => reviewsForCompany(merchant.id));

  const companyOffers = offers.filter((item) => item.merchant_id === merchant.id);
  const activeOffers = companyOffers.filter((item) => item.is_active && getMsRemaining(item.expires_at) > 0);

  const canReview = useMemo(() => {
    if (!user) return false;
    return readLocalClaims().some((item) =>
      item.consumer_id === user.id
      && item.status === 'used'
      && (item.merchant_id === merchant.id || companyOffers.some((offer) => offer.id === item.offer_id)),
    );
  }, [user, merchant.id, companyOffers]);

  return (
    <div className="flex-1">
      <div className="px-5 pt-12 pb-4 bg-gradient-to-b from-mint-500 to-mint-600 text-white">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {user ? (
            <button
              type="button"
              onClick={() => setFav(toggleFavorite(user.id, merchant.id))}
              className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center"
              aria-label="Favori"
            >
              <Heart className={`w-5 h-5 ${fav ? 'fill-white' : ''}`} />
            </button>
          ) : null}
        </div>
        <h1 className="mt-3 text-xl font-extrabold"><FirmName name={merchant.name} verified={merchant.is_verified} /></h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-mint-50">
          <Tag className="h-3.5 w-3.5" /> {merchant.category}
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-mint-50">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {merchant.address}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-mint-50">
          <Phone className="h-3.5 w-3.5" /> {merchant.phone || 'Telefon eklenmedi'}
        </p>
      </div>
      <div className="px-5 py-4 space-y-4">
        {merchant.description ? (
          <section className="rounded-2xl bg-white p-3.5 border border-mint-100">
            <h2 className="text-sm font-extrabold text-mint-800">Hakkında</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{merchant.description}</p>
          </section>
        ) : null}

        <section>
          <h2 className="text-sm font-extrabold text-mint-800">Aktif Kampanyalar</h2>
          {activeOffers.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">Şu an aktif kampanya yok.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {activeOffers.map((offer) => (
                <li key={offer.id}>
                  <button
                    type="button"
                    onClick={() => onOffer?.(offer)}
                    className="w-full rounded-2xl border border-mint-100 bg-white px-3 py-2.5 text-left"
                  >
                    <p className="text-sm font-bold text-mint-800">{offer.title}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{offer.discount} · {formatDurationLeft(offer.expires_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-extrabold text-mint-800">Yorumlar</h2>
          {canReview ? (
            <form
              className="mt-2 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!user || !text.trim()) return;
                const coupon = readLocalClaims().find((item) => item.consumer_id === user.id && item.status === 'used');
                addReview({
                  company_id: merchant.id,
                  user_id: user.id,
                  coupon_id: coupon?.id ?? 'approved',
                  rating,
                  text: text.trim(),
                });
                setText('');
                setReviews(reviewsForCompany(merchant.id));
              }}
            >
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button" onClick={() => setRating(value)} className="text-amber-400">
                    <Star className="h-4 w-4" fill={value <= rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              <textarea className="w-full rounded-2xl border-2 border-mint-100 px-3 py-2 text-sm" rows={3} placeholder="Kupon onaylandıktan sonra yorum yaz" value={text} onChange={(e) => setText(e.target.value)} />
              <button type="submit" className="btn-primary w-full py-2.5 text-sm">Gönder</button>
            </form>
          ) : (
            <p className="mt-1 text-xs text-gray-400">Yorum için kuponun işletmede onaylanması gerekir.</p>
          )}
          <ul className="mt-3 space-y-2">
            {reviews.map((item) => (
              <li key={item.id} className="rounded-2xl bg-cream-50 px-3 py-2">
                <p className="text-xs font-bold text-amber-500">{'★'.repeat(item.rating)}</p>
                <p className="text-sm text-mint-800">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
