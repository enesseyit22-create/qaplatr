import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export function useAndroidBackButton(onBack: () => void) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const listener = App.addListener('backButton', () => {
      onBack();
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [onBack]);
}
