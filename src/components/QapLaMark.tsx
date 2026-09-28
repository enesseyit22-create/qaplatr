export const LOGO_SRC = '/qapla-mark.svg?v=7';
export const LOGO_MARK_SRC = '/qapla-mark-white.svg?v=7';

export function QapLaMark({
  className = 'w-8 h-8',
  variant = 'dark',
}: {
  className?: string;
  variant?: 'dark' | 'light';
}) {
  return (
    <img
      src={variant === 'light' ? LOGO_MARK_SRC : LOGO_SRC}
      alt=""
      className={`${className} object-contain`}
    />
  );
}

export function QapLaWordmark({
  className = '',
  variant = 'dark',
  onSecretUnlock,
}: {
  className?: string;
  variant?: 'dark' | 'light';
  onSecretUnlock?: () => void;
}) {
  const title = variant === 'light' ? 'text-white' : 'text-mint-700';
  const accent = variant === 'light' ? 'text-mint-200' : 'text-mint-400';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        aria-label="Qap La"
        onClick={onSecretUnlock}
        className="shrink-0 active:scale-95 transition"
      >
        <QapLaMark className="w-8 h-8" variant={variant} />
      </button>
      <span className={`font-display font-extrabold text-xl tracking-tight ${title}`}>
        Qap<span className={accent}>la</span>
      </span>
    </div>
  );
}
