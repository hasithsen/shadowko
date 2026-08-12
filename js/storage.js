const KEY = "shadowko_v1";
const VERSION = 1;

const defaults = {
  v: VERSION,
  best: 0,
  runs: 0,
  seenHow: false,
  totalDistance: 0,
  muted: false,
};

function sanitize(raw) {
  const data = { ...defaults, ...(raw && typeof raw === "object" ? raw : {}) };
  data.v = VERSION;
  data.best = Math.max(0, Math.floor(Number(data.best) || 0));
  data.runs = Math.max(0, Math.floor(Number(data.runs) || 0));
  data.totalDistance = Math.max(0, Math.floor(Number(data.totalDistance) || 0));
  data.seenHow = !!data.seenHow;
  data.muted = !!data.muted;
  return data;
}

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return sanitize(raw);
  } catch {
    return { ...defaults };
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitize(data)));
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  get() {
    return read();
  },
  addRun(score, distance) {
    const data = read();
    const s = Math.max(0, Math.floor(Number(score) || 0));
    const d = Math.max(0, Math.floor(Number(distance) || 0));
    data.runs += 1;
    data.totalDistance += d;
    if (s > data.best) data.best = s;
    write(data);
    return data;
  },
  markHowSeen() {
    const data = read();
    data.seenHow = true;
    write(data);
  },
  setMuted(muted) {
    const data = read();
    data.muted = !!muted;
    write(data);
    return data.muted;
  },
};
