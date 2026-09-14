import { useRef, useState } from 'react';
import { api } from '../api.js';

function summarize(history) {
  const entities = history && typeof history === 'object' ? Object.keys(history) : [];
  let days = 0;
  let points = 0;
  for (const dayMap of Object.values(history || {})) {
    if (!dayMap || typeof dayMap !== 'object') continue;
    for (const list of Object.values(dayMap)) {
      if (!Array.isArray(list)) continue;
      days += 1;
      points += list.length;
    }
  }
  return { entities: entities.length, days, points };
}

export default function Backup({ onClose, onImported }) {
  const [includeConfig, setIncludeConfig] = useState(true);
  const [includeToken, setIncludeToken] = useState(true);
  const [exportStats, setExportStats] = useState(null);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

  const [fileName, setFileName] = useState('');
  const [payload, setPayload] = useState(null);
  const [importError, setImportError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const inputRef = useRef(null);

  async function download() {
    setExporting(true);
    setExportError('');
    setExportStats(null);
    try {
      const { backup, stats } = await api.backup(includeConfig, includeConfig && includeToken);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `geoloc-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStats(stats);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function pick(event) {
    const file = event.target.files?.[0];
    setFileName(file ? file.name : '');
    setPayload(null);
    setImportMessage('');
    setImportError('');
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !parsed.history) {
        throw new Error('Ce fichier ne ressemble pas à une sauvegarde Geoloc.');
      }
      setPayload(parsed);
    } catch (err) {
      setImportError(err.message);
    }
  }

  async function runImport() {
    if (!payload) return;
    setImporting(true);
    setImportError('');
    setImportMessage('');
    try {
      const result = await api.importBackup(payload);
      const parts = [
        `${result.entities} entité(s)`,
        `${result.days} jour(s)`,
        `${result.added} point(s) ajouté(s)`,
        `${result.duplicates} doublon(s) ignoré(s)`,
      ];
      if (result.invalidDays) parts.push(`${result.invalidDays} jour(s) invalide(s) ignoré(s)`);
      if (result.configRestored) parts.push('configuration Home Assistant restaurée');
      setImportMessage(`Import terminé : ${parts.join(', ')}.`);
      setPayload(null);
      setFileName('');
      if (inputRef.current) inputRef.current.value = '';
      onImported?.();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  const summary = payload ? summarize(payload.history) : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Sauvegarde</h2>

        <div className="backup-section">
          <h3>Exporter</h3>
          <p className="muted">
            Télécharge un fichier JSON contenant tous les trajets enregistrés sur le serveur ainsi que la
            configuration de Home Assistant.
          </p>
          <label className="check-line">
            <input
              type="checkbox"
              checked={includeConfig}
              onChange={(e) => setIncludeConfig(e.target.checked)}
            />
            Inclure la configuration Home Assistant (URL et entités)
          </label>
          {includeConfig && (
            <label className="check-line">
              <input
                type="checkbox"
                checked={includeToken}
                onChange={(e) => setIncludeToken(e.target.checked)}
              />
              Inclure le token d'accès (nécessaire pour restaurer la connexion)
            </label>
          )}
          {exportStats && (
            <div className="success">
              Sauvegarde générée : {exportStats.entities} entité(s), {exportStats.days} jour(s),{' '}
              {exportStats.points} point(s).
            </div>
          )}
          {exportError && <div className="error">{exportError}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={download} disabled={exporting}>
              {exporting ? 'Préparation…' : 'Télécharger la sauvegarde'}
            </button>
          </div>
        </div>

        <div className="backup-section">
          <h3>Importer</h3>
          <p className="muted">
            Réimporte une sauvegarde. Les points déjà présents (même horodatage) sont ignorés, aucun doublon n'est
            créé.
          </p>
          <input ref={inputRef} type="file" accept=".json,application/json" onChange={pick} />
          {fileName && <span className="file-name">{fileName}</span>}
          {summary && (
            <div className="muted backup-stats">
              Contenu : {summary.entities} entité(s), {summary.days} jour(s), {summary.points} point(s)
              {payload?.homeAssistant ? ' + configuration Home Assistant' : ''}.
            </div>
          )}
          {importMessage && <div className="success">{importMessage}</div>}
          {importError && <div className="error">{importError}</div>}
          <div className="modal-actions">
            <button className="btn" onClick={runImport} disabled={!payload || importing}>
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
