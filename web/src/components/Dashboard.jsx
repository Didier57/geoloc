import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
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

function toInput(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function Dashboard({ user, onLogout }) {
  const isAdmin = user.role === 'admin';

  const [config, setConfig] = useState(null);
  const [entities, setEntities] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [from, setFrom] = useState(() => toInput(new Date(Date.now() - 24 * 3600 * 1000)));
  const [to, setTo] = useState(() => toInput(new Date()));
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUsers, setShowUsers] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await api.haConfig());
    } catch {
      setConfig({ configured: false, url: '', tokenSet: false });
    }
  }, []);

  const loadEntities = useCallback(async () => {
    try {
      const { entities: list } = await api.entities();
      setEntities(list);
      setSelectedIds((prev) => (prev.length > 0 ? prev : list.filter((e) => e.latitude != null).map((e) => e.entityId)));
      setError('');
    } catch (err) {
      if (err.status === 409) {
        setConfig((c) => ({ ...(c || {}), configured: false }));
        setEntities([]);
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
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { tracks: list } = await api.tracks(
        selectedIds,
        new Date(from).toISOString(),
        new Date(to).toISOString(),
      );
      setTracks(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [config?.configured, selectedIds, from, to]);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  const applyQuick = useCallback((days, todayOnly = false) => {
    const end = new Date();
    let start;
    if (todayOnly) {
      start = new Date(end);
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(end.getTime() - days * 24 * 3600 * 1000);
    }
    setFrom(toInput(start));
    setTo(toInput(end));
  }, []);

  const toggle = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const colors = useMemo(() => {
    const map = {};
    entities.forEach((entity, index) => {
      map[entity.entityId] = PALETTE[index % PALETTE.length];
    });
    return map;
  }, [entities]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Geoloc</div>
        <div className="spacer" />
        <span className="user">
          {user.username}
          {isAdmin ? ' (admin)' : ''}
        </span>
        {isAdmin && (
          <button className="btn ghost" onClick={loadEntities}>
            Actualiser
          </button>
        )}
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
            onToggle={toggle}
            onSelectAll={() => setSelectedIds(entities.map((e) => e.entityId))}
            onClear={() => setSelectedIds([])}
            from={from}
            to={to}
            onFrom={setFrom}
            onTo={setTo}
            onQuick={applyQuick}
            colors={colors}
          />
          {error && <div className="error banner">{error}</div>}
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
          onSaved={() => {
            setShowSettings(false);
            loadConfig();
          }}
        />
      )}
      {showUsers && <Users onClose={() => setShowUsers(false)} />}
    </div>
  );
}
