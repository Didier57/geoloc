const state = {
  running: false,
  kind: null,
  label: '',
  total: 0,
  done: 0,
  archived: 0,
  failures: 0,
  message: '',
  startedAt: null,
  finishedAt: null,
};

export function startJob(kind, label, total = 0) {
  state.running = true;
  state.kind = kind;
  state.label = label;
  state.total = Number.isFinite(total) ? total : 0;
  state.done = 0;
  state.archived = 0;
  state.failures = 0;
  state.message = '';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  return { ...state };
}

export function updateJob(patch = {}) {
  if (!state.running) return { ...state };
  if (patch.total !== undefined) state.total = patch.total;
  if (patch.done !== undefined) state.done = patch.done;
  if (patch.archived !== undefined) state.archived = patch.archived;
  if (patch.failures !== undefined) state.failures = patch.failures;
  if (patch.message !== undefined) state.message = patch.message;
  return { ...state };
}

export function stepJob() {
  if (state.running) state.done += 1;
  return { ...state };
}

export function finishJob({ archived, failures, message } = {}) {
  state.running = false;
  if (archived !== undefined) state.archived = archived;
  if (failures !== undefined) state.failures = failures;
  if (message !== undefined) state.message = message;
  state.finishedAt = new Date().toISOString();
  return { ...state };
}

export function getJob() {
  return { ...state };
}
