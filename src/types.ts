export type Player = {
  id: string;
  name: string;
  number?: number;
  active: boolean;
  order: number;
  joinedAt: string;
};

export type Measurement = {
  id: string;
  date: string;
  time: string;
  createdAt: string;
  playerId: string;
  playerName: string;
  weight?: number;
  fatigue?: number;
  soreness?: number;
  comments: string;
  sessionId: string;
  createdBy: string;
  updatedAt: string;
  pendingSync?: boolean;
};

export type TrainingSession = {
  id: string;
  date: string;
  type: string;
  opponent?: string;
  matchday?: string;
  active: boolean;
  openedAt: string;
  closedAt?: string;
};

export type AlertLevel = 'pending' | 'partial' | 'normal' | 'moderate' | 'alert';

export type AuthRole = 'player' | 'staff';

export type AppConfig = {
  teamName: string;
  season: string;
  sessionDurationMinutes: number;
  thresholds: {
    moderateFrom: number;
    alertFrom: number;
    relevantWeightChangeKg: number;
  };
  colors: { navy: string; yellow: string };
  logoSrc: string;
};

export type AuthSession = {
  token: string;
  expiresAt: number;
  role: AuthRole;
  playerId?: string;
  playerName?: string;
};

export type DashboardFilter = 'all' | 'pending' | 'registered';

export type MeasurementInput = {
  playerId: string;
  playerName: string;
  weight?: number;
  fatigue?: number;
  soreness?: number;
  comments: string;
  sessionId: string;
};

export type ReportKind = 'daily' | 'weekly' | 'player' | 'alerts';

export type MatchType = 'official' | 'friendly';

export type MatchMinutes = {
  playerId: string;
  playerName: string;
  minutes: number;
};

export type MatchRecord = {
  id: string;
  date: string;
  type: MatchType;
  opponent: string;
  durationMinutes: number;
  minutes: MatchMinutes[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type MatchInput = {
  date: string;
  type: MatchType;
  opponent: string;
  durationMinutes: number;
  minutes: MatchMinutes[];
};
