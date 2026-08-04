import { useEffect, useState } from 'react';
import type { AuthRole, AuthSession, DashboardFilter, MatchInput, MatchRecord, Measurement, MeasurementInput, Player, TrainingSession } from './types';
import { dataService } from './services';
import { clearAuthSession, readAuthSession, remainingSeconds, saveAuthSession } from './utils/session';
import { AppHeader } from './components/AppHeader';
import { LoginScreen } from './components/LoginScreen';
import { OfflineBanner } from './components/OfflineBanner';
import { PlayerGrid } from './components/PlayerGrid';
import { PlayerForm } from './components/PlayerForm';
import { TechnicalPanel } from './components/TechnicalPanel';
import { Toast } from './components/Toast';
import { SiteFooter } from './components/SiteFooter';
import { MatchesPanel } from './components/MatchesPanel';
import './styles.css';

type View = 'players' | 'matches' | 'technical';

export default function App() {
  const [auth, setAuth] = useState<AuthSession | null>(() => readAuthSession());
  const [remaining, setRemaining] = useState(() => auth ? remainingSeconds(auth.expiresAt) : 0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [trainingSession, setTrainingSession] = useState<TrainingSession | null>(null);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [view, setView] = useState<View>('players');
  const [filter, setFilter] = useState<DashboardFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);

  const logout = async () => {
    if (auth) void dataService.logout(auth.token).catch(() => undefined);
    clearAuthSession();
    setAuth(null);
    setPlayers([]);
    setMeasurements([]);
    setTrainingSession(null);
    setMatches([]);
    setSelectedPlayer(null);
    setView('players');
    setRemaining(0);
  };

  useEffect(() => {
    const online = () => setOffline(false);
    const offlineHandler = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineHandler);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineHandler); };
  }, []);

  useEffect(() => {
    if (!auth) return;
    const update = () => {
      const seconds = remainingSeconds(auth.expiresAt);
      setRemaining(seconds);
      if (seconds <= 0) void logout();
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [auth?.expiresAt]);

  useEffect(() => {
    if (!auth) return;
    setLoading(true);
    Promise.all([
      dataService.getPlayers(auth.token),
      dataService.getMeasurements(auth.token),
      dataService.getCurrentSession(auth.token),
      auth.role === 'staff' ? dataService.getMatches(auth.token) : Promise.resolve([]),
    ]).then(([nextPlayers, nextMeasurements, nextSession, nextMatches]) => {
      setPlayers(nextPlayers);
      setMeasurements(nextMeasurements);
      setTrainingSession(nextSession);
      setMatches(nextMatches);
      if (auth.role === 'player') setSelectedPlayer(nextPlayers[0] ?? null);
    }).catch((cause: Error) => {
      setError(cause.message || 'No se pudieron cargar los datos.');
      if (/sesión|session|unauthorized/i.test(cause.message)) void logout();
    }).finally(() => setLoading(false));
  }, [auth?.token]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const login = async (pin: string, role: AuthRole) => {
    setLoading(true);
    setError('');
    try {
      const session = await dataService.authenticate(pin, role);
      saveAuthSession(session);
      setAuth(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const saveMeasurement = async (input: MeasurementInput) => {
    if (!auth) return false;
    setSaving(true);
    setError('');
    try {
      const saved = await dataService.saveMeasurement(auth.token, input);
      setMeasurements((current) => {
        const index = current.findIndex((item) => item.id === saved.id);
        if (index < 0) return [...current, saved];
        const next = [...current];
        next[index] = saved;
        return next;
      });
      setToast('Datos guardados correctamente');
      if (auth.role === 'staff') window.setTimeout(() => { setSelectedPlayer(null); setView('players'); }, 850);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la medición.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveMatch = async (input: MatchInput) => {
    if (!auth || auth.role !== 'staff') return false;
    setSaving(true);
    setError('');
    try {
      const saved = await dataService.saveMatch(auth.token, input);
      setMatches((current) => [saved, ...current]);
      setToast('Partido y minutos guardados');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el partido.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (!auth) return (
    <div className="login-shell">
      <OfflineBanner offline={offline} />
      <LoginScreen onLogin={login} loading={loading} error={error} />
      <SiteFooter />
    </div>
  );

  return (
    <div className="app">
      <OfflineBanner offline={offline} />
      <AppHeader remaining={remaining} view={view} role={auth.role} playerName={auth.playerName} onViewChange={(next) => { setView(next); setSelectedPlayer(null); }} onLogout={() => void logout()} />
      {error && <div className="global-error" role="alert"><span>{error}</span><button onClick={() => setError('')}>Cerrar</button></div>}
      {loading && !players.length ? <div className="loading-screen"><span className="loader" /><p>Preparando la sesión…</p></div> : null}
      {!loading && auth.role === 'staff' && view === 'players' && !selectedPlayer && <PlayerGrid players={players} measurements={measurements} onSelect={setSelectedPlayer} filter={filter} onFilterChange={setFilter} query={query} onQueryChange={setQuery} />}
      {!loading && view === 'players' && selectedPlayer && trainingSession && <PlayerForm player={selectedPlayer} measurements={measurements} session={trainingSession} saving={saving} onSave={saveMeasurement} onBack={() => setSelectedPlayer(null)} role={auth.role} />}
      {!loading && auth.role === 'staff' && view === 'matches' && <MatchesPanel players={players} matches={matches} saving={saving} onSave={saveMatch} />}
      {!loading && auth.role === 'staff' && view === 'technical' && <TechnicalPanel players={players} measurements={measurements} />}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      <SiteFooter />
    </div>
  );
}
