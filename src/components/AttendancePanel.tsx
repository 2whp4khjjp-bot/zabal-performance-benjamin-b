import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, CircleDotDashed, Save, UserCheck, UserX } from 'lucide-react';
import type { AttendanceInput, AttendanceRecord, AttendanceStatus, Player } from '../types';
import { formatDate, todayKey } from '../utils/date';

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
  const [date, setDate] = useState(todayKey());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

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
    </div>

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
  </main>;
}
