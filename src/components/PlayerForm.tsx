import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, History, Save, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import type { AuthRole, Measurement, MeasurementInput, Player, TrainingSession } from '../types';
import { formatDate, todayKey } from '../utils/date';
import { average, parseWeight, recentForPlayer, weightChange } from '../utils/measurements';
import { Sparkline } from './Sparkline';

type FormProps = {
  player: Player;
  measurements: Measurement[];
  session: TrainingSession;
  saving: boolean;
  onSave: (input: MeasurementInput) => Promise<boolean>;
  onBack: () => void;
  role: AuthRole;
};

type Draft = { weight: string; fatigue: number | null; soreness: number | null; comments: string };

const draftKey = (playerId: string) => `zabal-draft-${todayKey()}-${playerId}`;

const readDraft = (playerId: string, existing?: Measurement): Draft => {
  try {
    const stored = localStorage.getItem(draftKey(playerId));
    if (stored) return JSON.parse(stored) as Draft;
  } catch { /* El formulario sigue disponible con valores seguros. */ }
  return {
    weight: existing?.weight !== undefined ? String(existing.weight).replace('.', ',') : '',
    fatigue: existing?.fatigue ?? null,
    soreness: existing?.soreness ?? null,
    comments: existing?.comments ?? '',
  };
};

function ScorePicker({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number) => void }) {
  return (
    <fieldset className="score-fieldset">
      <legend>{label} <span>1 = mínimo · 10 = máximo</span></legend>
      <div className="score-picker">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
          <button
            type="button"
            key={score}
            className={`${value === score ? 'selected' : ''} ${score >= 7 ? 'score-alert' : score >= 4 ? 'score-moderate' : ''}`}
            onClick={() => onChange(score)}
            aria-pressed={value === score}
            aria-label={`${label}: ${score}`}
          >{score}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function PlayerForm({ player, measurements, session, saving, onSave, onBack, role }: FormProps) {
  const existing = measurements.find((item) => item.playerId === player.id && item.date === todayKey());
  const [draft, setDraft] = useState<Draft>(() => readDraft(player.id, existing));
  const [errors, setErrors] = useState<string[]>([]);
  const [showEvolution, setShowEvolution] = useState(false);
  const history = useMemo(() => recentForPlayer(measurements, player.id), [measurements, player.id]);

  useEffect(() => {
    setDraft(readDraft(player.id, existing));
    setErrors([]);
    setShowEvolution(false);
  }, [player.id]);

  useEffect(() => {
    localStorage.setItem(draftKey(player.id), JSON.stringify(draft));
  }, [draft, player.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const weight = draft.weight.trim() ? parseWeight(draft.weight) : undefined;
    const nextErrors: string[] = [];
    if (weight === null) nextErrors.push('El peso debe estar entre 30 y 250 kg. También puedes dejarlo vacío.');
    if (weight === undefined && draft.fatigue === null && draft.soreness === null && !draft.comments.trim()) nextErrors.push('Rellena al menos un dato antes de guardar.');
    if (nextErrors.length || weight === null) {
      setErrors(nextErrors);
      return;
    }
    setErrors([]);
    const saved = await onSave({
      playerId: player.id,
      playerName: player.name,
      weight,
      fatigue: draft.fatigue ?? undefined,
      soreness: draft.soreness ?? undefined,
      comments: draft.comments,
      sessionId: session.id,
    });
    if (saved) localStorage.removeItem(draftKey(player.id));
  };

  const change = weightChange(history);

  return (
    <main className="page-shell form-page">
      {role === 'staff' && <button className="back-link" onClick={onBack}><ArrowLeft size={19} /> Volver al listado</button>}
      <div className="form-heading">
        <div className="player-avatar">{player.number ?? '—'}</div>
        <div><p className="eyebrow eyebrow--dark">Control preentrenamiento · {formatDate(todayKey())}</p><h1>{player.name}</h1>{existing && <span className="edit-badge"><History size={14} /> Editando la medición de hoy</span>}</div>
      </div>

      <div className="form-layout">
        <form className="measurement-form" onSubmit={submit} noValidate>
          <section className="form-section">
            <div className="weight-field">
              <label htmlFor="weight"><Scale size={20} /> Peso <span>kg</span></label>
              <input
                id="weight"
                data-testid="weight-input"
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                value={draft.weight}
                onChange={(event) => setDraft({ ...draft, weight: event.target.value.replace(/[^0-9.,]/g, '').slice(0, 6) })}
                placeholder="72,4"
                autoFocus={!existing}
              />
            </div>
          </section>
          <section className="form-section score-section">
            <ScorePicker label="Fatiga" value={draft.fatigue} onChange={(fatigue) => setDraft({ ...draft, fatigue })} />
            <ScorePicker label="Molestias o lesión" value={draft.soreness} onChange={(soreness) => setDraft({ ...draft, soreness })} />
          </section>
          <section className="form-section">
            <label className="comments-label" htmlFor="comments">Comentarios <span>Opcional · máximo 500 caracteres</span></label>
            <textarea id="comments" rows={3} maxLength={500} value={draft.comments} onChange={(event) => setDraft({ ...draft, comments: event.target.value })} placeholder="Ej.: sobrecarga leve en gemelo derecho…" />
          </section>
          {errors.length > 0 && <div className="validation-summary" role="alert"><strong>Revisa estos campos:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          <p className="partial-save-note">Puedes guardar solo el peso o las molestias ahora y completar la fatiga más tarde. Lo que dejes vacío no borrará los datos ya guardados.</p>
          <div className="form-actions">
            <button type="submit" className="button button--primary save-button" disabled={saving}><Save size={20} /> {saving ? 'Guardando…' : existing ? 'Actualizar medición' : 'Guardar medición'}</button>
          </div>
        </form>

        <aside className={`evolution-card ${showEvolution ? 'open' : ''}`}>
          <button className="evolution-toggle" onClick={() => setShowEvolution((value) => !value)} aria-expanded={showEvolution}>
            <span><History size={20} /><span><strong>Evolución reciente</strong><small>Últimas {Math.min(history.length, 10)} mediciones</small></span></span>
            {showEvolution ? <ChevronUp /> : <ChevronDown />}
          </button>
          {showEvolution && (
            <div className="evolution-content">
              <div className="evolution-stats">
                <div><small>Último peso</small><strong>{history.map((item) => item.weight).filter((value) => value !== undefined).at(-1) ?? '—'} <span>kg</span></strong></div>
                <div><small>Cambio</small><strong className={change > 0 ? 'trend-up' : change < 0 ? 'trend-down' : ''}>{change > 0 ? <TrendingUp size={18} /> : change < 0 ? <TrendingDown size={18} /> : null}{change > 0 ? '+' : ''}{change} <span>kg</span></strong></div>
                {role === 'staff' && <div><small>Fatiga media</small><strong>{average(history.map((item) => item.fatigue)).toFixed(1)}</strong></div>}
                {role === 'staff' && <div><small>Molestias media</small><strong>{average(history.map((item) => item.soreness)).toFixed(1)}</strong></div>}
              </div>
              <div className="mini-chart"><span>Peso</span><Sparkline values={history.map((item) => item.weight).filter((value): value is number => value !== undefined)} label="Evolución del peso" /></div>
              {role === 'staff' && <div className="mini-chart"><span>Fatiga</span><Sparkline values={history.map((item) => item.fatigue).filter((value): value is number => value !== undefined)} color="#d39200" min={1} max={10} label="Evolución de la fatiga" /></div>}
              {role === 'staff' && <div className="mini-chart"><span>Molestias</span><Sparkline values={history.map((item) => item.soreness).filter((value): value is number => value !== undefined)} color="#c8424f" min={1} max={10} label="Evolución de las molestias" /></div>}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
