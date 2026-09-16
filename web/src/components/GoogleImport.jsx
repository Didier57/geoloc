import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function GoogleImport({ currentEntityId, onClose, onImported }) {
  const [entities, setEntities] = useState([]);
  const [entityId, setEntityId] = useState(currentEntityId || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { entities: list } = await api.entities(true);
        if (cancelled) return;
        setEntities(list);
        setEntityId((current) => current || list[0]?.entityId || '');
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingEntities(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function pick(event) {
    const selected = event.target.files?.[0];
    setFile(selected || null);
    setFileName(selected ? selected.name : '');
    setMessage('');
    setError('');
  }

  async function runImport() {
    if (!file || !entityId) return;
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const result = await api.importGoogle(entityId, file, from, to);
      const parts = [
        `${result.points} point(s) lus`,
        `répartis sur ${result.days} jour(s)`,
        `${result.added} ajouté(s)`,
        `${result.duplicates} doublon(s) ignoré(s)`,
      ];
      const skipped = (result.skipped || []).filter((entry) => entry.reason !== 'no_points');
      if (skipped.length > 0) parts.push(`${skipped.length} fichier(s) ignoré(s)`);
      const name = entities.find((entity) => entity.entityId === result.entityId)?.name || result.entityId;
      setMessage(`Import terminé pour ${name} : ${parts.join(', ')}.`);
      setFile(null);
      setFileName('');
      if (inputRef.current) inputRef.current.value = '';
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Importer un historique Google</h2>

        <div className="backup-section">
          <p className="muted">
            Importez un export <strong>Google Takeout</strong> (fichier ZIP, ou le fichier JSON déjà extrait)
            et rattachez les trajets à un device existant. Les points déjà présents (même horodatage) sont
            ignorés : aucun doublon n'est créé.
          </p>
          <ol className="import-steps muted">
            <li>
              Sur <span className="file-name">takeout.google.com</span>, sélectionnez uniquement{' '}
              <strong>Historique des positions</strong> (Location History) puis exportez (format ZIP).
            </li>
            <li>
              Téléchargez l'archive proposée par Google, puis déposez-la ici. Si plusieurs archives sont
              proposées, importez-les une par une.
            </li>
            <li>Le JSON de l'export peut aussi être déposé directement (dossier de l'archive décompressé).</li>
          </ol>

          <label className="check-line">Device à compléter</label>
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            disabled={loadingEntities || importing}
          >
            {entities.length === 0 && <option value="">Aucun device disponible</option>}
            {entities.map((entity) => (
              <option key={entity.entityId} value={entity.entityId}>
                {entity.name} ({entity.entityId})
              </option>
            ))}
          </select>

          <label className="check-line">Période à importer (optionnel)</label>
          <div className="import-dates">
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              disabled={importing}
            />
            <span className="muted">au</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              disabled={importing}
            />
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            onChange={pick}
            disabled={importing}
          />
          {fileName && <span className="file-name">{fileName}</span>}

          {importing && <div className="muted">Import en cours… selon la taille du fichier, cela peut prendre plusieurs minutes.</div>}
          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}

          <div className="modal-actions">
            <button className="btn" onClick={runImport} disabled={!file || !entityId || importing}>
              {importing ? 'Import…' : 'Importer'}
            </button>
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
