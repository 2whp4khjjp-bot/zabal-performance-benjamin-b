import { useMemo, useState } from 'react';
import { CalendarDays, Clock3, History, Save, Trophy, UsersRound } from 'lucide-react';
import type { MatchInput, MatchRecord, MatchType, Player } from '../types';
import { todayKey } from '../utils/date';

const durationOptions = [40, 50, 60, 70, 80, 90] as const;

type Props = {
  players: Player[];
  matches: MatchRecord[];
  saving: boolean;
  onSave: (input: MatchInput) => Promise<boolean>;
};

const typeLabel = (type: MatchType) => type === 'official' ? 'Oficial' : 'Amistoso';

export function MatchesPanel({ players, matches, saving, onSave }: Props) {
  const [mode, setMode] = useState<'new' | 'history'>('new');
  const [date, setDate] = useState(todayKey());
  const [type, setType] = useState<MatchType>('official');
  const [opponent, setOpponent] = useState('');
  const [durationOption, setDurationOption] = useState('90');
  const [customDuration, setCustomDuration] = useState('90');
  const [minutesByPlayer, setMinutesByPlayer] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const duration = durationOption === 'custom' ? Number(customDuration) : Number(durationOption);
  const enteredValues = Object.values(minutesByPlayer).filter((value) => value !== '');
  const enteredCount = enteredValues.length;
  const totalEnteredMinutes = enteredValues.reduce((sum, value) => sum + (Number(value) || 0), 0);

  const totals = useMemo(() => {
    const byPlayer = new Map<string, { player: Player; appearances: number; minutes: number }>();
    players.forEach((player) => byPlayer.set(player.id, { player, appearances: 0, minutes: 0 }));
    matches.forEach((match) => match.minutes.forEach((entry) => {
      const total = byPlayer.get(entry.playerId);
      if (!total) return;
      total.minutes += entry.minutes;
      if (entry.minutes > 0) total.appearances += 1;
    }));
    return [...byPlayer.values()].filter((item) => item.appearances || item.minutes).sort((a, b) => b.minutes - a.minutes || a.player.order - b.player.order);
  }, [matches, players]);

  const validate = () => {
    const next: string[] = [];
    if (!date) next.push('Selecciona la fecha del partido.');
    if (!opponent.trim()) next.push('Introduce el rival.');
    if (!Number.isInteger(duration) || duration < 1 || duration > 180) next.push('La duración debe estar entre 1 y 180 minutos.');
    if (!enteredCount) next.push('Introduce los minutos de al menos un jugador.');
    players.forEach((player) => {
      const raw = minutesByPlayer[player.id];
      if (raw === undefined || raw === '') return;
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > duration) next.push(`Revisa los minutos de ${player.name}.`);
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
      minutes: players.flatMap((player) => {
        const raw = minutesByPlayer[player.id];
        return raw === undefined || raw === '' ? [] : [{ playerId: player.id, playerName: player.name, minutes: Number(raw) }];
      }),
    };
    if (await onSave(input)) {
      setOpponent('');
      setMinutesByPlayer({});
      setErrors([]);
      setMode('history');
    }
  };

  return (
    <main className="page-shell matches-page">
      <div className="page-heading matches-heading">
        <div><p className="eyebrow eyebrow--dark">Control de competición</p><h1>Partidos y minutos</h1><p>Registra manualmente la participación de la plantilla.</p></div>
        <div className="matches-switch" role="tablist" aria-label="Vista de partidos">
          <button className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')} role="tab" aria-selected={mode === 'new'}><Trophy size={18} /> Nuevo partido</button>
          <button className={mode === 'history' ? 'active' : ''} onClick={() => setMode('history')} role="tab" aria-selected={mode === 'history'}><History size={18} /> Historial</button>
        </div>
      </div>

      {mode === 'new' ? <form className="match-form" onSubmit={(event) => void submit(event)} noValidate>
        <section className="panel-card match-details-card">
          <div className="panel-card__heading"><div><p className="eyebrow eyebrow--dark">Datos del encuentro</p><h2>Nuevo partido</h2></div><CalendarDays /></div>
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
            <div><p className="eyebrow eyebrow--dark">Participación</p><h2>Minutos por jugador</h2><p>Deja el campo vacío si no participó.</p></div>
            <span className="duration-badge"><Clock3 size={16} /> Máximo {Number.isFinite(duration) ? duration : '—'}</span>
          </div>
          <div className="match-player-list">
            {players.map((player) => <label className="match-player-row" key={player.id}>
              <span className="match-player-number">{player.number ?? player.order}</span>
              <span className="match-player-name">{player.name}</span>
              <span className="match-minutes-input"><input type="number" min="0" max={Number.isFinite(duration) ? duration : undefined} step="1" inputMode="numeric" value={minutesByPlayer[player.id] ?? ''} onChange={(event) => { setMinutesByPlayer((current) => ({ ...current, [player.id]: event.target.value })); setErrors([]); }} aria-label={`Minutos de ${player.name}`} placeholder="—" /><small>min</small></span>
            </label>)}
          </div>
          <div className="match-form-summary"><span><UsersRound size={17} /> <strong>{enteredCount}</strong> con minutos</span><span><Clock3 size={17} /> <strong>{totalEnteredMinutes}</strong> minutos acumulados</span></div>
          {errors.length > 0 && <div className="validation-summary" role="alert"><strong>No se puede guardar todavía:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          <div className="match-save-bar"><button className="button button--primary button--wide" disabled={saving} type="submit"><Save size={19} /> {saving ? 'Guardando…' : 'Guardar minutos'}</button></div>
        </section>
      </form> : <section className="matches-history" aria-label="Historial de partidos">
        <div className="matches-history-grid">
          <article className="panel-card match-totals-card">
            <div className="panel-card__heading"><div><p className="eyebrow eyebrow--dark">Temporada</p><h2>Totales por jugador</h2></div><span className="count-badge count-badge--blue">{matches.length}</span></div>
            {totals.length ? <div className="table-scroll"><table><thead><tr><th>Jugador</th><th>Partidos</th><th>Minutos</th></tr></thead><tbody>{totals.map((item) => <tr key={item.player.id}><td><strong>{item.player.name}</strong></td><td>{item.appearances}</td><td><strong>{item.minutes}</strong></td></tr>)}</tbody></table></div> : <div className="empty-state compact"><UsersRound size={30} /><h2>Sin minutos registrados</h2><p>Los totales aparecerán después de guardar el primer partido.</p></div>}
          </article>
          <article className="panel-card recent-matches-card">
            <div className="panel-card__heading"><div><p className="eyebrow eyebrow--dark">Registro</p><h2>Últimos partidos</h2></div><History /></div>
            {matches.length ? <div className="recent-match-list">{matches.map((match) => <article className="recent-match-row" key={match.id}><span className={`match-type-icon match-type-icon--${match.type}`}><Trophy size={18} /></span><div><strong>{match.opponent}</strong><small>{match.date} · {typeLabel(match.type)} · {match.durationMinutes} min</small></div><span><strong>{match.minutes.filter((item) => item.minutes > 0).length}</strong><small>jugadores</small></span></article>)}</div> : <div className="empty-state compact"><Trophy size={30} /><h2>Todavía no hay partidos</h2><button className="text-button" onClick={() => setMode('new')}>Registrar el primero</button></div>}
          </article>
        </div>
      </section>}
    </main>
  );
}
