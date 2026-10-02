import { useEffect, useState } from 'react';
import { api } from '../api.js';

const TYPE_LABELS = {
  sync: 'Synchronisation',
  clean: 'Nettoyage',
  import: 'Import Google',
  backup: 'Sauvegarde',
  point: 'Point',
  place: 'Lieu',
  config: 'Home Assistant',
  error: 'Erreur',
};

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function ActivityLog({ onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .activity(200)
      .then((data) => setEntries(data.activity || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(event) => event.stopPropagation()}>
        <h2>Journal d'activité</h2>
        <p className="muted">Dernières synchronisations, imports et modifications.</p>
        {error && <div className="error">{error}</div>}
        {!entries && !error && <p className="muted">Chargement…</p>}
        {entries && entries.length === 0 && <p className="muted">Aucune activité pour le moment.</p>}
        {entries && entries.length > 0 && (
          <ul className="activity-list">
            {entries.map((entry) => (
              <li key={entry.id} className={`activity-item activity-${entry.type}`}>
                <span className="activity-when">{formatWhen(entry.at)}</span>
                <span className="activity-type">{TYPE_LABELS[entry.type] || entry.type}</span>
                <span className="activity-message">{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
