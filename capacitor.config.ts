import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shikshantar.academy',
  appName: 'Shikshantar Academy',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
