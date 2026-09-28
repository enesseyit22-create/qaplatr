import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qapla.app',
  appName: 'Qap-la',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    backgroundColor: '#f7faf9',
    webView: {
      enableOnThemeChange: false,
    },
  },
  ios: {
    backgroundColor: '#f7faf9',
    contentInset: 'automatic',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Geolocation: {},
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
