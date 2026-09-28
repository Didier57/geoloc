import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function FilterSettings({ onClose, onSaved }) {
  const [filters, setFilters] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .filters()
      .then((data) => {
        setFilters(data.filters);
        setDefaults(data.defaults);
      })
      .catch((err) => setError(err.message));
  }, []);

  function update(key, value) {
    setFilters((prev) => ({ ...(prev || {}), [key]: value }));
    setMessage('');
  }

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api.saveFilters({
        maxSpeedKmh: Number(filters?.maxSpeedKmh),
        anomalyMinKm: Number(filters?.anomalyMinKm),
      });
      setFilters(data.filters);
      setMessage('Réglages enregistrés : les traces sont recalculées.');
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    if (!defaults) return;
    setFilters({ ...defaults });
    setMessage('');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Réglages du filtre</h2>
        <p className="muted">
          Un point est écarté s'il implique une vitesse supérieure à la vitesse maximale sur une
          distance supérieure à la distance minimale. Ces valeurs servent aussi au nettoyage des
          archives.
        </p>
        {!filters ? (
          <p className="muted">Chargement…</p>
        ) : (
          <>
            <label>
              Vitesse maximale plausible (km/h)
              <input
                type="number"
                min="10"
                max="500"
                value={filters.maxSpeedKmh ?? ''}
                onChange={(e) => update('maxSpeedKmh', e.target.value)}
              />
            </label>
            <label>
              Distance minimale pour juger un saut (km)
              <input
                type="number"
                min="0"
                step="0.1"
                value={filters.anomalyMinKm ?? ''}
                onChange={(e) => update('anomalyMinKm', e.target.value)}
              />
            </label>
            {defaults && (
              <p className="muted">
                Valeurs par défaut : {defaults.maxSpeedKmh} km/h et {defaults.anomalyMinKm} km.
              </p>
            )}
          </>
        )}
        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Fermer
          </button>
          <button className="btn ghost" onClick={reset} disabled={!defaults}>
            Valeurs par défaut
          </button>
          <button className="btn" onClick={save} disabled={busy || !filters}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
