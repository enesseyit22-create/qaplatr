import { Phone, MapPin, Store, Tag, Ticket, X } from 'lucide-react';
import { SafeCenterModal } from '@/components/SafeCenterModal';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';
import { SECTOR_LABELS, sectorIdForCategory } from '@/lib/sectors';
import { formatDurationLeft, getMsRemaining } from '@/lib/utils';
import { FirmName } from '@/components/VerifiedBadge';

export function MerchantPreviewModal({
  merchant,
  offer,
  onClose,
  onOpenProfile,
}: {
  merchant: Merchant;
  offer?: OfferWithMerchant | null;
  onClose: () => void;
  onOpenProfile: () => void;
}) {
  const sector = sectorIdForCategory(merchant.category);
  const phone = merchant.phone?.trim() || '';
  const live = offer && offer.is_active && getMsRemaining(offer.expires_at) > 0;

  return (
    <SafeCenterModal onClose={onClose} zIndex={2300}>
      <article className="merchant-preview overflow-hidden rounded-[1.7rem] bg-white shadow-[0_28px_70px_-28px_rgba(15,80,70,0.55)]">
        <div className="relative bg-gradient-to-br from-mint-500 via-mint-600 to-teal-800 px-5 pb-5 pt-4 text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/18 text-white"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/16 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em]">
            <Tag className="h-3 w-3" /> {SECTOR_LABELS[sector]}
          </p>
          <h2 className="mt-3 pr-8 text-[1.35rem] font-extrabold leading-tight"><FirmName name={merchant.name} verified={merchant.is_verified} tone="onDark" /></h2>
          <p className="mt-1.5 text-sm text-mint-50">{merchant.category || 'İşletme'}</p>
        </div>

        <div className="space-y-3 px-5 py-4">
          {live ? (
            <section className="rounded-2xl border border-mint-100 bg-mint-50/80 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-mint-700">
                <Ticket className="h-3.5 w-3.5" /> Kampanya
              </p>
              <p className="mt-1 text-sm font-extrabold text-mint-900">{offer.title}</p>
              {offer.description ? <p className="mt-1 text-xs leading-relaxed text-mint-800/80">{offer.description}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {offer.discount ? <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-mint-700">{offer.discount}</span> : null}
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-mint-700">{formatDurationLeft(offer.expires_at)}</span>
              </div>
            </section>
          ) : (
            <p className="rounded-2xl bg-cream-50 px-3.5 py-3 text-xs text-gray-500">Şu an görünen aktif kampanya yok.</p>
          )}

          <div className="space-y-2 text-sm text-mint-900">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-mint-500" />
              <span>{merchant.address || 'Adres eklenmemiş'}</span>
            </p>
            {phone ? (
              <a href={`tel:${phone.replace(/\s+/g, '')}`} className="flex items-center gap-2 font-semibold text-mint-800">
                <Phone className="h-4 w-4 shrink-0 text-mint-500" />
                {phone}
              </a>
            ) : (
              <p className="flex items-center gap-2 text-gray-400">
                <Phone className="h-4 w-4 shrink-0" /> Telefon eklenmemiş
              </p>
            )}
            {merchant.description ? (
              <p className="flex items-start gap-2 text-xs leading-relaxed text-gray-500">
                <Store className="mt-0.5 h-4 w-4 shrink-0 text-mint-500" />
                {merchant.description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onOpenProfile}
            className="flex w-full items-center justify-center rounded-2xl bg-mint-500 py-3 text-sm font-extrabold text-white shadow-mint"
          >
            İşletme detayını aç
          </button>
        </div>
      </article>
    </SafeCenterModal>
  );
}
