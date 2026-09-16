import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const REASON_LABELS = {
  no_points: 'aucune position reconnue',
  invalid_json: 'JSON illisible',
  too_large: 'fichier trop volumineux',
  inflate_error: 'fichier corrompu dans l\'archive',
};

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
  const [report, setReport] = useState(null);
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
    setReport(null);
    setError('');
  }

  async function runImport() {
    if (!file || !entityId) return;
    setImporting(true);
    setError('');
    setReport(null);
    try {
      const result = await api.importGoogle(entityId, file, from, to);
      const name = entities.find((entity) => entity.entityId === result.entityId)?.name || result.entityId;
      setReport({ ...result, name });
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
          {error && <div className="error">{error}</div>}
          {report && <ImportReport report={report} />}

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

function ImportReport({ report }) {
  const nothingFound = report.pointsBeforeRange === 0;
  const outsideRange = !nothingFound && report.points === 0;

  return (
    <div className="import-report">
      <div className={nothingFound ? 'error' : 'success'}>
        Import terminé pour {report.name} : {report.points} point(s) lus, répartis sur {report.days} jour(s),{' '}
        {report.added} ajouté(s), {report.duplicates} doublon(s) ignoré(s).
      </div>

      {outsideRange && (
        <div className="error">
          Les {report.pointsBeforeRange} position(s) trouvée(s) sont en dehors de la période demandée
          {report.detectedFrom ? ` (données du ${report.detectedFrom} au ${report.detectedTo})` : ''}.
        </div>
      )}

      {nothingFound && (
        <div className="error">
          {report.isZip
            ? `Aucune position reconnue dans les ${report.entries.length} fichier(s) de l'archive.`
            : 'Aucune position reconnue dans ce fichier JSON.'}
        </div>
      )}

      <div className="muted">
        {report.isZip ? 'Archive ZIP' : 'Fichier JSON'} · {report.documents} fichier(s) exploité(s)
        {report.detectedFrom ? ` · données du ${report.detectedFrom} au ${report.detectedTo}` : ''}
      </div>

      {report.archiveError && <div className="error">Archive illisible : {report.archiveError}</div>}

      {report.files.length > 0 && (
        <ul className="import-list">
          {report.files.slice(0, 20).map((entry, index) => (
            <li key={`${entry.name}-${index}`}>
              <span className="file-name">{entry.name}</span> — {entry.points} position(s)
            </li>
          ))}
          {report.files.length > 20 && <li className="muted">… et {report.files.length - 20} autre(s)</li>}
        </ul>
      )}

      {report.skipped.length > 0 && (
        <>
          <div className="muted">Fichiers ignorés :</div>
          <ul className="import-list muted">
            {report.skipped.slice(0, 20).map((entry, index) => (
              <li key={`${entry.name}-${index}`}>
                <span className="file-name">{entry.name}</span> — {REASON_LABELS[entry.reason] || entry.reason}
              </li>
            ))}
            {report.skipped.length > 20 && <li>… et {report.skipped.length - 20} autre(s)</li>}
          </ul>
        </>
      )}

      {nothingFound && report.entries.length > 0 && (
        <>
          <div className="muted">Contenu de l'archive :</div>
          <ul className="import-list muted">
            {report.entries.slice(0, 30).map((entry, index) => (
              <li key={`${entry.name}-${index}`}>
                <span className="file-name">{entry.name}</span>
              </li>
            ))}
            {report.entries.length > 30 && <li>… et {report.entries.length - 30} autre(s)</li>}
          </ul>
          <div className="muted">
            Vérifiez que l'archive contient bien le dossier « Historique des positions » (Location History) :
            Google Takeout découpe parfois l'export en plusieurs fichiers ZIP, et seul celui qui contient ce
            dossier inclut les trajets.
          </div>
        </>
      )}

      {report.isZip && report.entries.length === 0 && (
        <div className="muted">
          Aucun fichier n'a pu être lu dans l'archive. Vérifiez qu'il s'agit bien du ZIP téléchargé depuis
          takeout.google.com et qu'il n'est pas tronqué.
        </div>
      )}
    </div>
  );
}
