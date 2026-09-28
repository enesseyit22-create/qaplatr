import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import {
  filterAddressPresets,
  formatAddressParts,
  searchNominatim,
  type SavedAddress,
  writeSavedAddress,
} from '@/lib/address';

type AddressBarProps = {
  value: SavedAddress | null;
  onChange: (address: SavedAddress) => void;
  onClear?: () => void;
};

export function AddressBar({ value, onChange, onClear }: AddressBarProps) {
  const [query, setQuery] = useState(value?.label ?? '');
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value?.label ?? '');
  }, [value]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const localMatches = useMemo(() => filterAddressPresets(query), [query]);

  const apply = (address: SavedAddress) => {
    writeSavedAddress(address);
    onChange(address);
    setQuery(address.label);
    setOpen(false);
  };

  const submitManual = async () => {
    const parts = query.split(/[,/|-]+/).map((p) => p.trim()).filter(Boolean);
    const [city = '', district = '', neighborhood = ''] = parts.length >= 2 ? parts : ['', '', query.trim()];
    const label = formatAddressParts(city, district, neighborhood) || query.trim();
    if (!label) return;

    const preset = localMatches.find((item) => item.label.toLocaleLowerCase('tr') === label.toLocaleLowerCase('tr'));
    if (preset) {
      apply(preset);
      return;
    }

    setSearching(true);
    try {
      const found = await searchNominatim(label);
      apply(found ?? {
        label,
        city,
        district,
        neighborhood,
        latitude: value?.latitude ?? 40.9888,
        longitude: value?.longitude ?? 29.0288,
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative mt-3">
      <label className="sr-only" htmlFor="qapla-address">Adres</label>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/18 border border-white/25 backdrop-blur-sm">
        <Search className="w-4 h-4 text-white/80 shrink-0" />
        <input
          id="qapla-address"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submitManual();
            }
          }}
          placeholder="İl / ilçe / semt yaz veya haritadan seç"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/60 outline-none"
        />
        {searching ? <Loader2 className="w-4 h-4 animate-spin text-white/80" /> : null}
        {value && (
          <button
            type="button"
            onClick={() => {
              onClear?.();
              setQuery('');
              setOpen(false);
            }}
            className="text-white/70 hover:text-white"
            aria-label="Adresi temizle"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 mt-2 z-30 bg-white rounded-2xl shadow-mint-lg border border-mint-100 overflow-hidden">
          {localMatches.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => apply(item)}
              className="w-full text-left px-3.5 py-2.5 text-sm text-mint-800 hover:bg-mint-50 flex items-center gap-2"
            >
              <MapPin className="w-3.5 h-3.5 text-mint-500 shrink-0" />
              {item.label}
            </button>
          ))}
          {query.trim() && (
            <button
              type="button"
              onClick={() => void submitManual()}
              className="w-full text-left px-3.5 py-2.5 text-xs font-semibold text-mint-600 hover:bg-mint-50 border-t border-mint-50"
            >
              “{query.trim()}” adresini kullan
            </button>
          )}
        </div>
      )}
    </div>
  );
}
