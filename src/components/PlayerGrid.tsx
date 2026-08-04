import { AlertTriangle, CheckCircle2, CircleDashed, Search, ShieldAlert } from 'lucide-react';
import type { DashboardFilter, Measurement, Player } from '../types';
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
};

const statusIcon = {
  pending: CircleDashed,
  partial: CircleDashed,
  normal: CheckCircle2,
  moderate: AlertTriangle,
  alert: ShieldAlert,
};

export function PlayerGrid({ players, measurements, onSelect, filter, onFilterChange, query, onQueryChange }: PlayerGridProps) {
  const today = todayKey();
  const todayByPlayer = new Map(measurements.filter((item) => item.date === today).map((item) => [item.playerId, item]));
  const registered = todayByPlayer.size;
  const filtered = players.filter((player) => {
    const hasMeasurement = todayByPlayer.has(player.id);
    const matchesFilter = filter === 'all' || (filter === 'registered' ? hasMeasurement : !hasMeasurement);
    return matchesFilter && player.name.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es').trim());
  });

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
      </div>

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
