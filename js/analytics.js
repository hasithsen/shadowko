/**
 * Lightweight analytics bridge for sponsorship + growth metrics.
 * Forwards to window.plausible / gtag / dataLayer when present; always safe no-op otherwise.
 */

const QUEUE_KEY = "shadowko_analytics_q";
const MAX_QUEUE = 40;

function pushQueue(event, props) {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    const q = raw ? JSON.parse(raw) : [];
    q.push({ event, props, t: Date.now() });
    while (q.length > MAX_QUEUE) q.shift();
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* private mode / quota */
  }
}

function emit(event, props = {}, { queue = true } = {}) {
  if (!event || typeof event !== "string") return;

  const payload = { ...props };
  let delivered = false;
  try {
    if (typeof window.plausible === "function") {
      window.plausible(event, { props: payload });
      delivered = true;
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", event, payload);
      delivered = true;
    }
  } catch {
    /* ignore */
  }

  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...payload });
  } catch {
    /* ignore */
  }

  if (queue && !delivered) pushQueue(event, payload);
}

export function track(event, props = {}) {
  emit(event, props, { queue: true });
}

function flushQueue() {
  let q = [];
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    q = raw ? JSON.parse(raw) : [];
    sessionStorage.removeItem(QUEUE_KEY);
  } catch {
    return;
  }
  for (const item of q) {
    if (!item?.event) continue;
    emit(item.event, item.props || {}, { queue: false });
  }
}

// Replay queued events once a tag manager / Plausible script arrives
if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    setTimeout(flushQueue, 1200);
  });
}

export const analytics = {
  track,
  playStart(sponsorId) {
    track("play_start", { sponsor: sponsorId || "none" });
  },
  gameOver({ score = 0, distance = 0, isBest = false, sponsorId = "" } = {}) {
    track("game_over", {
      score: Math.floor(score),
      distance: Math.floor(distance),
      is_best: !!isBest,
      sponsor: sponsorId || "none",
    });
  },
  share(method, { score = 0, isBest = false } = {}) {
    track("share", { method: method || "unknown", score: Math.floor(score), is_best: !!isBest });
  },
  sponsorImpression(sponsorId, placement) {
    track("sponsor_impression", { sponsor: sponsorId || "none", placement: placement || "unknown" });
  },
  sponsorClick(sponsorId, placement) {
    track("sponsor_click", { sponsor: sponsorId || "none", placement: placement || "unknown" });
  },
  challengeSeen(target) {
    track("challenge_seen", { beat: Math.floor(target) || 0 });
  },
  challengeBeaten(target, score) {
    track("challenge_beaten", { beat: Math.floor(target) || 0, score: Math.floor(score) || 0 });
  },
};
