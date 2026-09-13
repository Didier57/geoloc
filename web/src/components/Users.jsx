import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY_FORM = { username: '', email: '', password: '', role: 'user' };

export default function Users({ onClose }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      const { users: list } = await api.users();
      setUsers(list);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(event) {
    event.preventDefault();
    setError('');
    try {
      await api.createUser(form);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function patch(id, payload) {
    setError('');
    try {
      await api.updateUser(id, payload);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm('Supprimer cet utilisateur ?')) return;
    setError('');
    try {
      await api.deleteUser(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function resetPassword(user) {
    const password = window.prompt(`Nouveau mot de passe pour ${user.username} (8 caractères min) :`);
    if (password) patch(user.id, { password });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Utilisateurs</h2>
        {error && <div className="error">{error}</div>}

        <table className="users-table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Actif</th>
              <th>Dernière connexion</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.email || '—'}</td>
                <td>
                  <select value={user.role} onChange={(e) => patch(user.id, { role: e.target.value })}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={user.active}
                    onChange={(e) => patch(user.id, { active: e.target.checked })}
                  />
                </td>
                <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}</td>
                <td className="row-actions">
                  <button type="button" className="link" onClick={() => resetPassword(user)}>
                    Mot de passe
                  </button>
                  <button type="button" className="link danger" onClick={() => remove(user.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Ajouter un utilisateur</h3>
        <form className="user-form" onSubmit={create}>
          <input
            placeholder="Nom d'utilisateur"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
          <input
            placeholder="Email (optionnel)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button className="btn">Ajouter</button>
        </form>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
