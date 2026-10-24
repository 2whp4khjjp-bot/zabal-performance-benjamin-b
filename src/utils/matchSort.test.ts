import { describe, expect, it } from 'vitest';
import { sortMatchStats } from './matchSort';

const players = [
  { name: 'Ana', number: 9, minutes: 30, goals: 2, starts: 4, appearances: 5 },
  { name: 'Beto', number: 2, minutes: 60, goals: 1, starts: 2, appearances: 6 },
  { name: 'Carlos', number: null, minutes: 15, goals: 0, starts: 0, appearances: 1 },
];

describe('orden del historial de partidos', () => {
  it('ordena por dorsal ascendente y por minutos o goles descendentes', () => {
    expect(sortMatchStats(players, 'number').map((item) => item.name)).toEqual(['Beto', 'Ana', 'Carlos']);
    expect(sortMatchStats(players, 'minutes').map((item) => item.name)).toEqual(['Beto', 'Ana', 'Carlos']);
    expect(sortMatchStats(players, 'goals').map((item) => item.name)).toEqual(['Ana', 'Beto', 'Carlos']);
    expect(sortMatchStats(players, 'starts').map((item) => item.name)).toEqual(['Ana', 'Beto', 'Carlos']);
    expect(sortMatchStats(players, 'appearances').map((item) => item.name)).toEqual(['Beto', 'Ana', 'Carlos']);
    expect(players[0].name).toBe('Ana');
  });
});
