import type { AuthRole, AuthSession, MatchInput, MatchRecord, Measurement, MeasurementInput, Player, TrainingSession } from '../types';

export interface DataService {
  authenticate(pin: string, role: AuthRole): Promise<AuthSession>;
  logout(token: string): Promise<void>;
  getPlayers(token: string): Promise<Player[]>;
  getMeasurements(token: string): Promise<Measurement[]>;
  getCurrentSession(token: string): Promise<TrainingSession>;
  saveMeasurement(token: string, input: MeasurementInput): Promise<Measurement>;
  getMatches(token: string): Promise<MatchRecord[]>;
  saveMatch(token: string, input: MatchInput): Promise<MatchRecord>;
}

export class DataServiceError extends Error {
  constructor(message: string, public code = 'DATA_ERROR') {
    super(message);
  }
}
