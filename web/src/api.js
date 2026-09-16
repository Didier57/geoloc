async function parseResponse(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const error = new Error(data.message || data.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  return parseResponse(res);
}

export const api = {
  login: (identifier, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
  me: () => request('/api/auth/me'),
  setSelection: (entityId) =>
    request('/api/auth/selection', { method: 'POST', body: JSON.stringify({ entityId }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  users: () => request('/api/users'),
  createUser: (payload) => request('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),

  haConfig: () => request('/api/config/ha'),
  haStatus: () => request('/api/config/ha/status'),
  testHa: (payload) => request('/api/config/ha/test', { method: 'POST', body: JSON.stringify(payload) }),
  saveHa: (payload) => request('/api/config/ha', { method: 'POST', body: JSON.stringify(payload) }),
  saveHaEntities: (entities) =>
    request('/api/config/ha/entities', { method: 'POST', body: JSON.stringify({ entities }) }),

  entities: (all) => request(`/api/geoloc/entities${all ? '?all=1' : ''}`),
  archive: (force) =>
    request('/api/geoloc/archive', { method: 'POST', body: JSON.stringify({ force: !!force }) }),
  reverse: (lat, lng) => request(`/api/geoloc/reverse?lat=${lat}&lng=${lng}`),
  places: (lat, lng, radius) =>
    request(`/api/geoloc/places?lat=${lat}&lng=${lng}&radius=${radius || 150}`),
  tracks: (entityIds, from, to) => {
    const params = new URLSearchParams({ entities: entityIds.join(','), from });
    if (to) params.set('to', to);
    return request(`/api/geoloc/tracks?${params.toString()}`);
  },

  importGoogle: async (entityId, file, from, to) => {
    const params = new URLSearchParams({ entityId });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetch(`/api/geoloc/import?${params.toString()}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    return parseResponse(res);
  },

  backup: (includeConfig, includeToken) =>
    request(`/api/backup?config=${includeConfig ? '1' : '0'}&token=${includeToken ? '1' : '0'}`),
  importBackup: (payload) => request('/api/backup', { method: 'POST', body: JSON.stringify(payload) }),
};
