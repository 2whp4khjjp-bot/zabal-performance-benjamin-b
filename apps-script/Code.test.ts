import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

class FakeSheet {
  constructor(public values: unknown[][]) {}
  getDataRange() { return { getValues: () => this.values.map((row) => [...row]) }; }
  getLastRow() { return this.values.length; }
  getLastColumn() { return Math.max(...this.values.map((row) => row.length)); }
  getRange(row: number, column: number, height = 1, width = 1) {
    return {
      getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => this.values[row - 1 + r]?.[column - 1 + c] ?? '')),
      setValue: (value: unknown) => { while (this.values.length < row) this.values.push([]); this.values[row - 1][column - 1] = value; return this; },
      setValues: (rows: unknown[][]) => { rows.forEach((items, r) => items.forEach((value, c) => { while (this.values.length < row + r) this.values.push([]); this.values[row - 1 + r][column - 1 + c] = value; })); return this; },
      setBackground: () => ({ setFontColor: () => ({ setFontWeight: () => undefined }) }),
    };
  }
  setFrozenRows() {}
  autoResizeColumns() {}
}

describe('Apps Script: cambio de dorsal', () => {
  it('congela el dorsal anterior de las actas y mantiene el id del jugador', () => {
    const players = new FakeSheet([
      ['id', 'nombre', 'dorsal', 'activo', 'orden', 'fecha_alta', 'pin_hash'],
      ['p1', 'Jugador Uno', 7, true, 1, '2026-08-01', ''],
      ['p2', 'Jugador Dos', 8, true, 2, '2026-08-01', ''],
    ]);
    const matches = new FakeSheet([
      ['id', 'fecha', 'tipo', 'rival', 'duracion_minutos', 'creado_en', 'actualizado_en', 'creado_por'],
      ['m1', '2026-09-01', 'official', 'Primer rival', 60, new Date('2026-09-01'), new Date('2026-09-01'), 'cuerpo-tecnico'],
    ]);
    const minutes = new FakeSheet([
      ['partido_id', 'jugador_id', 'jugador_nombre', 'minutos', 'goles', 'titular'],
      ['m1', 'p1', 'Jugador Uno', 42, 1, true],
      ['m1', 'p2', 'Jugador Dos', 60, 0, true],
    ]);
    const sheets: Record<string, FakeSheet> = { Jugadores: players, Partidos: matches, 'Minutos partidos': minutes };
    const spreadsheet = {
      getSheetByName: (name: string) => sheets[name],
      insertSheet: (name: string) => { sheets[name] = new FakeSheet([]); return sheets[name]; },
    };
    const context = {
      SpreadsheetApp: { openById: () => spreadsheet },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'sheet-id' }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
      Session: { getScriptTimeZone: () => 'Europe/Madrid' },
      Utilities: { formatDate: (value: string | Date) => new Date(value).toISOString().slice(0, 10) },
    } as Record<string, unknown>;
    runInNewContext(readFileSync(resolve(process.cwd(), 'apps-script/Code.gs'), 'utf8'), context);
    const changeNumber = context.updatePlayerNumber_ as (id: string, next: number, previous: number, session: object) => { number: number };
    const getMatches = context.getMatches_ as (session: object) => Array<{ minutes: Array<{ playerId: string; number: number }> }>;
    expect(changeNumber('p1', 12, 7, { role: 'staff' }).number).toBe(12);
    expect(players.values[1][2]).toBe(12);
    expect(minutes.values[1][1]).toBe('p1');
    expect(minutes.values[1][6]).toBe(7);
    expect(minutes.values[2][6]).toBeUndefined();
    expect(getMatches({ role: 'staff' })[0].minutes[0]).toMatchObject({ playerId: 'p1', number: 7 });
    expect(getMatches({ role: 'staff' })[0].minutes[1]).toMatchObject({ playerId: 'p2', number: 8 });
    expect(() => changeNumber('p1', 8, 12, { role: 'staff' })).toThrow('asignado');
    minutes.values.push(['m2', 'p1', 'Jugador Uno', 55, 0, true, 12]);
    changeNumber('p1', 15, 12, { role: 'staff' });
    expect(minutes.values[1][6]).toBe(7);
    expect(minutes.values[3][6]).toBe(12);
    const deleteMatch = context.deleteMatch_ as (id: string, expectedUpdatedAt: string, session: object) => boolean;
    expect(() => deleteMatch('m1', 'versión antigua', { role: 'staff' })).toThrow('ha cambiado');
    expect(deleteMatch('m1', '2026-09-01T00:00:00.000Z', { role: 'staff' })).toBe(true);
    expect(Object.prototype.toString.call(matches.values[1][8])).toBe('[object Date]');
    expect(getMatches({ role: 'staff' })).toHaveLength(0);
    expect(() => deleteMatch('m1', '2026-09-01T00:00:00.000Z', { role: 'staff' })).toThrow('No se encontró');
  });
});
