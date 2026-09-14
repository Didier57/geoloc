import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useTheme } from '../theme.js';
import Filters from './Filters.jsx';
import MapView from './MapView.jsx';
import Settings from './Settings.jsx';
import Users from './Users.jsx';

const PALETTE = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#008080',
  '#e67e22',
  '#2c3e50',
  '#c0392b',
  '#16a085',
];

function toDateInput(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function startOfDay(value) {
  return new Date(`${value}T00:00:00`);
}

function endOfDay(value) {
  return new Date(`${value}T23:59:59.999`);
}

export default function Dashboard({ user, onLogout }) {
  const isAdmin = user.role === 'admin';
  const { theme, toggleTheme } = useTheme();

  const [config, setConfig] = useState(null);
  const [entities, setEntities] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [tracks, setTracks] = useState([]);
  const [source, setSource] = useState('none');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUsers, setShowUsers] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await api.haConfig());
    } catch {
      setConfig({ configured: false, url: '', tokenSet: false, entities: [] });
    }
  }, []);

  const loadEntities = useCallback(async () => {
    try {
      const { entities: list } = await api.entities();
      setEntities(list);
      setSelectedIds((prev) => {
        const valid = prev.filter((id) => list.some((entity) => entity.entityId === id));
        return valid.length > 0 ? valid : list.map((entity) => entity.entityId);
      });
      setError('');
    } catch (err) {
      if (err.status === 409) {
        setConfig((c) => ({ ...(c || {}), configured: false }));
        setEntities([]);
        setSelectedIds([]);
      } else {
        setError(err.message);
      }
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config?.configured) loadEntities();
  }, [config?.configured, loadEntities]);

  const loadTracks = useCallback(async () => {
    if (!config?.configured || selectedIds.length === 0) {
      setTracks([]);
      setSource('none');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.tracks(
        selectedIds,
        startOfDay(date).toISOString(),
        endOfDay(date).toISOString(),
      );
      setTracks(data.tracks || []);
      setSource(data.source || 'none');
      if (data.haError) setError(data.haError);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [config?.configured, selectedIds, date]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  const colors = useMemo(() => {
    const map = {};
    entities.forEach((entity, index) => {
      map[entity.entityId] = PALETTE[index % PALETTE.length];
    });
    return map;
  }, [entities]);

  function toggleEntity(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }

  function selectAllEntities() {
    setSelectedIds(entities.map((entity) => entity.entityId));
  }

  function clearEntities() {
    setSelectedIds([]);
  }

  function shiftDay(delta) {
    const next = startOfDay(date);
    next.setDate(next.getDate() + delta);
    setDate(toDateInput(next));
  }

  const hasPoints = tracks.some((track) => track.points.length > 0);

  async function handleSettingsSaved() {
    await loadConfig();
    loadEntities();
  }

  async function handleSync() {
    setSyncing(true);
    setError('');
    try {
      await api.archive(true);
      await loadEntities();
      await loadTracks();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Geoloc</div>
        <div className="spacer" />
        <button
          className="btn icon theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
          aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="5" fill="currentColor" />
              <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
              </g>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
        <span className="user">
          {user.username}
          {isAdmin ? ' (admin)' : ''}
        </span>
        <button className="btn ghost" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Synchronisation…' : 'Synchroniser'}
        </button>
        {isAdmin && (
          <button className="btn ghost" onClick={() => setShowSettings(true)}>
            Home Assistant
          </button>
        )}
        {isAdmin && (
          <button className="btn ghost" onClick={() => setShowUsers(true)}>
            Utilisateurs
          </button>
        )}
        <button className="btn ghost" onClick={onLogout}>
          Déconnexion
        </button>
      </header>

      {config === null ? (
        <div className="notice">Chargement…</div>
      ) : !config.configured ? (
        <div className="notice">
          <span>Home Assistant n'est pas encore configuré.</span>
          {isAdmin ? (
            <button className="btn" onClick={() => setShowSettings(true)}>
              Configurer
            </button>
          ) : (
            <span className="muted">Contactez un administrateur.</span>
          )}
        </div>
      ) : (
        <>
          <Filters
            entities={entities}
            selectedIds={selectedIds}
            onToggle={toggleEntity}
            onSelectAll={selectAllEntities}
            onClear={clearEntities}
            colors={colors}
            date={date}
            onDate={setDate}
            onShiftDay={shiftDay}
          />
          {error && <div className="error banner">{error}</div>}
          {!loading && selectedIds.length > 0 && !hasPoints && (
            <div className="empty banner">Pas de données pour cette date.</div>
          )}
          <div className="map-wrap">
            <MapView tracks={tracks} entities={entities} selectedIds={selectedIds} colors={colors} />
            {loading && <div className="map-loading">Chargement…</div>}
          </div>
        </>
      )}

      {showSettings && (
        <Settings
          config={config}
          onClose={() => setShowSettings(false)}
          onSaved={handleSettingsSaved}
          onEntitiesSaved={() => {
            loadConfig();
            loadEntities();
          }}
        />
      )}
      {showUsers && <Users onClose={() => setShowUsers(false)} />}
    </div>
  );
}
