import { describe, expect, it } from 'vitest';
import { buildMatchMinutesPdf, type MatchMinutesTotal } from './matchMinutesPdf';

describe('informe de minutos jugados', () => {
  it('genera un PDF paginado con los jugadores en el orden recibido', async () => {
    const totals: MatchMinutesTotal[] = Array.from({ length: 52 }, (_, index) => ({
      player: { id: `p${index}`, name: `Jugador ${String(index + 1).padStart(2, '0')}`, number: index + 1, active: true, order: index, joinedAt: '2026-08-01' },
      appearances: 2,
      starts: 1,
      minutes: 90 - index,
      goals: index % 3,
    }));
    const pdf = await buildMatchMinutesPdf({ totals, matches: [{
      id: 'm1', date: '2026-10-18', type: 'official', opponent: 'Rival', durationMinutes: 60,
      minutes: [], createdAt: '2026-10-18T10:00:00.000Z', updatedAt: '2026-10-18T10:00:00.000Z', createdBy: 'cuerpo-tecnico',
    }], sortBy: 'minutes' });
    const output = pdf.output();
    expect(output.startsWith('%PDF-')).toBe(true);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(output.indexOf('Jugador 01')).toBeLessThan(output.indexOf('Jugador 02'));
    expect(output).toContain('Minutos jugados');
  });
});
