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
  it('guarda minutos de partido solo para el cuerpo técnico', async () => {
    const service = new LocalDataService();
    const staff = await service.authenticate('2026', 'staff');
    const players = await service.getPlayers(staff.token);
    const saved = await service.saveMatch(staff.token, {
      date: '2026-08-09', type: 'official', opponent: 'UD Los Barrios', durationMinutes: 90,
      minutes: [{ playerId: players[0].id, playerName: players[0].name, minutes: 74 }],
    });
    expect(saved.durationMinutes).toBe(90);
    expect((await service.getMatches(staff.token))[0].minutes[0].minutes).toBe(74);

    await expect(service.authenticate('1001', 'player')).rejects.toThrow('cuerpo técnico');
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
