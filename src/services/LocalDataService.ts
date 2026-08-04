import { appConfig, environment } from '../config';
import { createDemoMeasurements, createTodaySession, demoPlayers } from '../data/demo';
import type { AuthRole, AuthSession, MatchInput, MatchRecord, Measurement, MeasurementInput, Player, TrainingSession } from '../types';
import { todayKey } from '../utils/date';
import { sanitizeComment } from '../utils/measurements';
import type { DataService } from './DataService';
import { DataServiceError } from './DataService';

const MEASUREMENTS_KEY = 'zabal-demo-measurements-v1';
const PLAYERS_KEY = 'zabal-demo-players-v1';
const MATCHES_KEY = 'zabal-demo-matches-v1';

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored) as T;
    localStorage.setItem(key, JSON.stringify(fallback));
  } catch (error) {
    console.warn('No se pudo leer el almacenamiento local.', error);
  }
  return fallback;
};

export class LocalDataService implements DataService {
  private sessions = new Map<string, AuthSession>();

  private requireSession(token: string) {
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) throw new DataServiceError('La sesión ya no es válida.', 'UNAUTHORIZED');
    return session;
  }

  async authenticate(pin: string, role: AuthRole): Promise<AuthSession> {
    let player: Player | undefined;
    if (role === 'staff') {
      const inputHash = await sha256(pin);
      if (inputHash !== environment.staffPinHash) throw new DataServiceError('El PIN del cuerpo técnico no es correcto.', 'INVALID_PIN');
    } else {
      const players = readJson(PLAYERS_KEY, demoPlayers).filter((item) => item.active).sort((a, b) => a.order - b.order);
      const playerIndex = Number(pin) - 1001;
      player = /^\d{4}$/.test(pin) ? players[playerIndex] : undefined;
      if (!player) throw new DataServiceError('El PIN de jugador no es correcto.', 'INVALID_PIN');
    }
    const session: AuthSession = {
      token: `local-${crypto.randomUUID()}`,
      expiresAt: Date.now() + appConfig.sessionDurationMinutes * 60 * 1000,
      role,
      playerId: player?.id,
      playerName: player?.name,
    };
    this.sessions.set(session.token, session);
    return session;
  }

  async logout(token: string): Promise<void> { this.sessions.delete(token); }

  async getPlayers(token: string): Promise<Player[]> {
    const session = this.requireSession(token);
    const players = readJson(PLAYERS_KEY, demoPlayers).filter((player) => player.active).sort((a, b) => a.order - b.order);
    return session.role === 'player' ? players.filter((player) => player.id === session.playerId) : players;
  }

  async getMeasurements(token: string): Promise<Measurement[]> {
    const session = this.requireSession(token);
    const measurements = readJson(MEASUREMENTS_KEY, createDemoMeasurements());
    return session.role === 'player' ? measurements.filter((item) => item.playerId === session.playerId) : measurements;
  }

  async getCurrentSession(token: string): Promise<TrainingSession> {
    this.requireSession(token);
    return createTodaySession();
  }

  async saveMeasurement(token: string, input: MeasurementInput): Promise<Measurement> {
    const auth = this.requireSession(token);
    if (auth.role === 'player' && auth.playerId !== input.playerId) throw new DataServiceError('No puedes guardar datos de otro jugador.', 'FORBIDDEN');
    const players = readJson(PLAYERS_KEY, demoPlayers);
    const player = players.find((item) => item.id === input.playerId);
    if (!player || player.name !== input.playerName) throw new DataServiceError('Jugador no válido.', 'INVALID_PLAYER');
    if (input.weight !== undefined && (input.weight < 30 || input.weight > 250)) throw new DataServiceError('El peso no es válido.', 'VALIDATION');
    const scores = [input.fatigue, input.soreness].filter((value): value is number => value !== undefined);
    if (!scores.every((value) => Number.isInteger(value) && value >= 1 && value <= 10)) {
      throw new DataServiceError('Los valores deben estar entre 1 y 10.', 'VALIDATION');
    }
    if (input.weight === undefined && input.fatigue === undefined && input.soreness === undefined && !input.comments.trim()) {
      throw new DataServiceError('Rellena al menos un dato antes de guardar.', 'VALIDATION');
    }

    const items = readJson(MEASUREMENTS_KEY, createDemoMeasurements());
    const date = todayKey();
    const existingIndex = items.findIndex((item) => item.playerId === input.playerId && item.date === date);

    const now = new Date();
    const previous = existingIndex >= 0 ? items[existingIndex] : undefined;
    const measurement: Measurement = {
      id: previous?.id || crypto.randomUUID(),
      date,
      time: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      createdAt: previous?.createdAt || now.toISOString(),
      playerId: player.id,
      playerName: player.name,
      weight: input.weight === undefined ? previous?.weight : Number(input.weight.toFixed(2)),
      fatigue: input.fatigue ?? previous?.fatigue,
      soreness: input.soreness ?? previous?.soreness,
      comments: sanitizeComment(input.comments),
      sessionId: input.sessionId,
      createdBy: auth.role === 'player' ? `jugador:${player.id}` : 'cuerpo-tecnico',
      updatedAt: now.toISOString(),
    };

    if (existingIndex >= 0) items[existingIndex] = measurement;
    else items.push(measurement);
    localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify(items));
    return measurement;
  }

  async getMatches(token: string): Promise<MatchRecord[]> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede consultar los partidos.', 'FORBIDDEN');
    return readJson<MatchRecord[]>(MATCHES_KEY, []).sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
  }

  async saveMatch(token: string, input: MatchInput): Promise<MatchRecord> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede guardar partidos.', 'FORBIDDEN');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new DataServiceError('La fecha del partido no es válida.', 'VALIDATION');
    if (!['official', 'friendly'].includes(input.type)) throw new DataServiceError('El tipo de partido no es válido.', 'VALIDATION');
    const opponent = input.opponent.replace(/[<>]/g, '').trim().slice(0, 100);
    if (!opponent) throw new DataServiceError('Introduce el rival.', 'VALIDATION');
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 180) {
      throw new DataServiceError('La duración del partido no es válida.', 'VALIDATION');
    }
    const players = readJson(PLAYERS_KEY, demoPlayers);
    const seen = new Set<string>();
    const minutes = input.minutes.map((entry) => {
      const player = players.find((item) => item.id === entry.playerId && item.active);
      if (!player || player.name !== entry.playerName || seen.has(entry.playerId)) throw new DataServiceError('Hay un jugador no válido o repetido.', 'INVALID_PLAYER');
      if (!Number.isInteger(entry.minutes) || entry.minutes < 0 || entry.minutes > input.durationMinutes) {
        throw new DataServiceError(`Los minutos de ${entry.playerName} no son válidos.`, 'VALIDATION');
      }
      seen.add(entry.playerId);
      return { playerId: player.id, playerName: player.name, minutes: entry.minutes };
    });
    if (!minutes.length) throw new DataServiceError('Introduce los minutos de al menos un jugador.', 'VALIDATION');
    const now = new Date().toISOString();
    const match: MatchRecord = {
      id: crypto.randomUUID(), date: input.date, type: input.type, opponent,
      durationMinutes: input.durationMinutes, minutes, createdAt: now, updatedAt: now, createdBy: 'cuerpo-tecnico',
    };
    const matches = readJson<MatchRecord[]>(MATCHES_KEY, []);
    matches.push(match);
    localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
    return match;
  }
}
