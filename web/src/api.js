async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
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

export const api = {
  login: (identifier, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  users: () => request('/api/users'),
  createUser: (payload) => request('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),

  haConfig: () => request('/api/config/ha'),
  testHa: (payload) => request('/api/config/ha/test', { method: 'POST', body: JSON.stringify(payload) }),
  saveHa: (payload) => request('/api/config/ha', { method: 'POST', body: JSON.stringify(payload) }),

  entities: () => request('/api/geoloc/entities'),
  reverse: (lat, lng) => request(`/api/geoloc/reverse?lat=${lat}&lng=${lng}`),
  tracks: (entityIds, from, to) => {
    const params = new URLSearchParams({ entities: entityIds.join(','), from });
    if (to) params.set('to', to);
    return request(`/api/geoloc/tracks?${params.toString()}`);
  },
};
