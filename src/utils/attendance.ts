import type { AttendanceRecord, Player } from '../types';

export type AttendancePeriod = 'week' | 'month' | 'quarter' | 'semester' | 'season';

export const attendancePeriodLabels: Record<AttendancePeriod, string> = {
  week: '1 semana', month: '1 mes', quarter: '3 meses', semester: '6 meses', season: 'Temporada',
};

const rollingDays: Partial<Record<AttendancePeriod, number>> = { week: 7, month: 30, quarter: 90, semester: 180 };

export const filterAttendancePeriod = (items: AttendanceRecord[], period: AttendancePeriod, referenceDate: string) => {
  if (period === 'season') return items.filter((item) => item.date <= referenceDate);
  const end = new Date(`${referenceDate}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - ((rollingDays[period] ?? 1) - 1));
  const startKey = start.toISOString().slice(0, 10);
  return items.filter((item) => item.date >= startKey && item.date <= referenceDate);
};

export const attendanceSummary = (players: Player[], records: AttendanceRecord[]) => {
  const sessionDates = [...new Set(records.filter((record) => record.status !== 'pending').map((record) => record.date))].sort();
  const recordsByPlayer = new Map<string, Map<string, AttendanceRecord>>();
  records.forEach((record) => {
    if (!recordsByPlayer.has(record.playerId)) recordsByPlayer.set(record.playerId, new Map());
    recordsByPlayer.get(record.playerId)?.set(record.date, record);
  });
  const rows = players.map((player) => {
    const playerRecords = recordsByPlayer.get(player.id);
    const attended = sessionDates.reduce((total, date) => total + (playerRecords?.get(date)?.status === 'present' ? 1 : 0), 0);
    const absences = Math.max(0, sessionDates.length - attended);
    const percent = sessionDates.length ? Math.round((attended / sessionDates.length) * 100) : 0;
    return { playerId: player.id, playerName: player.name, number: player.number ?? player.order, attended, absences, percent };
  });
  const averagePercent = rows.length ? Math.round(rows.reduce((total, row) => total + row.percent, 0) / rows.length) : 0;
  return { sessionCount: sessionDates.length, averagePercent, perfectCount: rows.filter((row) => row.percent === 100 && sessionDates.length > 0).length, rows };
};
