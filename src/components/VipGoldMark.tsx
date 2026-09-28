export const VIP_LOGO_SRC = '/qapla-mark-gold.svg?v=2';

export function VipGoldMark({
  className = 'h-11 w-11',
  showBadge = true,
}: {
  className?: string;
  showBadge?: boolean;
}) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`}>
      <span className="vip-gold-glow" aria-hidden />
      <span className="vip-gold-mark relative z-[1] block h-full w-full">
        <img src={VIP_LOGO_SRC} alt="" className="h-full w-full object-contain" />
        <span className="vip-gold-sheen" aria-hidden />
      </span>
      {showBadge ? (
        <span className="absolute -bottom-1 left-1/2 z-[2] -translate-x-1/2 text-[8px] font-black tracking-[0.18em] text-amber-800 drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]">
          VIP
        </span>
      ) : null}
    </span>
  );
}

export function VipNavButton({
  active = false,
  onClick,
}: {
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="VIP"
      className={`absolute left-1/2 top-0 z-10 flex h-[4.35rem] w-[4.35rem] -translate-x-1/2 -translate-y-[1.55rem] items-center justify-center transition active:scale-95 ${
        active ? 'scale-105' : ''
      }`}
    >
      <VipGoldMark className="h-[3.85rem] w-[3.85rem]" />
    </button>
  );
}
