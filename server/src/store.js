import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';
import { haversineKm } from './motion.js';
import { hashPassword } from './utils/password.js';

const emptyState = () => ({
  users: [],
  nextUserId: 1,
  ha: null,
  dawarich: null,
  emptyDays: {},
  deletedPoints: {},
  placeLabels: [],
});

let state = emptyState();

function load() {
  try {
    if (existsSync(config.dataFile)) {
      const parsed = JSON.parse(readFileSync(config.dataFile, 'utf8'));
      state = { ...emptyState(), ...parsed };
      if (!Array.isArray(state.users)) state.users = [];
      if (typeof state.nextUserId !== 'number') state.nextUserId = state.users.length + 1;
    }
  } catch (err) {
    console.error(`[store] Lecture impossible de ${config.dataFile} : ${err.message}`);
    state = emptyState();
  }
}

function save() {
  try {
    const dir = dirname(config.dataFile);
    if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${config.dataFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, config.dataFile);
  } catch (err) {
    console.error(`[store] Écriture impossible de ${config.dataFile} : ${err.message}`);
  }
}

load();

export function listUsers() {
  return state.users;
}

export function findUserByIdentifier(identifier) {
  const value = String(identifier || '').trim().toLowerCase();
  if (!value) return undefined;
  return state.users.find(
    (u) => u.username.toLowerCase() === value || (u.email || '').toLowerCase() === value,
  );
}

export function findUserById(id) {
  return state.users.find((u) => u.id === id);
}

export function countAdmins() {
  return state.users.filter((u) => u.role === 'admin' && u.active).length;
}

export function createUser({ username, email, password, role }) {
  const user = {
    id: state.nextUserId++,
    username: String(username).trim(),
    email: email ? String(email).trim() : null,
    passwordHash: hashPassword(password),
    role: role === 'admin' ? 'admin' : 'user',
    active: true,
    selectedEntity: null,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  state.users.push(user);
  save();
  return user;
}

export function updateUser(id, patch) {
  const user = findUserById(id);
  if (!user) return null;
  if (patch.email !== undefined) user.email = patch.email ? String(patch.email).trim() : null;
  if (patch.role !== undefined) user.role = patch.role === 'admin' ? 'admin' : 'user';
  if (patch.active !== undefined) user.active = Boolean(patch.active);
  if (patch.password) user.passwordHash = hashPassword(patch.password);
  save();
  return user;
}

export function deleteUser(id) {
  const index = state.users.findIndex((u) => u.id === id);
  if (index === -1) return false;
  state.users.splice(index, 1);
  save();
  return true;
}

export function touchLogin(id) {
  const user = findUserById(id);
  if (user) {
    user.lastLoginAt = new Date().toISOString();
    save();
  }
}

export function setUserSelectedEntity(id, entityId) {
  const user = findUserById(id);
  if (!user) return null;
  user.selectedEntity = entityId ? String(entityId) : null;
  save();
  return user.selectedEntity;
}

export function hasEmptyDay(entityId, day) {
  const list = state.emptyDays?.[String(entityId)];
  return Array.isArray(list) && list.includes(day);
}

export function markEmptyDay(entityId, day) {
  const key = String(entityId);
  if (!state.emptyDays) state.emptyDays = {};
  const list = Array.isArray(state.emptyDays[key]) ? state.emptyDays[key] : [];
  if (list.includes(day)) return;
  list.push(day);
  list.sort();
  state.emptyDays[key] = list;
  save();
}

export function clearEmptyDay(entityId, day) {
  const key = String(entityId);
  const list = state.emptyDays?.[key];
  if (!Array.isArray(list) || !list.includes(day)) return;
  state.emptyDays[key] = list.filter((value) => value !== day);
  save();
}

export function deletedPointsFor(entityId) {
  const list = state.deletedPoints?.[String(entityId)];
  return Array.isArray(list) ? list : [];
}

export function markPointDeleted(entityId, timestamp) {
  const key = String(entityId);
  const value = String(timestamp);
  if (!state.deletedPoints) state.deletedPoints = {};
  const list = Array.isArray(state.deletedPoints[key]) ? state.deletedPoints[key] : [];
  if (list.includes(value)) return;
  list.push(value);
  list.sort();
  state.deletedPoints[key] = list;
  save();
}

export function getHaConfig() {
  return state.ha;
}

export function setHaConfig(ha) {
  state.ha = ha;
  save();
}

export function setHaEntities(entityIds) {
  if (!state.ha) return null;
  state.ha.entities = [...new Set((entityIds || []).map(String))];
  state.ha.entitiesUpdatedAt = new Date().toISOString();
  save();
  return state.ha.entities;
}

export function getDawarichConfig() {
  return state.dawarich;
}

export function setDawarichConfig(cfg) {
  state.dawarich = cfg;
  save();
  return state.dawarich;
}

const LABEL_MATCH_KM = 0.15;

export function listPlaceLabels() {
  return Array.isArray(state.placeLabels) ? state.placeLabels : [];
}

export function upsertPlaceLabel({ latitude, longitude, name, placeId }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const label = String(name || '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !label) return null;
  if (!Array.isArray(state.placeLabels)) state.placeLabels = [];
  const existing = state.placeLabels.find(
    (item) => haversineKm(item.latitude, item.longitude, lat, lng) <= LABEL_MATCH_KM,
  );
  const entry = {
    latitude: lat,
    longitude: lng,
    name: label,
    placeId: placeId != null ? String(placeId) : null,
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    state.placeLabels.push(entry);
  }
  save();
  return listPlaceLabels();
}

export function removePlaceLabel(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Array.isArray(state.placeLabels)) return [];
  state.placeLabels = state.placeLabels.filter(
    (item) => haversineKm(item.latitude, item.longitude, lat, lng) > LABEL_MATCH_KM,
  );
  save();
  return listPlaceLabels();
}
