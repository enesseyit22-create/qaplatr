import { useEffect, useState } from 'react';

const EVENT = 'qapla-error-toast';

export function showErrorToast(message: string) {
  const text = message.trim();
  if (!text) return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: text }));
}

export function ErrorToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let hide: number | null = null;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setMessage(detail);
      if (hide) window.clearTimeout(hide);
      hide = window.setTimeout(() => setMessage(null), 4200);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      if (hide) window.clearTimeout(hide);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.85rem,env(safe-area-inset-top))] z-[4000] flex justify-center px-4">
      <p className="pointer-events-auto max-w-[420px] rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg">
        {message}
      </p>
    </div>
  );
}
