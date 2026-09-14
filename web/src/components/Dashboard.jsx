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

  const [config, setConfig] = useState(null);
  const [entities, setEntities] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { tracks: list } = await api.tracks(
        selectedIds,
        startOfDay(date).toISOString(),
        endOfDay(date).toISOString(),
      );
      setTracks(list);
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

  async function handleSettingsSaved() {
    await loadConfig();
    loadEntities();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Geoloc</div>
        <div className="spacer" />
        <span className="user">
          {user.username}
          {isAdmin ? ' (admin)' : ''}
        </span>
        <button className="btn ghost" onClick={loadEntities}>
          Synchroniser
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
