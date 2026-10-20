import { appConfig, environment } from '../config';
import { createDemoMeasurements, createTodaySession, demoPlayers } from '../data/demo';
import type { AttendanceInput, AttendanceRecord, AuthRole, AuthSession, BootstrapData, MatchInput, MatchRecord, Measurement, MeasurementInput, Player, PlayerInput, TrainingSession } from '../types';
import { todayKey } from '../utils/date';
import { sanitizeComment } from '../utils/measurements';
import type { DataService } from './DataService';
import { DataServiceError } from './DataService';

const MEASUREMENTS_KEY = 'zabal-demo-measurements-v1';
const PLAYERS_KEY = 'zabal-demo-players-v1';
const MATCHES_KEY = 'zabal-demo-matches-v1';
const ATTENDANCE_KEY = 'zabal-benjamin-attendance-v1';

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
  return JSON.parse(JSON.stringify(fallback)) as T;
};

const validateMatch = (input: MatchInput, players: Player[], previous?: MatchRecord) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new DataServiceError('La fecha del partido no es válida.', 'VALIDATION');
  if (!['official', 'friendly'].includes(input.type)) throw new DataServiceError('El tipo de partido no es válido.', 'VALIDATION');
  const opponent = input.opponent.replace(/[<>]/g, '').trim().slice(0, 100);
  if (!opponent) throw new DataServiceError('Introduce el rival.', 'VALIDATION');
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 180) {
    throw new DataServiceError('La duración del partido no es válida.', 'VALIDATION');
  }
  const seen = new Set<string>();
  const previousIds = new Set(previous?.minutes.map((entry) => entry.playerId) ?? []);
  const previousByPlayer = new Map(previous?.minutes.map((entry) => [entry.playerId, entry]) ?? []);
  const minutes = input.minutes.map((entry) => {
    const player = players.find((item) => item.id === entry.playerId && (item.active || previousIds.has(item.id)));
    if (!player || player.name !== entry.playerName || seen.has(entry.playerId)) throw new DataServiceError('Hay un jugador no válido o repetido.', 'INVALID_PLAYER');
    if (!Number.isInteger(entry.minutes) || entry.minutes < 0 || entry.minutes > input.durationMinutes) {
      throw new DataServiceError(`Los minutos de ${entry.playerName} no son válidos.`, 'VALIDATION');
    }
    const goals = Number(entry.goals || 0);
    if (!Number.isInteger(goals) || goals < 0 || goals > 20) throw new DataServiceError(`Los goles de ${entry.playerName} no son válidos.`, 'VALIDATION');
    seen.add(entry.playerId);
    const formerNumber = previousByPlayer.get(player.id)?.number;
    return { playerId: player.id, playerName: player.name, number: formerNumber === undefined ? player.number ?? null : formerNumber, minutes: entry.minutes, starter: Boolean(entry.starter), goals };
  });
  if (!minutes.length) throw new DataServiceError('Introduce los datos de al menos un jugador.', 'VALIDATION');
  if (minutes.filter((entry) => entry.starter).length > appConfig.maxStarters) throw new DataServiceError(`No puedes marcar más de ${appConfig.maxStarters} titulares.`, 'VALIDATION');
  return { opponent, minutes };
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
      throw new DataServiceError('En este equipo el acceso está reservado al cuerpo técnico.', 'FORBIDDEN');
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

  async getBootstrap(token: string): Promise<BootstrapData> {
    const [players, measurements, session] = await Promise.all([
      this.getPlayers(token), this.getMeasurements(token), this.getCurrentSession(token),
    ]);
    return { players, measurements, session };
  }

  async getPlayers(token: string): Promise<Player[]> {
    const session = this.requireSession(token);
    const players = readJson(PLAYERS_KEY, demoPlayers).filter((player) => player.active).sort((a, b) => a.order - b.order);
    return session.role === 'player' ? players.filter((player) => player.id === session.playerId) : players;
  }

  async addPlayer(token: string, input: PlayerInput): Promise<Player> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede modificar la plantilla.', 'FORBIDDEN');
    const players = readJson(PLAYERS_KEY, demoPlayers);
    const name = input.name.replace(/[<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const number = input.number === undefined ? undefined : Number(input.number);
    if (name.length < 2) throw new DataServiceError('Introduce el nombre del jugador.', 'VALIDATION');
    if (number !== undefined && (!Number.isInteger(number) || number < 1 || number > 99)) throw new DataServiceError('El dorsal debe estar entre 1 y 99.', 'VALIDATION');
    if (players.some((player) => player.active && player.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) throw new DataServiceError('Ya hay un jugador activo con ese nombre.', 'DUPLICATE_PLAYER');
    if (number !== undefined && players.some((player) => player.active && player.number === number)) throw new DataServiceError('Ese dorsal ya está asignado.', 'DUPLICATE_NUMBER');
    const next: Player = { id: `player-${crypto.randomUUID()}`, name, number, active: true, order: Math.max(0, ...players.map((player) => player.order)) + 1, joinedAt: todayKey() };
    players.push(next);
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    return next;
  }

  async updatePlayerNumber(token: string, playerId: string, number: number | undefined, expectedNumber: number | null | undefined): Promise<Player> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede modificar la plantilla.', 'FORBIDDEN');
    if (number !== undefined && (!Number.isInteger(number) || number < 1 || number > 99)) throw new DataServiceError('El dorsal debe estar entre 1 y 99.', 'VALIDATION');
    const players = readJson(PLAYERS_KEY, demoPlayers);
    const player = players.find((item) => item.id === playerId && item.active);
    if (!player) throw new DataServiceError('El jugador ya no pertenece a la plantilla activa.', 'INVALID_PLAYER');
    if ((player.number ?? null) !== (expectedNumber ?? null)) throw new DataServiceError('El dorsal ha cambiado. Recarga la página antes de editarlo.', 'CONFLICT');
    if (number !== undefined && players.some((item) => item.active && item.id !== playerId && item.number === number)) throw new DataServiceError('Ese dorsal ya está asignado.', 'DUPLICATE_NUMBER');
    if ((number ?? null) === (player.number ?? null)) return player;
    const matches = readJson<MatchRecord[]>(MATCHES_KEY, []);
    matches.forEach((match) => match.minutes.forEach((entry) => {
      if (entry.playerId === playerId && entry.number === undefined) entry.number = player.number ?? null;
    }));
    localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
    player.number = number;
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    return player;
  }

  async removePlayer(token: string, playerId: string): Promise<boolean> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede modificar la plantilla.', 'FORBIDDEN');
    const players = readJson(PLAYERS_KEY, demoPlayers);
    const index = players.findIndex((player) => player.id === playerId && player.active);
    if (index < 0) throw new DataServiceError('El jugador ya no pertenece a la plantilla activa.', 'INVALID_PLAYER');
    players[index] = { ...players[index], active: false };
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    return true;
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
    const date = auth.role === 'staff' && input.date ? input.date : todayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayKey()) throw new DataServiceError('La fecha de la medición no es válida.', 'VALIDATION');
    const existingIndex = items.findIndex((item) => item.playerId === input.playerId && item.date === date);

    const now = new Date();
    const previous = existingIndex >= 0 ? items[existingIndex] : undefined;
    const previousCreatedAt = previous ? new Date(previous.createdAt).getTime() : NaN;
    if (previous && auth.role !== 'staff' && (!Number.isFinite(previousCreatedAt) || Date.now() - previousCreatedAt > 24 * 60 * 60 * 1000)) {
      throw new DataServiceError('Han pasado más de 24 horas. Solo el cuerpo técnico puede modificar este registro.', 'EDIT_WINDOW_EXPIRED');
    }
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

  async getAttendance(token: string): Promise<AttendanceRecord[]> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede consultar la asistencia.', 'FORBIDDEN');
    return readJson<AttendanceRecord[]>(ATTENDANCE_KEY, []).sort((a, b) => `${b.date}${b.updatedAt}`.localeCompare(`${a.date}${a.updatedAt}`));
  }

  async saveAttendance(token: string, input: AttendanceInput): Promise<AttendanceRecord[]> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede guardar la asistencia.', 'FORBIDDEN');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > todayKey()) throw new DataServiceError('La fecha de asistencia no es válida.', 'VALIDATION');
    const players = readJson(PLAYERS_KEY, demoPlayers).filter((player) => player.active);
    const playersById = new Map(players.map((player) => [player.id, player]));
    const seen = new Set<string>();
    const now = new Date().toISOString();
    const current = readJson<AttendanceRecord[]>(ATTENDANCE_KEY, []);
    const previousByPlayer = new Map(current.filter((item) => item.date === input.date).map((item) => [item.playerId, item]));
    const saved = input.entries.map((entry) => {
      const player = playersById.get(entry.playerId);
      if (!player || player.name !== entry.playerName || seen.has(entry.playerId)) throw new DataServiceError('Hay un jugador no válido o repetido.', 'INVALID_PLAYER');
      if (!['pending', 'present', 'absent'].includes(entry.status)) throw new DataServiceError(`Revisa la asistencia de ${entry.playerName}.`, 'VALIDATION');
      seen.add(entry.playerId);
      const previous = previousByPlayer.get(entry.playerId);
      return {
        id: previous?.id || crypto.randomUUID(), date: input.date, playerId: player.id, playerName: player.name,
        status: entry.status, comments: entry.comments.replace(/[<>]/g, '').trim().slice(0, 250),
        createdAt: previous?.createdAt || now, updatedAt: now, createdBy: 'cuerpo-tecnico',
      } as AttendanceRecord;
    });
    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify([...current.filter((item) => item.date !== input.date), ...saved]));
    return saved;
  }

  async getMatches(token: string): Promise<MatchRecord[]> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede consultar los partidos.', 'FORBIDDEN');
    const players = readJson(PLAYERS_KEY, demoPlayers);
    const numbers = new Map(players.map((player) => [player.id, player.number ?? null]));
    return readJson<MatchRecord[]>(MATCHES_KEY, []).map((match) => ({ ...match, minutes: match.minutes.map((entry) => ({
      ...entry, number: entry.number === undefined ? numbers.get(entry.playerId) ?? null : entry.number,
    })) })).sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
  }

  async saveMatch(token: string, input: MatchInput): Promise<MatchRecord> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede guardar partidos.', 'FORBIDDEN');
    const players = readJson(PLAYERS_KEY, demoPlayers);
    const { opponent, minutes } = validateMatch(input, players);
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

  async updateMatch(token: string, matchId: string, input: MatchInput, expectedUpdatedAt: string): Promise<MatchRecord> {
    const auth = this.requireSession(token);
    if (auth.role !== 'staff') throw new DataServiceError('Solo el cuerpo técnico puede modificar partidos.', 'FORBIDDEN');
    const matches = readJson<MatchRecord[]>(MATCHES_KEY, []);
    const index = matches.findIndex((match) => match.id === matchId);
    if (index < 0) throw new DataServiceError('No se encontró el partido.', 'NOT_FOUND');
    const previous = matches[index];
    if (previous.updatedAt !== expectedUpdatedAt) throw new DataServiceError('Este partido ha cambiado. Recarga la página antes de editarlo.', 'CONFLICT');
    const { opponent, minutes } = validateMatch(input, readJson(PLAYERS_KEY, demoPlayers), previous);
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(previous.updatedAt) + 1)).toISOString();
    const updated: MatchRecord = { ...previous, date: input.date, type: input.type, opponent, durationMinutes: input.durationMinutes, minutes, updatedAt };
    matches[index] = updated;
    localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
    return updated;
  }
}
