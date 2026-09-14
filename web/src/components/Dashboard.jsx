import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useTheme } from '../theme.js';
import { MODE_COLORS, MODE_LABELS, MODE_ORDER } from '../motion.js';
import Filters from './Filters.jsx';
import MapView from './MapView.jsx';
import Settings from './Settings.jsx';
import Users from './Users.jsx';
import Backup from './Backup.jsx';

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
  const [selectedIds, setSelectedIds] = useState(() => (user.selectedEntity ? [user.selectedEntity] : []));
  const selectedRef = useRef(selectedIds);
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [tracks, setTracks] = useState([]);
  const [source, setSource] = useState('none');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const autoSyncDone = useRef(false);

  const loadConfig = useCallback(async () => {
    try {
      if (isAdmin) {
        setConfig(await api.haConfig());
      } else {
        const status = await api.haStatus();
        setConfig({ configured: Boolean(status.configured), url: '', tokenSet: false, entities: [] });
      }
    } catch {
      setConfig({ configured: false, url: '', tokenSet: false, entities: [] });
    }
  }, [isAdmin]);

  useEffect(() => {
    selectedRef.current = selectedIds;
  }, [selectedIds]);

  const loadEntities = useCallback(async () => {
    try {
      const { entities: list } = await api.entities();
      setEntities(list);
      const current = selectedRef.current[0];
      const kept = current && list.some((entity) => entity.entityId === current) ? current : null;
      const next = kept || list[0]?.entityId || null;
      const nextIds = next ? [next] : [];
      setSelectedIds(nextIds);
      if (next && next !== current) api.setSelection(next).catch(() => {});
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

  useEffect(() => {
    if (!config?.configured || autoSyncDone.current) return;
    autoSyncDone.current = true;
    handleSync(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.configured]);

  const colors = useMemo(() => {
    const map = {};
    entities.forEach((entity, index) => {
      map[entity.entityId] = PALETTE[index % PALETTE.length];
    });
    return map;
  }, [entities]);

  function selectEntity(id) {
    const next = selectedIds.includes(id) ? [] : [id];
    setSelectedIds(next);
    api.setSelection(next[0] || null).catch(() => {});
  }

  function clearEntities() {
    setSelectedIds([]);
    api.setSelection(null).catch(() => {});
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

  async function handleSync(force = true) {
    setSyncing(true);
    setError('');
    try {
      await api.archive(force);
      await loadEntities();
      await loadTracks();
    } catch (err) {
      if (err.status !== 409) setError(err.message);
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
        <button className="btn ghost" onClick={() => handleSync()} disabled={syncing}>
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
        {isAdmin && (
          <button className="btn ghost" onClick={() => setShowBackup(true)}>
            Sauvegarde
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
            onSelect={selectEntity}
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
            <MapView
              tracks={tracks}
              entities={entities}
              selectedIds={selectedIds}
              colors={colors}
              showLive={date === toDateInput(new Date())}
            />
            <div className="legend">
              {MODE_ORDER.map((mode) => (
                <span key={mode}>
                  <i style={{ background: MODE_COLORS[mode] }} />
                  {MODE_LABELS[mode]}
                </span>
              ))}
              <span>
                <i className="legend-stay" />
                Arrêt (≤ 200 m)
              </span>
            </div>
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
      {showBackup && (
        <Backup
          onClose={() => setShowBackup(false)}
          onImported={() => {
            loadConfig();
            loadEntities();
            loadTracks();
          }}
        />
      )}
    </div>
  );
}
