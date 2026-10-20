import type { AttendanceInput, AttendanceRecord, AuthRole, AuthSession, BootstrapData, MatchInput, MatchRecord, Measurement, MeasurementInput, Player, PlayerInput, TrainingSession } from '../types';

export interface DataService {
  authenticate(pin: string, role: AuthRole): Promise<AuthSession>;
  logout(token: string): Promise<void>;
  getBootstrap(token: string): Promise<BootstrapData>;
  getPlayers(token: string): Promise<Player[]>;
  addPlayer(token: string, input: PlayerInput): Promise<Player>;
  updatePlayerNumber(token: string, playerId: string, number: number | undefined, expectedNumber: number | null | undefined): Promise<Player>;
  removePlayer(token: string, playerId: string): Promise<boolean>;
  getMeasurements(token: string): Promise<Measurement[]>;
  getCurrentSession(token: string): Promise<TrainingSession>;
  saveMeasurement(token: string, input: MeasurementInput): Promise<Measurement>;
  getAttendance(token: string): Promise<AttendanceRecord[]>;
  saveAttendance(token: string, input: AttendanceInput): Promise<AttendanceRecord[]>;
  getMatches(token: string): Promise<MatchRecord[]>;
  saveMatch(token: string, input: MatchInput): Promise<MatchRecord>;
  updateMatch(token: string, matchId: string, input: MatchInput, expectedUpdatedAt: string): Promise<MatchRecord>;
}

export class DataServiceError extends Error {
  constructor(message: string, public code = 'DATA_ERROR') {
    super(message);
  }
}
