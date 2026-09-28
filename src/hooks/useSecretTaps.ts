import { useRef } from 'react';

export function useSecretTaps(required = 5, windowMs = 2600) {
  const taps = useRef<number[]>([]);

  return () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < windowMs), now];
    if (taps.current.length >= required) {
      taps.current = [];
      return true;
    }
    return false;
  };
}
