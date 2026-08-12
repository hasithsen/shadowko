/**
 * Open sponsorship inventory — these creatives pitch real partners,
 * not fake placeholder brands. Swap in a live kit when a deal closes.
 *
 * Surfaces: title pill, HUD chip, in-world billboards, game-over card.
 */
export const SPONSOR_INQUIRY_URL =
  "mailto:sponsors@shadowko.com?subject=SHADOWKO%20Sponsorship&body=Hi%20SHADOWKO%20team%2C%0A%0AI%27d%20like%20to%20sponsor%20the%20game.%0A";

export const SPONSORS = [
  {
    id: "brand-here",
    name: "YOUR BRAND HERE",
    tagline: "Logo on title · HUD · billboards",
    kicker: "Open for sponsors",
    color: "#f0a020",
    accent: "#ffc857",
  },
  {
    id: "own-night",
    name: "OWN THE NIGHT",
    tagline: "Premium placement across every run",
    kicker: "Partner with SHADOWKO",
    color: "#2fd6c0",
    accent: "#7aeee0",
  },
  {
    id: "feature-slot",
    name: "FEATURE THIS SLOT",
    tagline: "Your name on share cards players send",
    kicker: "High-intent inventory",
    color: "#ffc857",
    accent: "#ffe29a",
  },
  {
    id: "sponsor-run",
    name: "SPONSOR THIS RUN",
    tagline: "Be the brand behind the replay loop",
    kicker: "Available now",
    color: "#e8b84a",
    accent: "#f0a020",
  },
];

let lastId = null;

function validSponsor(s) {
  return s && typeof s.name === "string" && typeof s.color === "string" && typeof s.accent === "string";
}

export function defaultSponsor() {
  return {
    id: "brand-here",
    name: "YOUR BRAND HERE",
    tagline: "Logo on title · HUD · billboards",
    kicker: "Open for sponsors",
    color: "#f0a020",
    accent: "#ffc857",
  };
}

/** Rotate open-inventory creatives so partners see multiple placement pitches. */
export function pickSponsor(seed = Date.now(), { avoidLast = true } = {}) {
  const pool = SPONSORS.filter(validSponsor);
  if (!pool.length) return defaultSponsor();

  let pick;
  if (pool.length === 1) {
    pick = pool[0];
  } else {
    let idx = Math.abs(seed | 0) % pool.length;
    pick = pool[idx];
    if (avoidLast && lastId && pick.id === lastId) {
      idx = (idx + 1 + (Math.abs(seed) % (pool.length - 1))) % pool.length;
      if (pool[idx].id === lastId) idx = (idx + 1) % pool.length;
      pick = pool[idx];
    }
  }

  lastId = pick.id;
  return { ...pick };
}
