import { Capacitor } from '@capacitor/core';

export function shouldUseLeafletMap() {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* web */
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !gl;
  } catch {
    return true;
  }
}
