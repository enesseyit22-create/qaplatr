import type { ReactNode } from 'react';

/** Leaflet maps do not need a Google API provider. */
export function QaplaMapsProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useQaplaMapsReady() {
  return true;
}
