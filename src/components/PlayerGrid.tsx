import { AlertTriangle, CheckCircle2, CircleDashed, Plus, Search, ShieldAlert, Trash2, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import type { DashboardFilter, Measurement, Player, PlayerInput } from '../types';
import { todayKey } from '../utils/date';
import { alertLabel, getAlertLevel } from '../utils/measurements';

type PlayerGridProps = {
  players: Player[];
  measurements: Measurement[];
  onSelect: (player: Player) => void;
  filter: DashboardFilter;
  onFilterChange: (filter: DashboardFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  saving: boolean;
  onAddPlayer: (input: PlayerInput) => Promise<boolean>;
  onRemovePlayer: (player: Player) => Promise<boolean>;
};

const statusIcon = {
  pending: CircleDashed,
  partial: CircleDashed,
  normal: CheckCircle2,
  moderate: AlertTriangle,
  alert: ShieldAlert,
};

export function PlayerGrid({ players, measurements, onSelect, filter, onFilterChange, query, onQueryChange, saving, onAddPlayer, onRemovePlayer }: PlayerGridProps) {
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const today = todayKey();
  const todayByPlayer = new Map(measurements.filter((item) => item.date === today).map((item) => [item.playerId, item]));
  const registered = todayByPlayer.size;
  const filtered = players.filter((player) => {
    const hasMeasurement = todayByPlayer.has(player.id);
    const matchesFilter = filter === 'all' || (filter === 'registered' ? hasMeasurement : !hasMeasurement);
    return matchesFilter && player.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es').trim());
  });

  const addPlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved = await onAddPlayer({ name: name.trim(), number: number === '' ? undefined : Number(number) });
    if (saved) { setName(''); setNumber(''); }
  };

  return (
    <main className="page-shell player-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow eyebrow--dark">Sesión de hoy</p>
          <h1>Estado de la plantilla</h1>
          <p>Selecciona un jugador para registrar su control preentrenamiento.</p>
        </div>
        <div className="summary-counters" aria-label="Resumen de la sesión">
          <div><span>{players.length}</span><small>Plantilla</small></div>
          <div className="summary-counters__ok"><span>{registered}</span><small>Registrados</small></div>
          <div className="summary-counters__pending"><span>{players.length - registered}</span><small>Pendientes</small></div>
        </div>
        <button type="button" className="button button--secondary roster-manage-button" onClick={() => setManaging((current) => !current)}>{managing ? <X size={17} /> : <UsersRound size={17} />}{managing ? 'Cerrar gestión' : 'Gestionar plantilla'}</button>
      </div>

      {managing && <section className="panel-card roster-manager" aria-label="Gestión de plantilla">
        <div className="panel-card__heading"><div><p className="eyebrow eyebrow--dark">Plantilla activa</p><h2>Añadir o eliminar jugadores</h2><p>Las bajas conservan todo el historial del jugador.</p></div><span className="count-badge count-badge--blue">{players.length}</span></div>
        <form className="roster-add-form" onSubmit={(event) => void addPlayer(event)}>
          <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Nombre y apellidos" required /></label>
          <label>Dorsal<input value={number} onChange={(event) => setNumber(event.target.value.replace(/\D/g, '').slice(0, 2))} type="number" min="1" max="99" inputMode="numeric" placeholder="Opcional" /></label>
          <button className="button button--primary" type="submit" disabled={saving || name.trim().length < 2}><Plus size={18} /> {saving ? 'Guardando…' : 'Añadir jugador'}</button>
        </form>
        <div className="roster-manager-list">{players.map((player) => <div key={player.id}><span className="player-card__number">{player.number ?? '—'}</span><strong>{player.name}</strong><button type="button" className="roster-remove-button" disabled={saving} onClick={() => { if (window.confirm(`¿Eliminar a ${player.name} de la plantilla activa? Su historial se conservará.`)) void onRemovePlayer(player); }}><Trash2 size={16} /> Eliminar</button></div>)}</div>
      </section>}

      <section className="player-toolbar" aria-label="Filtros de jugadores">
        <div className="search-field">
          <Search size={20} aria-hidden="true" />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar jugador…" aria-label="Buscar jugador" />
        </div>
        <div className="segmented-control">
          {([
            ['all', `Todos ${players.length}`],
            ['pending', `Pendientes ${players.length - registered}`],
            ['registered', `Registrados ${registered}`],
          ] as const).map(([value, label]) => (
            <button key={value} className={filter === value ? 'active' : ''} onClick={() => onFilterChange(value)} aria-pressed={filter === value}>{label}</button>
          ))}
        </div>
      </section>

      {filtered.length ? (
        <section className="player-grid" aria-live="polite">
          {filtered.map((player) => {
            const measurement = todayByPlayer.get(player.id);
            const level = getAlertLevel(measurement);
            const Icon = statusIcon[level];
            return (
              <button
                key={player.id}
                data-testid={`player-${player.id}`}
                className={`player-card player-card--${level}`}
                onClick={() => onSelect(player)}
                aria-label={`${player.name}, ${alertLabel[level]}`}
              >
                <span className="player-card__number">{player.number ?? '—'}</span>
                <span className="player-card__body">
                  <strong>{player.name}</strong>
                  <span className="player-card__status"><Icon size={17} /> {alertLabel[level]}</span>
                </span>
                {measurement && <span className="player-card__values">F {measurement.fatigue ?? '—'} · M {measurement.soreness ?? '—'}</span>}
              </button>
            );
          })}
        </section>
      ) : (
        <div className="empty-state"><Search size={30} /><h2>No hay jugadores</h2><p>Prueba con otro nombre o cambia el filtro.</p></div>
      )}
    </main>
  );
}
