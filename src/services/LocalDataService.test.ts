import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataService } from './LocalDataService';

describe('servicio local', () => {
  beforeEach(() => localStorage.clear());
  it('valida el PIN sin almacenarlo', async () => {
    const service = new LocalDataService();
    await expect(service.authenticate('9999', 'staff')).rejects.toThrow('PIN');
    const session = await service.authenticate('2026', 'staff');
    expect(session.token).toMatch(/^local-/);
    expect(JSON.stringify(localStorage)).not.toContain('2026');
  });
  it('guarda el control por fases sin borrar los datos anteriores', async () => {
    const service = new LocalDataService();
    const auth = await service.authenticate('2026', 'staff');
    const players = await service.getPlayers(auth.token);
    const session = await service.getCurrentSession(auth.token);
    const input = { playerId: players[0].id, playerName: players[0].name, weight: 72.5, comments: '', sessionId: session.id };
    await service.saveMeasurement(auth.token, input);
    const updated = await service.saveMeasurement(auth.token, { ...input, weight: undefined, fatigue: 5 });
    expect(updated.weight).toBe(72.5);
    expect(updated.fatigue).toBe(5);
  });
  it('no permite acceso con PIN de jugador', async () => {
    const service = new LocalDataService();
    await expect(service.authenticate('1001', 'player')).rejects.toThrow('cuerpo técnico');
  });
  it('guarda minutos, titularidades y goles solo para el cuerpo técnico', async () => {
    const service = new LocalDataService();
    const staff = await service.authenticate('2026', 'staff');
    const players = await service.getPlayers(staff.token);
    const saved = await service.saveMatch(staff.token, {
      date: '2026-08-09', type: 'official', opponent: 'UD Los Barrios', durationMinutes: 90,
      minutes: [{ playerId: players[0].id, playerName: players[0].name, minutes: 74, starter: true, goals: 2 }],
    });
    expect(saved.durationMinutes).toBe(90);
    const entry = (await service.getMatches(staff.token))[0].minutes[0];
    expect(entry).toMatchObject({ minutes: 74, starter: true, goals: 2 });

    await expect(service.authenticate('1001', 'player')).rejects.toThrow('cuerpo técnico');
  });
  it('edita un partido anterior sin duplicarlo y conserva el historial de una baja', async () => {
    const service = new LocalDataService();
    const staff = await service.authenticate('2026', 'staff');
    const player = await service.addPlayer(staff.token, { name: 'Jugador para corregir', number: 26 });
    const saved = await service.saveMatch(staff.token, {
      date: '2026-09-01', type: 'official', opponent: 'Rival original', durationMinutes: 60,
      minutes: [{ playerId: player.id, playerName: player.name, minutes: 40, starter: true, goals: 1 }],
    });
    await service.removePlayer(staff.token, player.id);
    const corrected = await service.updateMatch(staff.token, saved.id, {
      date: '2026-09-02', type: 'friendly', opponent: 'Rival corregido', durationMinutes: 50,
      minutes: [{ playerId: player.id, playerName: player.name, minutes: 35, starter: false, goals: 2 }],
    }, saved.updatedAt);
    expect(corrected).toMatchObject({ id: saved.id, date: '2026-09-02', type: 'friendly', opponent: 'Rival corregido', durationMinutes: 50 });
    expect((await service.getMatches(staff.token))).toHaveLength(1);
    expect((await service.getMatches(staff.token))[0].minutes[0]).toMatchObject({ minutes: 35, starter: false, goals: 2 });
    await expect(service.updateMatch(staff.token, saved.id, {
      date: '2026-09-02', type: 'friendly', opponent: 'Duplicado', durationMinutes: 50, minutes: corrected.minutes,
    }, saved.updatedAt)).rejects.toThrow('ha cambiado');
  });
  it('añade y da de baja jugadores sin perder el registro', async () => {
    const service = new LocalDataService();
    const staff = await service.authenticate('2026', 'staff');
    const originalCount = (await service.getPlayers(staff.token)).length;
    const player = await service.addPlayer(staff.token, { name: 'Nuevo Jugador', number: 25 });
    expect(await service.getPlayers(staff.token)).toHaveLength(originalCount + 1);
    await service.removePlayer(staff.token, player.id);
    expect(await service.getPlayers(staff.token)).toHaveLength(originalCount);
    await expect(service.addPlayer(staff.token, { name: 'Otro Jugador', number: 1 })).rejects.toThrow('dorsal');
  });
  it('guarda y modifica la asistencia manual de un día anterior', async () => {
    const service = new LocalDataService();
    const staff = await service.authenticate('2026', 'staff');
    const players = await service.getPlayers(staff.token);
    const date = '2026-08-20';
    await service.saveAttendance(staff.token, {
      date,
      entries: players.map((player) => ({ playerId: player.id, playerName: player.name, status: 'present', comments: '' })),
    });
    const updated = await service.saveAttendance(staff.token, {
      date,
      entries: players.map((player, index) => ({ playerId: player.id, playerName: player.name, status: index === 0 ? 'absent' : 'present', comments: index === 0 ? 'Avisado' : '' })),
    });
    expect(updated[0].status).toBe('absent');
    expect(updated[0].comments).toBe('Avisado');
    expect((await service.getAttendance(staff.token)).filter((item) => item.date === date)).toHaveLength(players.length);
  });
});
