import { useEffect, useRef, useState } from 'react';
import { useSecretTaps } from '@/hooks/useSecretTaps';
import { LOGO_SRC } from '@/components/QapLaMark';

export function SplashScreen({
  onDone,
  onSecretUnlock,
}: {
  onDone: () => void;
  onSecretUnlock: () => void;
}) {
  const tapLogo = useSecretTaps(5, 2800);
  const started = useRef(false);
  const [leaving, setLeaving] = useState(false);

  const enter = () => {
    if (started.current) return;
    started.current = true;
    setLeaving(true);
    window.setTimeout(onDone, 280);
  };

  useEffect(() => {
    const timer = window.setTimeout(enter, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        if (tapLogo()) {
          started.current = true;
          onSecretUnlock();
          return;
        }
        enter();
      }}
      className={`splash-gate fixed inset-0 z-[3000] flex h-screen w-screen flex-col items-center justify-center overflow-hidden text-center ${leaving ? 'is-leaving' : ''}`}
      aria-label="Keşfetmeye başla"
    >
      <span className="splash-logo relative flex items-center justify-center">
        <span className="splash-glow" aria-hidden="true" />
        <img src={LOGO_SRC} alt="" className="relative z-[1] h-[120px] w-[120px] drop-shadow-lg" />
      </span>
      <p className="splash-title mt-6 font-display text-[2.15rem] font-extrabold leading-none tracking-tight text-[#2a353b]">
        Qap <span className="text-[#3d4a52]">LA</span>
      </p>
      <p className="mt-3 text-[13px] font-medium text-[#5b676e]">Devam etmek için dokun</p>
    </button>
  );
}
