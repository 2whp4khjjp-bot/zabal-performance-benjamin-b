import { useMemo, useState } from 'react';
import { CalendarDays, Clock3, Goal, History, Pencil, Save, Star, Trash2, Trophy, UsersRound } from 'lucide-react';
import type { MatchInput, MatchRecord, MatchType, Player } from '../types';
import { todayKey } from '../utils/date';
import { appConfig } from '../config';
import { sortMatchStats, type MatchSort } from '../utils/matchSort';

const durationOptions = [40, 50, 60, 70, 80, 90] as const;

type Props = {
  players: Player[];
  matches: MatchRecord[];
  saving: boolean;
  onSave: (input: MatchInput) => Promise<boolean>;
  onUpdate: (match: MatchRecord, input: MatchInput) => Promise<boolean>;
  onDelete: (match: MatchRecord) => Promise<boolean>;
};

const typeLabel = (type: MatchType) => type === 'official' ? 'Oficial' : 'Amistoso';

export function MatchesPanel({ players, matches, saving, onSave, onUpdate, onDelete }: Props) {
  const [mode, setMode] = useState<'new' | 'history'>('new');
  const [sortBy, setSortBy] = useState<MatchSort>('minutes');
  const [formSortBy, setFormSortBy] = useState<MatchSort>('number');
  const [editing, setEditing] = useState<MatchRecord | null>(null);
  const [date, setDate] = useState(todayKey());
  const [type, setType] = useState<MatchType>('official');
  const [opponent, setOpponent] = useState('');
  const [durationOption, setDurationOption] = useState('90');
  const [customDuration, setCustomDuration] = useState('90');
  const [minutesByPlayer, setMinutesByPlayer] = useState<Record<string, string>>({});
  const [goalsByPlayer, setGoalsByPlayer] = useState<Record<string, string>>({});
  const [starterByPlayer, setStarterByPlayer] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const formPlayers = useMemo(() => {
    if (!editing) return players;
    const known = new Set(players.map((player) => player.id));
    const formerPlayers: Player[] = editing.minutes.filter((entry) => !known.has(entry.playerId)).map((entry, index) => ({
      id: entry.playerId, name: entry.playerName, active: false, order: players.length + index + 1, joinedAt: '',
    }));
    return [...players, ...formerPlayers];
  }, [players, editing]);

  const resetForm = () => {
    setEditing(null);
    setDate(todayKey());
    setType('official');
    setOpponent('');
    setDurationOption('90');
    setCustomDuration('90');
    setMinutesByPlayer({});
    setGoalsByPlayer({});
    setStarterByPlayer({});
    setErrors([]);
  };

  const editMatch = (match: MatchRecord) => {
    setEditing(match);
    setDate(match.date);
    setType(match.type);
    setOpponent(match.opponent);
    const value = String(match.durationMinutes);
    setDurationOption(durationOptions.some((option) => String(option) === value) ? value : 'custom');
    setCustomDuration(value);
    setMinutesByPlayer(Object.fromEntries(match.minutes.map((entry) => [entry.playerId, String(entry.minutes)])));
    setGoalsByPlayer(Object.fromEntries(match.minutes.map((entry) => [entry.playerId, String(entry.goals ?? 0)])));
    setStarterByPlayer(Object.fromEntries(match.minutes.map((entry) => [entry.playerId, Boolean(entry.starter)])));
    setErrors([]);
    setMode('new');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = (match: MatchRecord) => {
    if (window.confirm(`¿Eliminar el partido contra ${match.opponent} del ${match.date}? Dejará de contar en el historial y los acumulados.`)) {
      void onDelete(match);
    }
  };

  const duration = durationOption === 'custom' ? Number(customDuration) : Number(durationOption);
  const enteredValues = Object.values(minutesByPlayer).filter((value) => value !== '');
  const enteredCount = formPlayers.filter((player) => (minutesByPlayer[player.id] ?? '') !== '' || Boolean(starterByPlayer[player.id]) || Number(goalsByPlayer[player.id] || 0) > 0).length;
  const totalEnteredMinutes = enteredValues.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const starterCount = formPlayers.filter((player) => starterByPlayer[player.id]).length;

  const totals = useMemo(() => {
    const byPlayer = new Map<string, { player: Player; appearances: number; starts: number; minutes: number; goals: number }>();
    players.forEach((player) => byPlayer.set(player.id, { player, appearances: 0, starts: 0, minutes: 0, goals: 0 }));
    matches.forEach((match) => match.minutes.forEach((entry) => {
      if (!byPlayer.has(entry.playerId)) byPlayer.set(entry.playerId, { player: { id: entry.playerId, name: entry.playerName, number: entry.number, active: false, order: Number.MAX_SAFE_INTEGER, joinedAt: '' }, appearances: 0, starts: 0, minutes: 0, goals: 0 });
      const total = byPlayer.get(entry.playerId);
      if (!total) return;
      total.minutes += entry.minutes;
      total.goals += entry.goals ?? 0;
      if (entry.starter) total.starts += 1;
      if (entry.minutes > 0 || entry.starter || (entry.goals ?? 0) > 0) total.appearances += 1;
    }));
    return sortMatchStats([...byPlayer.values()].filter((item) => item.appearances || item.starts || item.minutes || item.goals).map((item) => ({ ...item, number: item.player.number, name: item.player.name })), sortBy);
  }, [matches, players, sortBy]);

  const validate = () => {
    const next: string[] = [];
    if (!date) next.push('Selecciona la fecha del partido.');
    if (!opponent.trim()) next.push('Introduce el rival.');
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) next.push('La duración debe estar entre 1 y 180 minutos.');
    if (!enteredCount) next.push('Introduce los datos de al menos un jugador.');
    if (starterCount > appConfig.maxStarters) next.push(`Puedes marcar como máximo ${appConfig.maxStarters} titulares.`);
    formPlayers.forEach((player) => {
      const raw = minutesByPlayer[player.id];
      const hasEntry = (raw ?? '') !== '' || Boolean(starterByPlayer[player.id]) || Number(goalsByPlayer[player.id] || 0) > 0;
      if (!hasEntry) return;
      const value = Number(raw || 0);
      if (!Number.isInteger(value) || value < 0 || value > duration) next.push(`Revisa los minutos de ${player.name}.`);
      const goals = Number(goalsByPlayer[player.id] || 0);
      if (!Number.isInteger(goals) || goals < 0 || goals > 20) next.push(`Revisa los goles de ${player.name}.`);
    });
    setErrors(next);
    return !next.length;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    const input: MatchInput = {
      date,
      type,
      opponent: opponent.trim(),
      durationMinutes: duration,
      minutes: formPlayers.flatMap((player) => {
        const raw = minutesByPlayer[player.id];
        const goals = Number(goalsByPlayer[player.id] || 0);
        const starter = Boolean(starterByPlayer[player.id]);
        return (raw === undefined || raw === '') && !starter && goals === 0 ? [] : [{ playerId: player.id, playerName: player.name, minutes: Number(raw || 0), starter, goals }];
      }),
    };
    if (await (editing ? onUpdate(editing, input) : onSave(input))) {
      resetForm();
      setMode('history');
    }
  };

  return (
    <main className="page-shell matches-page">
      <div className="page-heading matches-heading">
        <div><p className="eyebrow eyebrow--dark">Control de competición</p><h1>Partidos y actas</h1><p>Registra minutos, titularidades y goles de la plantilla.</p></div>
        <div className="matches-switch" role="tablist" aria-label="Vista de partidos">
          <button className={mode === 'new' && !editing ? 'active' : ''} onClick={() => { resetForm(); setMode('new'); }} role="tab" aria-selected={mode === 'new' && !editing}><Trophy size={18} /> Nuevo partido</button>
          <button className={mode === 'history' ? 'active' : ''} onClick={() => setMode('history')} role="tab" aria-selected={mode === 'history'}><History size={18} /> Historial</button>
        </div>
      </div>

      {mode === 'new' ? <form className="match-form" onSubmit={(event) => void submit(event)} noValidate>
        <section className="panel-card match-details-card">
          <div className="panel-card__heading"><div><p className="eyebrow eyebrow--dark">Datos del encuentro</p><h2>{editing ? `Editar partido · ${editing.opponent}` : 'Nuevo partido'}</h2></div><CalendarDays /></div>
          <div className="match-fields">
            <label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label>Tipo<select value={type} onChange={(event) => setType(event.target.value as MatchType)}><option value="official">Oficial</option><option value="friendly">Amistoso</option></select></label>
            <label className="match-field--wide">Rival<input value={opponent} maxLength={100} onChange={(event) => setOpponent(event.target.value)} placeholder="Nombre del equipo rival" /></label>
            <label className="match-field--wide">Duración total<select value={durationOption} onChange={(event) => setDurationOption(event.target.value)}>{durationOptions.map((value) => <option key={value} value={value}>{value} minutos</option>)}<option value="custom">Personalizado</option></select></label>
            {durationOption === 'custom' && <label className="match-field--wide">Minutos personalizados<input type="number" min="1" max="180" inputMode="numeric" value={customDuration} onChange={(event) => setCustomDuration(event.target.value)} /></label>}
          </div>
        </section>

        <section className="panel-card match-minutes-card">
          <div className="panel-card__heading match-minutes-heading">
            <div><p className="eyebrow eyebrow--dark">Participación</p><h2>Acta por jugador</h2><p>Deja los minutos vacíos si no participó.</p></div>
            <span className="duration-badge"><Clock3 size={16} /> Máximo {Number.isFinite(duration) ? duration : '—'}</span>
          </div>
          <div className="match-sort-control match-sort-control--form"><label htmlFor="match-form-sort">Ordenar jugadores por</label><select id="match-form-sort" value={formSortBy} onChange={(event) => setFormSortBy(event.target.value as MatchSort)}><option value="number">Dorsal</option><option value="minutes">Minutos</option><option value="goals">Goles</option></select></div>
          <div className="match-player-list">
            {sortMatchStats(formPlayers.map((player) => ({ ...player, number: editing?.minutes.find((entry) => entry.playerId === player.id)?.number ?? player.number, minutes: Number(minutesByPlayer[player.id] || 0), goals: Number(goalsByPlayer[player.id] || 0) })), formSortBy).map((player) => <label className="match-player-row" key={player.id}>
              <span className="match-player-number">{editing?.minutes.find((entry) => entry.playerId === player.id)?.number ?? (editing?.minutes.some((entry) => entry.playerId === player.id) ? '—' : player.number ?? '—')}</span>
              <span className="match-player-name">{player.name}{!player.active && <small className="former-player-label"> · baja</small>}</span>
              <span className={`match-starter ${starterByPlayer[player.id] ? 'active' : ''}`}><input type="checkbox" checked={Boolean(starterByPlayer[player.id])} disabled={!starterByPlayer[player.id] && starterCount >= appConfig.maxStarters} onChange={(event) => { setStarterByPlayer((current) => ({ ...current, [player.id]: event.target.checked })); setErrors([]); }} aria-label={`Titular: ${player.name}`} /><Star size={16} /><small>Tit.</small></span>
              <span className="match-minutes-input"><input type="number" min="0" max={Number.isFinite(duration) ? duration : undefined} step="1" inputMode="numeric" value={minutesByPlayer[player.id] ?? ''} onChange={(event) => { setMinutesByPlayer((current) => ({ ...current, [player.id]: event.target.value })); setErrors([]); }} aria-label={`Minutos de ${player.name}`} placeholder="—" /><small>min</small></span>
              <span className="match-goal-input"><Goal size={16} /><input type="number" min="0" max="20" step="1" inputMode="numeric" value={goalsByPlayer[player.id] ?? ''} onChange={(event) => { setGoalsByPlayer((current) => ({ ...current, [player.id]: event.target.value })); setErrors([]); }} aria-label={`Goles de ${player.name}`} placeholder="0" /></span>
            </label>)}
          </div>
          <div className="match-form-summary"><span><UsersRound size={17} /> <strong>{enteredCount}</strong> jugadores incluidos</span><span><Star size={17} /> <strong>{starterCount}/{appConfig.maxStarters}</strong> titulares</span><span><Clock3 size={17} /> <strong>{totalEnteredMinutes}</strong> minutos acumulados</span></div>
          {errors.length > 0 && <div className="validation-summary" role="alert"><strong>No se puede guardar todavía:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          <div className="match-save-bar"><button className="button button--primary button--wide" disabled={saving} type="submit"><Save size={19} /> {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar acta'}</button>{editing && <button className="button button--secondary" disabled={saving} type="button" onClick={() => { resetForm(); setMode('history'); }}>Cancelar</button>}</div>
        </section>
      </form> : <section className="matches-history" aria-label="Historial de partidos">
        <div className="matches-history-grid">
          <article className="panel-card match-totals-card">
            <div className="panel-card__heading"><div><p className="eyebrow eyebrow--dark">Temporada</p><h2>Totales por jugador</h2></div><span className="count-badge count-badge--blue">{matches.length}</span></div>
            <div className="match-sort-control"><label htmlFor="match-sort">Ordenar jugadores por</label><select id="match-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as MatchSort)}><option value="number">Dorsal</option><option value="minutes">Minutos</option><option value="goals">Goles</option></select></div>
            {totals.length ? <div className="table-scroll"><table><thead><tr><th>Dorsal</th><th>Jugador</th><th>Partidos</th><th>Tit.</th><th>Minutos</th><th>Goles</th></tr></thead><tbody>{totals.map((item) => <tr key={item.player.id}><td>{item.player.number ?? '—'}</td><td><strong>{item.player.name}</strong></td><td>{item.appearances}</td><td>{item.starts}</td><td><strong>{item.minutes}</strong></td><td><strong>{item.goals}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state compact"><UsersRound size={30} /><h2>Sin minutos registrados</h2><p>Los totales aparecerán después de guardar el primer partido.</p></div>}
          </article>
          <article className="panel-card recent-matches-card">
            <div className="panel-card__heading"><div><p className="eyebrow eyebrow--dark">Registro</p><h2>Últimos partidos</h2></div><History /></div>
            {matches.length ? <div className="recent-match-list">{matches.map((match) => <article className="recent-match-row" key={match.id}>
              <span className={`match-type-icon match-type-icon--${match.type}`}><Trophy size={18} /></span>
              <div><strong>{match.opponent}</strong><small>{match.date} · {typeLabel(match.type)} · {match.durationMinutes} min · {match.minutes.filter((item) => item.starter).length} titulares</small></div>
              <span className="recent-match-goals"><strong>{match.minutes.reduce((sum, item) => sum + (item.goals ?? 0), 0)}</strong><small>goles</small></span>
              <div className="match-row-actions"><button type="button" className="button button--secondary match-edit-button" disabled={saving} onClick={() => editMatch(match)} aria-label={`Editar partido contra ${match.opponent} del ${match.date}`}><Pencil size={16} /> Editar</button><button type="button" className="button button--secondary match-delete-button" disabled={saving} onClick={() => confirmDelete(match)} aria-label={`Eliminar partido contra ${match.opponent} del ${match.date}`}><Trash2 size={16} /> Eliminar</button></div>
              <details className="match-history-detail"><summary>Ver acta y dorsales de este partido</summary>
                <div className="table-scroll"><table><thead><tr><th>Dorsal</th><th>Jugador</th><th>Titular</th><th>Minutos</th><th>Goles</th></tr></thead><tbody>{sortMatchStats(match.minutes.map((entry) => ({ ...entry, name: entry.playerName })), sortBy).map((entry) => <tr key={entry.playerId}><td>{entry.number ?? '—'}</td><td>{entry.playerName}</td><td>{entry.starter ? 'Sí' : 'No'}</td><td>{entry.minutes}</td><td>{entry.goals ?? 0}</td></tr>)}</tbody></table></div>
              </details>
            </article>)}</div> : <div className="empty-state compact"><Trophy size={30} /><h2>Todavía no hay partidos</h2><button className="text-button" onClick={() => setMode('new')}>Registrar el primero</button></div>}
          </article>
        </div>
      </section>}
    </main>
  );
}
