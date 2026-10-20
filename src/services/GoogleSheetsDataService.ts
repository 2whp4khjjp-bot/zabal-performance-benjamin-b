import type { AttendanceInput, AttendanceRecord, AuthRole, AuthSession, BootstrapData, MatchInput, MatchRecord, Measurement, MeasurementInput, Player, PlayerInput, TrainingSession } from '../types';
import type { DataService } from './DataService';
import { DataServiceError } from './DataService';

type ApiResponse<T> = { ok: boolean; data?: T; error?: string; code?: string };

export class GoogleSheetsDataService implements DataService {
  constructor(private readonly endpoint: string) {}

  private async request<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    if (!this.endpoint) throw new DataServiceError('Falta configurar la URL de Google Apps Script.', 'CONFIG');
    let response: Response | undefined;
    let serviceReached = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const candidate = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, ...payload }),
          credentials: 'omit',
          redirect: 'follow',
          cache: 'no-store',
        });
        serviceReached = true;
        if (candidate.ok) {
          response = candidate;
          break;
        }
      } catch {
        // La redirección temporal de Apps Script puede fallar de forma puntual.
      }
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 600 * (attempt + 1)));
    }
    if (!response) {
      if (serviceReached) throw new DataServiceError('No se pudo contactar con el servicio de datos.', 'NETWORK');
      throw new DataServiceError('No hay conexión. El formulario sigue guardado en este dispositivo.', 'OFFLINE');
    }
    const result = (await response.json()) as ApiResponse<T>;
    if (!result.ok || result.data === undefined) throw new DataServiceError(result.error || 'Error de datos.', result.code);
    return result.data;
  }

  authenticate(pin: string, role: AuthRole) {
    return this.request<AuthSession>('authenticate', { pin, role });
  }

  async logout(token: string) {
    await this.request<boolean>('logout', { token });
  }

  async getBootstrap(token: string) {
    try {
      return await this.request<BootstrapData>('getBootstrap', { token });
    } catch (error) {
      if (!(error instanceof DataServiceError) || error.code !== 'INVALID_ACTION') throw error;
      const [players, measurements, session] = await Promise.all([
        this.getPlayers(token), this.getMeasurements(token), this.getCurrentSession(token),
      ]);
      return { players, measurements, session };
    }
  }

  getPlayers(token: string) {
    return this.request<Player[]>('getPlayers', { token });
  }

  addPlayer(token: string, input: PlayerInput) {
    return this.request<Player>('addPlayer', { token, player: input });
  }

  updatePlayerNumber(token: string, playerId: string, number: number | undefined, expectedNumber: number | null | undefined) {
    return this.request<Player>('updatePlayerNumber', { token, playerId, number: number ?? null, expectedNumber: expectedNumber ?? null });
  }

  removePlayer(token: string, playerId: string) {
    return this.request<boolean>('removePlayer', { token, playerId });
  }

  getMeasurements(token: string) {
    return this.request<Measurement[]>('getMeasurements', { token });
  }

  getCurrentSession(token: string) {
    return this.request<TrainingSession>('getCurrentSession', { token });
  }

  saveMeasurement(token: string, input: MeasurementInput) {
    return this.request<Measurement>('saveMeasurement', { token, measurement: input });
  }

  getAttendance(token: string) {
    return this.request<AttendanceRecord[]>('getAttendance', { token });
  }

  saveAttendance(token: string, input: AttendanceInput) {
    return this.request<AttendanceRecord[]>('saveAttendance', { token, attendance: input });
  }

  getMatches(token: string) {
    return this.request<MatchRecord[]>('getMatches', { token });
  }

  saveMatch(token: string, input: MatchInput) {
    return this.request<MatchRecord>('saveMatch', { token, match: input });
  }

  updateMatch(token: string, matchId: string, input: MatchInput, expectedUpdatedAt: string) {
    return this.request<MatchRecord>('updateMatch', { token, matchId, match: input, expectedUpdatedAt });
  }
}
