import { BadgeCheck } from 'lucide-react';

export function VerifiedBadge({ verified, tone = 'green' }: { verified?: boolean | null; tone?: 'green' | 'onDark' }) {
  if (!verified) return null;
  const color = tone === 'onDark' ? 'text-emerald-300 drop-shadow' : 'text-emerald-500';
  return (
    <span title="Onaylı Firma" className={`inline-flex shrink-0 items-center ${color}`}>
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">Onaylı Firma</span>
    </span>
  );
}

export function FirmName({
  name,
  verified,
  className = '',
  tone = 'green',
}: {
  name: string;
  verified?: boolean | null;
  className?: string;
  tone?: 'green' | 'onDark';
}) {
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 ${className}`}>
      <span className="truncate">{name}</span>
      <VerifiedBadge verified={verified} tone={tone} />
    </span>
  );
}
