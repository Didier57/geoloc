import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useTheme } from '../theme.js';
import { MODE_COLORS, MODE_LABELS, MODE_ORDER } from '../motion.js';
import { computeTrackStats, formatDistanceKm, formatDurationMs } from '../stats.js';
import Filters from './Filters.jsx';
import MapView from './MapView.jsx';
import Settings from './Settings.jsx';
import Users from './Users.jsx';
import Backup from './Backup.jsx';
import GoogleImport from './GoogleImport.jsx';
import FilterSettings from './FilterSettings.jsx';
import ActivityLog from './ActivityLog.jsx';
import PlaceSearch from './PlaceSearch.jsx';

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
  const [selectedIds, setSelectedIds] = useState(() => {
    if (Array.isArray(user.selectedEntities)) return user.selectedEntities;
    return user.selectedEntity ? [user.selectedEntity] : [];
  });
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
  const [showImport, setShowImport] = useState(false);
  const [showFilterSettings, setShowFilterSettings] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [focus, setFocus] = useState(null);
  const [removed, setRemoved] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [showHeat, setShowHeat] = useState(false);
  const [job, setJob] = useState(null);
  const [health, setHealth] = useState(null);
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
      const current = selectedRef.current;
      if (current.length) {
        // On garde les entités choisies même si elles sont absentes de la liste
        // à cet instant (GPS coupé, Home Assistant indisponible) : sinon l'appli
        // basculait toute seule sur un autre device.
        setSelectedIds(current);
      } else {
        const next = list[0]?.entityId ? [list[0].entityId] : [];
        setSelectedIds(next);
        if (next.length) api.setSelection(next).catch(() => {});
      }
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

  const loadStatus = useCallback(async () => {
    if (!config?.configured) {
      setHealth(null);
      return;
    }
    try {
      setHealth(await api.status());
    } catch {
      setHealth(null);
    }
  }, [config?.configured]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const loadTracks = useCallback(async () => {
    if (!config?.configured || selectedIds.length === 0) {
      setTracks([]);
      setSource('none');
      setRemoved(0);
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
      setRemoved(data.removed || 0);
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

  const statsList = useMemo(() => {
    const names = {};
    entities.forEach((entity) => {
      names[entity.entityId] = entity.name;
    });
    return tracks.map((track) =>
      Object.assign(
        {
          entityId: track.entityId,
          name: names[track.entityId] || track.name || track.entityId,
          color: colors[track.entityId] || '#2563eb',
        },
        computeTrackStats(track),
      ),
    );
  }, [tracks, entities, colors]);

  function selectEntity(id) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id];
    setSelectedIds(next);
    api.setSelection(next).catch(() => {});
  }

  function selectAllEntities() {
    const next = entities.map((entity) => entity.entityId);
    setSelectedIds(next);
    api.setSelection(next).catch(() => {});
  }

  function clearEntities() {
    setSelectedIds([]);
    api.setSelection([]).catch(() => {});
  }

  function changeDate(value) {
    setFocus(null);
    setDate(value);
  }

  function shiftDay(delta) {
    setFocus(null);
    const next = startOfDay(date);
    next.setDate(next.getDate() + delta);
    setDate(toDateInput(next));
  }

  function openVisit(day, latitude, longitude) {
    setFocus({ latitude, longitude, nonce: Date.now() });
    setDate(day);
    setShowPlaceSearch(false);
  }

  const hasPoints = tracks.some((track) => track.points.length > 0);

  async function handleSettingsSaved() {
    await loadConfig();
    loadEntities();
  }

  async function waitForArchive(maxMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const status = await api.archiveStatus();
        setJob(status.job || null);
        if (!status.running) return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async function handleSync(force = false) {
    setSyncing(true);
    setError('');
    try {
      const result = await api.archive(force);
      if (result?.background) await waitForArchive();
      await loadEntities();
      await loadTracks();
    } catch (err) {
      if (err.status !== 409) setError(err.message);
    } finally {
      setSyncing(false);
      setJob(null);
      loadStatus();
    }
  }

  async function handleSyncAll() {
    setSyncingAll(true);
    setError('');
    try {
      const result = await api.archive(true, true);
      await loadEntities();
      await loadTracks();
      const cleaned = result?.cleaned;
      if (cleaned && cleaned.removed > 0) {
        window.alert(
          `Nettoyage terminé : ${cleaned.removed} point(s) incohérent(s) retiré(s) sur ${cleaned.days} jour(s).`,
        );
      } else {
        window.alert('Synchronisation complète terminée : aucun point incohérent trouvé.');
      }
    } catch (err) {
      if (err.status !== 409) setError(err.message);
    } finally {
      setSyncingAll(false);
      setJob(null);
      loadStatus();
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
          <div className="admin-menu">
            <button
              className="btn ghost"
              onClick={() => setAdminOpen((value) => !value)}
              aria-expanded={adminOpen}
            >
              Administrateur ▾
            </button>
            {adminOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setAdminOpen(false)} />
                <div className="menu-panel">
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAdminOpen(false);
                      setShowSettings(true);
                    }}
                  >
                    Home Assistant
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAdminOpen(false);
                      setShowUsers(true);
                    }}
                  >
                    Utilisateurs
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAdminOpen(false);
                      setShowBackup(true);
                    }}
                  >
                    Sauvegarde
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAdminOpen(false);
                      setShowImport(true);
                    }}
                  >
                    Import Google
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAdminOpen(false);
                      setShowFilterSettings(true);
                    }}
                  >
                    Réglages du filtre
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAdminOpen(false);
                      setShowActivity(true);
                    }}
                  >
                    Journal d'activité
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      setAdminOpen(false);
                      handleSyncAll();
                    }}
                    disabled={syncingAll}
                  >
                    {syncingAll ? 'Synchronisation complète…' : 'Synchroniser tout'}
                  </button>
                </div>
              </>
            )}
          </div>
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
            onSelectAll={selectAllEntities}
            onClear={clearEntities}
            colors={colors}
            date={date}
            onDate={changeDate}
            onShiftDay={shiftDay}
            showStats={showStats}
            onToggleStats={() => setShowStats((value) => !value)}
            showHeat={showHeat}
            onToggleHeat={() => setShowHeat((value) => !value)}
            onOpenPlaces={() => setShowPlaceSearch(true)}
          />
          {error && <div className="error banner">{error}</div>}
          {!error && health?.configured && health.sync && health.sync.ok === false && (
            <div className="alert banner">
              Home Assistant injoignable lors de la dernière synchronisation
              {health.sync.message ? ` : ${health.sync.message}` : '.'}
            </div>
          )}
          {!error &&
            health?.configured &&
            (!health.sync || health.sync.ok !== false) &&
            health.stale && (
              <div className="alert banner">
                Aucune synchronisation réussie depuis{' '}
                {health.staleDays != null ? `${health.staleDays} jour(s)` : 'un moment'}. Vérifiez
                Home Assistant.
              </div>
            )}
          {job?.running && (
            <div className="job-banner">
              <span className="job-label">{job.label}</span>
              {job.message ? <span className="job-message">{job.message}</span> : null}
              {job.total > 0 && (
                <span className="job-progress">
                  <span className="job-bar">
                    <i
                      style={{
                        width: `${Math.min(100, Math.round((job.done / job.total) * 100))}%`,
                      }}
                    />
                  </span>
                  <span className="job-count">
                    {job.done}/{job.total}
                  </span>
                </span>
              )}
            </div>
          )}
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
              isAdmin={isAdmin}
              heat={showHeat}
              focus={focus}
              onPointDeleted={loadTracks}
              onError={setError}
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
              {removed > 0 && (
                <span className="legend-filter">{removed} point(s) écarté(s)</span>
              )}
            </div>
            {loading && <div className="map-loading">Chargement…</div>}
            {showStats && statsList.length > 0 && (
              <div className="stats-panel">
                {statsList.map((item) => (
                  <div key={item.entityId} className="stats-item">
                    <div className="stats-head">
                      <span className="dot" style={{ background: item.color }} />
                      {item.name}
                    </div>
                    <div className="stats-grid">
                      <span>Distance</span>
                      <strong>{formatDistanceKm(item.distanceKm)}</strong>
                      <span>Durée</span>
                      <strong>{formatDurationMs(item.durationMs)}</strong>
                      <span>Vitesse moyenne</span>
                      <strong>{Math.round(item.averageSpeedKmh)} km/h</strong>
                      <span>Vitesse max</span>
                      <strong>{Math.round(item.maxSpeedKmh)} km/h</strong>
                      <span>En mouvement</span>
                      <strong>{formatDurationMs(item.movingMs)}</strong>
                      <span>Immobile</span>
                      <strong>{formatDurationMs(item.stillMs)}</strong>
                    </div>
                    <div className="stats-modes">
                      {MODE_ORDER.map((mode) =>
                        item.byMode[mode]?.distanceKm > 0 ? (
                          <span key={mode}>
                            <i style={{ background: MODE_COLORS[mode] }} />
                            {MODE_LABELS[mode]} : {formatDistanceKm(item.byMode[mode].distanceKm)} ·{' '}
                            {formatDurationMs(item.byMode[mode].durationMs)}
                          </span>
                        ) : null,
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
      {showImport && (
        <GoogleImport
          currentEntityId={selectedIds[0]}
          onClose={() => setShowImport(false)}
          onImported={() => {
            loadEntities();
            loadTracks();
          }}
        />
      )}
      {showFilterSettings && (
        <FilterSettings
          onClose={() => setShowFilterSettings(false)}
          onSaved={loadTracks}
        />
      )}
      {showActivity && <ActivityLog onClose={() => setShowActivity(false)} />}
      {showPlaceSearch && (
        <PlaceSearch
          entities={entities}
          selectedIds={selectedIds}
          onClose={() => setShowPlaceSearch(false)}
          onPick={openVisit}
        />
      )}
    </div>
  );
}
