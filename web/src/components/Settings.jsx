import { useState } from 'react';
import { api } from '../api.js';

export default function Settings({ config, onClose, onSaved }) {
  const [url, setUrl] = useState(config?.url || '');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
  );
}
