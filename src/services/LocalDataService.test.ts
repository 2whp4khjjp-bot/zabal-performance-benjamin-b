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
  it('el jugador solo puede leer y guardar sus propios datos', async () => {
    const service = new LocalDataService();
    const auth = await service.authenticate('1001', 'player');
    const players = await service.getPlayers(auth.token);
    const measurements = await service.getMeasurements(auth.token);
    expect(players).toHaveLength(1);
    expect(measurements.every((item) => item.playerId === players[0].id)).toBe(true);
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

    const player = await service.authenticate('1001', 'player');
    await expect(service.getMatches(player.token)).rejects.toThrow('cuerpo técnico');
  });
});
