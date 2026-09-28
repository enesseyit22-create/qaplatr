import { QapLaMark, QapLaWordmark } from '@/components/QapLaMark';

export function DropletLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <div className={`${className} relative flex items-center justify-center`}>
      <div className="absolute inset-0 bg-mint-500 rounded-full opacity-20 blur-md" />
      <QapLaMark className="relative w-full h-full" />
    </div>
  );
}

export function DropletWordmark({
  className = '',
  variant = 'dark',
  onSecretUnlock,
}: {
  className?: string;
  variant?: 'dark' | 'light';
  onSecretUnlock?: () => void;
}) {
  return <QapLaWordmark className={className} variant={variant} onSecretUnlock={onSecretUnlock} />;
}
