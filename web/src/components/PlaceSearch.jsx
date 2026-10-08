import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatDate(day) {
  if (!day) return '';
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
}

export default function PlaceSearch({ entities, selectedIds, onClose, onPick }) {
  const [labels, setLabels] = useState([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);
  const [visits, setVisits] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [picked, setPicked] = useState(null);
  const dragState = useRef(null);

  function startDrag(event) {
    if (event.button && event.button !== 0) return;
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!dragState.current) return;
    setOffset({
      x: dragState.current.baseX + (event.clientX - dragState.current.startX),
      y: dragState.current.baseY + (event.clientY - dragState.current.startY),
    });
  }

  function endDrag(event) {
    dragState.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  useEffect(() => {
    api
      .labels()
      .then(({ labels: list }) => setLabels(Array.isArray(list) ? list : []))
      .catch((err) => setError(err.message));
  }, []);

  const names = useMemo(() => {
    const map = {};
    entities.forEach((entity) => {
      map[entity.entityId] = entity.name;
    });
    return map;
  }, [entities]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const list = q ? labels.filter((label) => normalize(label.name).includes(q)) : labels;
    return [...list]
      .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name), 'fr'))
      .slice(0, 50);
  }, [labels, query]);

  const choose = async (label) => {
    setActive(label);
    setVisits(null);
    setLoading(true);
    setError('');
    try {
      const data = await api.labelVisits(label.latitude, label.longitude, selectedIds);
      setVisits(Array.isArray(data.visits) ? data.visits : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop floating-backdrop">
      <div
        className="modal wide floating"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          className="modal-drag-handle"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <h2>Mes lieux</h2>
          <span className="muted">Glisser pour déplacer · étirer le coin pour redimensionner</span>
        </div>
        <input
          type="search"
          autoFocus
          className="place-search-input"
          value={query}
          placeholder="Rechercher un nom personnalisé…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="place-search-body">
          <ul className="place-results">
            {filtered.length === 0 && (
              <li className="muted">Aucun lieu enregistré pour cette recherche.</li>
            )}
            {filtered.map((label) => {
              const isActive =
                active &&
                active.latitude === label.latitude &&
                active.longitude === label.longitude;
              return (
                <li key={`${label.latitude}-${label.longitude}`}>
                  <button
                    type="button"
                    className={isActive ? 'active' : ''}
                    onClick={() => choose(label)}
                  >
                    {label.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="place-visits">
            {!active && (
              <p className="muted">
                Choisissez un lieu pour voir les dates où vous y êtes allé.
              </p>
            )}
            {active && (
              <>
                <h3>{active.name}</h3>
                {loading && <p className="muted">Recherche…</p>}
                {error && <p className="error">{error}</p>}
                {!loading && visits && visits.length === 0 && (
                  <p className="muted">Aucune visite trouvée pour ce lieu.</p>
                )}
                {visits && visits.length > 0 && (
                  <table className="visits-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Arrivée</th>
                        <th>Durée</th>
                        {entities.length > 1 && <th>Personne</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visits.map((visit) => (
                        <tr
                          key={`${visit.entityId}-${visit.start}`}
                          className={picked === visit.start ? 'selected' : ''}
                          onClick={() => {
                            setPicked(visit.start);
                            onPick(visit.day, visit.latitude, visit.longitude);
                          }}
                          title="Voir ce jour sur la carte"
                        >
                          <td>{formatDate(visit.day)}</td>
                          <td>{formatTime(visit.start)}</td>
                          <td>{formatDuration(visit.durationMs)}</td>
                          {entities.length > 1 && (
                            <td>{names[visit.entityId] || visit.entityId}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
