/**
 * Sponsorship inventory + live partner kits.
 *
 * When a deal closes, set `live: true` on that kit (and optionally `weight`).
 * Live kits take priority over open-inventory pitches.
 *
 * Surfaces: title pill, HUD chip, in-world billboards, game-over card, share copy.
 */

export const SITE_ORIGIN = "https://shadowko.com";

export const SPONSOR_INQUIRY_URL =
  "mailto:sponsors@shadowko.com?subject=SHADOWKO%20Sponsorship&body=Hi%20SHADOWKO%20team%2C%0A%0AI%27d%20like%20to%20sponsor%20the%20game.%0ABrand%3A%20%0ABudget%20%2F%20flight%3A%20%0A";

/**
 * @typedef {object} SponsorKit
 * @property {string} id
 * @property {string} name
 * @property {string} tagline
 * @property {string} kicker
 * @property {string} color
 * @property {string} accent
 * @property {boolean} [live] - paid creative (disables inventory copy)
 * @property {string} [presentedBy] - eyebrow when live, e.g. "Presented by"
 * @property {string} [ctaUrl] - brand destination (else inquiry mailto)
 * @property {string} [logoText] - short monogram for billboards (defaults to initials)
 * @property {number} [weight] - rotation weight (default 1)
 * @property {string} [flight] - optional note for ops, not shown in UI
 */

/** @type {SponsorKit[]} */
export const SPONSORS = [
  {
    id: "brand-here",
    name: "YOUR BRAND HERE",
    tagline: "Logo on title · HUD · billboards",
    kicker: "Sponsorship available",
    color: "#f0a020",
    accent: "#ffc857",
    live: false,
    logoText: "YB",
    weight: 1,
  },
  {
    id: "own-night",
    name: "OWN THE NIGHT",
    tagline: "Premium placement across every run",
    kicker: "Partner with SHADOWKO",
    color: "#2fd6c0",
    accent: "#7aeee0",
    live: false,
    logoText: "ON",
    weight: 1,
  },
  {
    id: "feature-slot",
    name: "FEATURE THIS SLOT",
    tagline: "Your name on share cards players send",
    kicker: "High-intent inventory",
    color: "#ffc857",
    accent: "#ffe29a",
    live: false,
    logoText: "FS",
    weight: 1,
  },
  {
    id: "sponsor-run",
    name: "SPONSOR THIS RUN",
    tagline: "Be the brand behind the replay loop",
    kicker: "Available now",
    color: "#e8b84a",
    accent: "#f0a020",
    live: false,
    logoText: "SR",
    weight: 1,
  },
  // Example live kit (keep live:false until a deal closes):
  // {
  //   id: "acme",
  //   name: "ACME",
  //   tagline: "Built for the night shift",
  //   kicker: "Presented by",
  //   presentedBy: "Presented by",
  //   color: "#f0a020",
  //   accent: "#ffc857",
  //   live: true,
  //   ctaUrl: "https://example.com",
  //   logoText: "AC",
  //   weight: 4,
  // },
];

let lastId = null;

function validSponsor(s) {
  return s && typeof s.name === "string" && typeof s.color === "string" && typeof s.accent === "string";
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "SK";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function defaultSponsor() {
  return normalizeSponsor(SPONSORS[0] || {
    id: "brand-here",
    name: "YOUR BRAND HERE",
    tagline: "Logo on title · HUD · billboards",
    kicker: "Sponsorship available",
    color: "#f0a020",
    accent: "#ffc857",
    live: false,
  });
}

/** Normalize kit fields used by UI + canvas. */
export function normalizeSponsor(raw) {
  const s = { ...(raw && typeof raw === "object" ? raw : {}) };
  const base = {
    id: String(s.id || "sponsor"),
    name: String(s.name || "YOUR BRAND HERE"),
    tagline: String(s.tagline || "Put your brand on SHADOWKO"),
    kicker: String(s.kicker || (s.live ? "Presented by" : "Sponsorship available")),
    color: String(s.color || "#f0a020"),
    accent: String(s.accent || "#ffc857"),
    live: !!s.live,
    presentedBy: String(s.presentedBy || (s.live ? "Presented by" : "Open for brand partners")),
    ctaUrl: s.ctaUrl ? String(s.ctaUrl) : "",
    logoText: String(s.logoText || initials(s.name)),
    weight: Math.max(1, Math.floor(Number(s.weight) || 1)),
  };
  return base;
}

function weightedPick(pool, seed) {
  const total = pool.reduce((n, s) => n + (s.weight || 1), 0);
  let tick = Math.abs(seed | 0) % Math.max(1, total);
  for (const s of pool) {
    tick -= s.weight || 1;
    if (tick < 0) return s;
  }
  return pool[pool.length - 1];
}

/**
 * Prefer live kits when any exist; otherwise rotate open inventory.
 * @param {number} [seed]
 * @param {{ avoidLast?: boolean }} [opts]
 */
export function pickSponsor(seed = Date.now(), { avoidLast = true } = {}) {
  const all = SPONSORS.filter(validSponsor).map(normalizeSponsor);
  if (!all.length) return defaultSponsor();

  const live = all.filter((s) => s.live);
  const pool = live.length ? live : all;

  let pick;
  if (pool.length === 1) {
    pick = pool[0];
  } else {
    pick = weightedPick(pool, seed);
    if (avoidLast && lastId && pick.id === lastId) {
      const others = pool.filter((s) => s.id !== lastId);
      pick = others.length ? weightedPick(others, seed + 17) : pick;
    }
  }

  lastId = pick.id;
  return { ...pick };
}

/** Destination for pills / chip — brand CTA or sponsorship inquiry. */
export function sponsorHref(sponsor, { placement = "pill" } = {}) {
  const s = normalizeSponsor(sponsor);
  if (s.live && s.ctaUrl) {
    try {
      const u = new URL(s.ctaUrl, SITE_ORIGIN);
      u.searchParams.set("utm_source", "shadowko");
      u.searchParams.set("utm_medium", "sponsor");
      u.searchParams.set("utm_campaign", s.id);
      u.searchParams.set("utm_content", placement);
      return u.toString();
    } catch {
      return s.ctaUrl;
    }
  }

  try {
    const u = new URL(SPONSOR_INQUIRY_URL);
    // mailto query already set; append placement hint in body if possible
    return u.toString();
  } catch {
    return SPONSOR_INQUIRY_URL;
  }
}

export function isLiveSponsor(sponsor) {
  return !!normalizeSponsor(sponsor).live;
}
