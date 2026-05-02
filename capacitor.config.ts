import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourname.cloudmusic',
  appName: 'Cloud Music',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Allow audio to play in background
    BackgroundRunner: {
      label: 'com.yourname.cloudmusic.background',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0A0A0A',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',           // dark icons on light bg / light icons on dark bg
      backgroundColor: '#0A0A0A',
    },
  },
};

export default config;
