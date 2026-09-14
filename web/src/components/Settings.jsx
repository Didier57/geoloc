import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings({ config, onClose, onSaved, onEntitiesSaved }) {
  const [url, setUrl] = useState(config?.url || '');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [entities, setEntities] = useState([]);
  const [selected, setSelected] = useState(() => new Set(config?.entities || []));
  const [entitiesError, setEntitiesError] = useState('');
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [savingEntities, setSavingEntities] = useState(false);
  const [entitiesMessage, setEntitiesMessage] = useState('');

  const tokenAvailable = Boolean(token) || Boolean(config?.tokenSet);

  async function test() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.testHa({ url, token });
      setMessage(`Connexion réussie : ${result.message}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.saveHa({ url, token });
      setMessage(`Configuration enregistrée (${result.message}).`);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const loadEntities = useCallback(async () => {
    setLoadingEntities(true);
    setEntitiesError('');
    try {
      const { entities: list, selected: stored } = await api.entities(true);
      setEntities(list);
      if (Array.isArray(stored) && stored.length > 0) setSelected(new Set(stored));
    } catch (err) {
      setEntitiesError(err.message);
    } finally {
      setLoadingEntities(false);
    }
  }, []);

  useEffect(() => {
    if (config?.configured) loadEntities();
  }, [config?.configured, loadEntities]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setEntitiesMessage('');
  }

  async function saveEntities() {
    setSavingEntities(true);
    setEntitiesError('');
    setEntitiesMessage('');
    try {
      const result = await api.saveHaEntities([...selected]);
      setSelected(new Set(result.entities || []));
      setEntitiesMessage(`Sélection enregistrée (${(result.entities || []).length} entité(s)).`);
      onEntitiesSaved?.();
    } catch (err) {
      setEntitiesError(err.message);
    } finally {
      setSavingEntities(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Home Assistant</h2>
        <p className="muted">
          Renseignez l'adresse de votre instance et un token d'accès de longue durée (profil → « Jetons d'accès
          longue durée »).
        </p>
        <label>
          Adresse
          <input
            placeholder="http://192.168.1.10:8123"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label>
          Token d'accès
          <input
            type="password"
            placeholder="eyJ..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        {config?.tokenSet && !token && <p className="muted">Un token est déjà enregistré ; laissez vide pour le conserver.</p>}
        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Fermer
          </button>
          <button className="btn ghost" onClick={test} disabled={busy || !url}>
            Tester
          </button>
          <button className="btn" onClick={save} disabled={busy || !url || !tokenAvailable}>
            Enregistrer
          </button>
        </div>

        {config?.configured && (
          <div className="entities-section">
            <div className="filter-head">
              <span>Entités à afficher</span>
              <button type="button" className="link" onClick={loadEntities} disabled={loadingEntities}>
                Recharger
              </button>
              <button type="button" className="link" onClick={() => setSelected(new Set(entities.map((e) => e.entityId)))}>
                Tout
              </button>
              <button type="button" className="link" onClick={() => setSelected(new Set())}>
                Aucun
              </button>
            </div>
            <p className="muted">
              Cochez les entités géolocalisées à afficher sur la carte. Seules celles-ci apparaîtront dans la fenêtre
              principale.
            </p>
            {loadingEntities && <p className="muted">Chargement des entités…</p>}
            {entitiesError && <div className="error">{entitiesError}</div>}
            {!loadingEntities && (
              <div className="chips entities-list">
                {entities.length === 0 && (
                  <span className="muted">Aucune entité géolocalisée trouvée dans Home Assistant.</span>
                )}
                {entities.map((entity) => {
                  const checked = selected.has(entity.entityId);
                  return (
                    <label
                      key={entity.entityId}
                      className={`chip ${checked ? 'active' : ''}`}
                      title={entity.entityId}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggle(entity.entityId)} />
                      {entity.name}
                      {entity.state && <span className="chip-state">{entity.state}</span>}
                    </label>
                  );
                })}
              </div>
            )}
            {entitiesMessage && <div className="success">{entitiesMessage}</div>}
            <div className="modal-actions">
              <button className="btn" onClick={saveEntities} disabled={savingEntities || loadingEntities}>
                Enregistrer la sélection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
