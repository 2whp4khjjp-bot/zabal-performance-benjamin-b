import type { AppConfig } from './types';

export const appConfig: AppConfig = {
  teamName: import.meta.env.VITE_TEAM_NAME || 'Atlético Zabal Linense · Benjamín B',
  season: '2026-27',
  sessionDurationMinutes: 30,
  thresholds: {
    moderateFrom: 4,
    alertFrom: 7,
    relevantWeightChangeKg: 1.5,
  },
  colors: { navy: '#16365f', yellow: '#f6ca3b' },
  logoSrc: `${import.meta.env.BASE_URL}assets/logo-placeholder.svg`,
  maxStarters: Number(import.meta.env.VITE_MAX_STARTERS || 7),
};

export const environment = {
  dataProvider: import.meta.env.VITE_DATA_PROVIDER || 'local',
  staffPinHash:
    import.meta.env.VITE_STAFF_PIN_SHA256 ||
    '158a323a7ba44870f23d96f1516dd70aa48e9a72db4ebb026b0a89e212a208ab',
  appsScriptUrl: import.meta.env.VITE_APPS_SCRIPT_URL || '',
  publicUrl: import.meta.env.VITE_PUBLIC_URL || window.location.origin,
};
