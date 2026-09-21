import { useEffect, useState } from 'react';
import { api } from '../api.js';

function toDateInput(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function daysAgo(count) {
  const d = new Date();
  d.setDate(d.getDate() - count);
  return toDateInput(d);
}

export default function Dawarich({ currentEntityId, onClose }) {
  const [config, setConfig] = useState(null);
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [entities, setEntities] = useState([]);
  const [selected, setSelected] = useState(() => (currentEntityId ? [currentEntityId] : []));
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(() => toDateInput(new Date()));
  const [exporting, setExporting] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.dawarichConfig();
        if (cancelled) return;
        setConfig(cfg);
        setUrl(cfg.url || '');
        setDeviceId(cfg.deviceId || '');
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      try {
        const { entities: list } = await api.entities(true);
        if (cancelled) return;
        setEntities(list);
        setSelected((current) => (current.length > 0 ? current : list.map((e) => e.entityId)));
      } catch (err) {
        if (!cancelled) setError((prev) => prev || err.message);
      } finally {
        if (!cancelled) setLoadingEntities(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const keyAvailable = Boolean(apiKey) || Boolean(config?.apiKeySet);

  function toggle(id) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function test() {
    setBusy(true);
    setConfigMessage('');
    setError('');
    try {
      const payload = { url };
      if (apiKey) payload.apiKey = apiKey;
      const result = await api.testDawarich(payload);
      setConfigMessage(`Connexion réussie : ${result.message}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setConfigMessage('');
    setError('');
    try {
      const payload = { url, deviceId };
      if (apiKey) payload.apiKey = apiKey;
      const result = await api.saveDawarich(payload);
      setConfig(result.config);
      setApiKey('');
      setConfigMessage(`Configuration enregistrée (${result.message}).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runExport() {
    if (selected.length === 0) return;
    setExporting(true);
    setError('');
    setReport(null);
    try {
      const result = await api.exportDawarich({ entities: selected, from, to, deviceId });
      setReport(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Dawarich</h2>

        <div className="backup-section">
          <h3>Connexion</h3>
          <p className="muted">
            Renseignez l'adresse de votre instance Dawarich auto-hébergée et une clé API (compte → section API).
            La clé est conservée chiffrée sur le serveur.
          </p>
          <label>
            Adresse
            <input
              placeholder="https://dawarich.exemple.fr"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            Clé API
            <input
              type="password"
              placeholder="clé API"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          {config?.apiKeySet && !apiKey && (
            <p className="muted">Une clé est déjà enregistrée ; laissez vide pour la conserver.</p>
          )}
          <label>
            Identifiant d'appareil (optionnel)
            <input
              placeholder="ex. telephone-didier"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            />
          </label>
          <p className="muted">
            Si cet identifiant est vide, l'identifiant de chaque entité Home Assistant est utilisé pour
            regrouper les points dans Dawarich.
          </p>
          {configMessage && <div className="success">{configMessage}</div>}
          <div className="modal-actions">
            <button className="btn ghost" onClick={test} disabled={busy || !url || !keyAvailable}>
              Tester
            </button>
            <button className="btn" onClick={save} disabled={busy || !url || !keyAvailable}>
              {busy ? 'Vérification…' : 'Enregistrer'}
            </button>
          </div>
        </div>

        <div className="backup-section">
          <h3>Envoyer les données</h3>
          <p className="muted">
            Transfère les points enregistrés sur le serveur vers Dawarich via l'API Overland, par lots. Les
            points déjà supprimés dans Geoloc ne sont pas envoyés. Relancer un export sur la même période peut
            créer des doublons : ne l'utilisez que pour compléter des données manquantes.
          </p>

          <div className="filter-head">
            <span>Appareils</span>
            <button
              type="button"
              className="link"
              onClick={() => setSelected(entities.map((e) => e.entityId))}
              disabled={loadingEntities || exporting}
            >
              Tout
            </button>
            <button
              type="button"
              className="link"
              onClick={() => setSelected([])}
              disabled={loadingEntities || exporting}
            >
              Aucun
            </button>
          </div>
          {loadingEntities ? (
            <p className="muted">Chargement des appareils…</p>
          ) : (
            <div className="chips entities-list">
              {entities.length === 0 && <span className="muted">Aucun appareil disponible.</span>}
              {entities.map((entity) => {
                const checked = selected.includes(entity.entityId);
                return (
                  <label
                    key={entity.entityId}
                    className={`chip ${checked ? 'active' : ''}`}
                    title={entity.entityId}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(entity.entityId)} />
                    {entity.name}
                  </label>
                );
              })}
            </div>
          )}

          <label className="check-line">Période à envoyer</label>
          <div className="import-dates">
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              disabled={exporting}
            />
            <span className="muted">au</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              disabled={exporting}
            />
          </div>

          {error && <div className="error">{error}</div>}
          {report && <ExportReport report={report} />}

          <div className="modal-actions">
            <button
              className="btn"
              onClick={runExport}
              disabled={exporting || selected.length === 0 || !config?.configured}
            >
              {exporting ? 'Envoi…' : 'Envoyer vers Dawarich'}
            </button>
          </div>
          {!config?.configured && (
            <p className="muted">Enregistrez d'abord la connexion pour activer l'envoi.</p>
          )}
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

function ExportReport({ report }) {
  return (
    <div className="import-report">
      <div className={report.sent > 0 ? 'success' : 'muted'}>
        {report.sent} point(s) envoyé(s) sur {report.points} trouvé(s), en {report.batches} lot(s), sur{' '}
        {report.days} jour(s).
      </div>
      {report.skipped > 0 && (
        <div className="muted">{report.skipped} point(s) ignoré(s) (supprimés ou incomplets).</div>
      )}
      {report.haError && (
        <div className="error">
          Home Assistant n'a pas pu être interrogé ({report.haError}) : seules les données déjà archivées ont
          été envoyées.
        </div>
      )}
      {report.points === 0 && (
        <div className="muted">Aucun point enregistré sur le serveur pour cette période.</div>
      )}
    </div>
  );
}
