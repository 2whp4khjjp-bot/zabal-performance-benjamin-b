import type { AuthRole, AuthSession, MatchInput, MatchRecord, Measurement, MeasurementInput, Player, TrainingSession } from '../types';
import type { DataService } from './DataService';
import { DataServiceError } from './DataService';

type ApiResponse<T> = { ok: boolean; data?: T; error?: string; code?: string };

export class GoogleSheetsDataService implements DataService {
  constructor(private readonly endpoint: string) {}

  private async request<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    if (!this.endpoint) throw new DataServiceError('Falta configurar la URL de Google Apps Script.', 'CONFIG');
    let response: Response;
    for (let attempt = 0; ; attempt += 1) {
      try {
        response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, ...payload }),
        });
        break;
      } catch {
        if (attempt >= 1) throw new DataServiceError('No hay conexión. El formulario sigue guardado en este dispositivo.', 'OFFLINE');
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
    }
    if (!response.ok) throw new DataServiceError('No se pudo contactar con el servicio de datos.', 'NETWORK');
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

  getPlayers(token: string) {
    return this.request<Player[]>('getPlayers', { token });
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

  getMatches(token: string) {
    return this.request<MatchRecord[]>('getMatches', { token });
  }

  saveMatch(token: string, input: MatchInput) {
    return this.request<MatchRecord>('saveMatch', { token, match: input });
  }
}
