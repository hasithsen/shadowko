/** Sponsor creatives — replace with live partner kits for production deals. */
export const SPONSORS = [
  {
    id: "nova",
    name: "NOVA THREADS",
    tagline: "Wear the night",
    color: "#f0a020",
    accent: "#ffc857",
  },
  {
    id: "pulse",
    name: "PULSE ENERGY",
    tagline: "Stay lit longer",
    color: "#2fd6c0",
    accent: "#7aeee0",
  },
  {
    id: "drift",
    name: "DRIFT MOTORS",
    tagline: "Quiet power",
    color: "#ff4d5e",
    accent: "#ff8a96",
  },
  {
    id: "koin",
    name: "KOIN PAY",
    tagline: "Shadow-fast checkout",
    color: "#e8b84a",
    accent: "#ffe29a",
  },
];

let lastId = null;

function validSponsor(s) {
  return s && typeof s.name === "string" && typeof s.color === "string" && typeof s.accent === "string";
}

export function pickSponsor(seed = Date.now(), { avoidLast = true } = {}) {
  const pool = SPONSORS.filter(validSponsor);
  if (!pool.length) {
    return {
      id: "shadowko",
      name: "SHADOWKO",
      tagline: "Master the dark",
      color: "#f0a020",
      accent: "#ffc857",
    };
  }

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
