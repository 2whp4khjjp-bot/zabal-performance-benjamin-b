import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, CheckCircle2, CircleDotDashed, Save, UserCheck, UserX } from 'lucide-react';
import type { AttendanceInput, AttendanceRecord, AttendanceStatus, Player } from '../types';
import { formatDate, todayKey } from '../utils/date';
import { attendancePeriodLabels, attendanceSummary, filterAttendancePeriod, type AttendancePeriod } from '../utils/attendance';

type Props = {
  players: Player[];
  attendance: AttendanceRecord[];
  saving: boolean;
  onSave: (input: AttendanceInput) => Promise<boolean>;
};

type Draft = { status: AttendanceStatus; comments: string };

const labels: Record<AttendanceStatus, string> = {
  pending: 'Pendiente',
  present: 'Presente',
  absent: 'No presente',
};

export function AttendancePanel({ players, attendance, saving, onSave }: Props) {
  const roster = useMemo(() => players.filter((player) => player.active).sort((a, b) => a.order - b.order), [players]);
  const [mode, setMode] = useState<'daily' | 'stats'>('daily');
  const [date, setDate] = useState(todayKey());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [period, setPeriod] = useState<AttendancePeriod>('week');

  useEffect(() => {
    const saved = new Map(attendance.filter((item) => item.date === date).map((item) => [item.playerId, item]));
    setDrafts(Object.fromEntries(roster.map((player) => {
      const existing = saved.get(player.id);
      return [player.id, { status: existing?.status ?? 'pending', comments: existing?.comments ?? '' }];
    })));
  }, [attendance, date, roster]);

  const counts = useMemo(() => Object.values(drafts).reduce((total, item) => {
    total[item.status] += 1;
    return total;
  }, { pending: 0, present: 0, absent: 0 } as Record<AttendanceStatus, number>), [drafts]);
  const filteredRecords = useMemo(() => filterAttendancePeriod(attendance, period, todayKey()), [attendance, period]);
  const summary = useMemo(() => attendanceSummary(roster, filteredRecords), [roster, filteredRecords]);

  const update = (playerId: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [playerId]: { ...current[playerId], ...patch } }));
  };

  const markAllPresent = () => {
    setDrafts((current) => Object.fromEntries(roster.map((player) => [player.id, { ...current[player.id], status: 'present' as const }])))
  };

  const submit = () => onSave({
    date,
    entries: roster.map((player) => ({
      playerId: player.id,
      playerName: player.name,
      status: drafts[player.id]?.status ?? 'pending',
      comments: drafts[player.id]?.comments ?? '',
    })),
  });

  return <main className="page-shell attendance-page">
    <div className="page-heading attendance-heading">
      <div>
        <p className="eyebrow eyebrow--dark">CONTROL DE ENTRENAMIENTOS</p>
        <h1>Asistencia al entreno</h1>
        <p>Registro manual, independiente del pesaje. Puedes elegir cualquier día anterior y corregirlo.</p>
      </div>
      <div className="matches-switch" role="tablist" aria-label="Vista de asistencia">
        <button type="button" className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')}><UserCheck size={17} /> Asistencia</button>
        <button type="button" className={mode === 'stats' ? 'active' : ''} onClick={() => setMode('stats')}><BarChart3 size={17} /> Estadísticas</button>
      </div>
    </div>

    {mode === 'daily' ? <>
    <section className="panel-card attendance-toolbar">
      <label><CalendarDays size={18} /><span>Fecha del entrenamiento</span><input type="date" max={todayKey()} value={date} onChange={(event) => setDate(event.target.value || todayKey())} /></label>
      <div className="attendance-counts">
        <span><strong>{counts.present}</strong> presentes</span>
        <span><strong>{counts.absent}</strong> no presentes</span>
        <span><strong>{counts.pending}</strong> pendientes</span>
      </div>
      <button type="button" className="button button--secondary" onClick={markAllPresent}><UserCheck size={17} /> Marcar todos presentes</button>
    </section>

    <section className="panel-card attendance-list-card">
      <div className="panel-card__heading">
        <div><p className="eyebrow eyebrow--dark">{formatDate(date)}</p><h2>Estado de la plantilla</h2></div>
        <small>{roster.length} jugadores</small>
      </div>
      <div className="attendance-list">
        {roster.map((player) => {
          const draft = drafts[player.id] ?? { status: 'pending' as const, comments: '' };
          const StatusIcon = draft.status === 'present' ? CheckCircle2 : draft.status === 'absent' ? UserX : CircleDotDashed;
          return <article className={`attendance-row attendance-row--${draft.status}`} key={player.id}>
            <span className="attendance-number">{player.number ?? player.order}</span>
            <strong>{player.name}</strong>
            <select value={draft.status} onChange={(event) => update(player.id, { status: event.target.value as AttendanceStatus })} aria-label={`Asistencia de ${player.name}`}>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className="attendance-status-mark"><StatusIcon size={18} />{labels[draft.status]}</span>
            <input className="attendance-comment" value={draft.comments} maxLength={250} onChange={(event) => update(player.id, { comments: event.target.value })} placeholder="Observación opcional" aria-label={`Observación de ${player.name}`} />
          </article>;
        })}
      </div>
      <div className="attendance-save-bar">
        <span>{counts.present} presentes · {counts.absent} no presentes · {counts.pending} pendientes</span>
        <button type="button" className="button button--primary" disabled={saving} onClick={() => void submit()}><Save size={18} /> {saving ? 'Guardando…' : 'Guardar asistencia del día'}</button>
      </div>
    </section>
    </> : <>
      <section className="panel-card attendance-ranking-filters">
        <div><p className="eyebrow eyebrow--dark">PERIODO</p><h2>Resumen de asistencia</h2></div>
        <div className="attendance-period-buttons">{(Object.keys(attendancePeriodLabels) as AttendancePeriod[]).map((value) => <button type="button" key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{attendancePeriodLabels[value]}</button>)}</div>
      </section>
      <section className="panel-card attendance-summary-card">
        <div className="attendance-summary-metrics"><span><strong>{summary.sessionCount}</strong> entrenamientos</span><span><strong>{summary.averagePercent}%</strong> asistencia media</span><span><strong>{summary.perfectCount}</strong> jugadores al 100%</span></div>
        <div className="table-wrap"><table className="attendance-summary-table"><thead><tr><th>Dorsal</th><th>Jugador</th><th>Asistencias</th><th>No presente</th><th>Porcentaje</th></tr></thead><tbody>{summary.rows.map((row) => <tr key={row.playerId}><td>{row.number}</td><td><strong>{row.playerName}</strong></td><td>{row.attended} / {summary.sessionCount}</td><td>{row.absences}</td><td><div className={`attendance-rate ${row.percent < 80 ? 'attendance-rate--low' : ''}`}><span>{row.percent}%</span><i><b style={{ width: `${row.percent}%` }} /></i></div></td></tr>)}</tbody></table></div>
      </section>
    </>}
  </main>;
}
