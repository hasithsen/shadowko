const SHARE_URL = "https://shadowko.com";

function buildPayload({ score = 0, distance = 0, combo = 1, isBest = false } = {}) {
  const s = Math.max(0, Math.floor(Number(score) || 0));
  const d = Math.max(0, Math.floor(Number(distance) || 0));
  const c = Math.max(1, Math.floor(Number(combo) || 1));

  const url = new URL(SHARE_URL);
  url.searchParams.set("utm_source", "share");
  url.searchParams.set("utm_medium", "player");
  url.searchParams.set("utm_campaign", "score");
  if (s > 0) url.searchParams.set("beat", String(s));

  const challenge = isBest
    ? `New best in SHADOWKO: ${s.toLocaleString()} — can you outrun me?`
    : `I scored ${s.toLocaleString()} in SHADOWKO — beat that.`;

  const detail = `${d.toLocaleString()}m · peak combo ×${c}`;
  const text = `${challenge}\n${detail}\nMaster the dark. Outrun the light.`;
  const href = url.toString();

  return {
    title: "SHADOWKO",
    text,
    url: href,
    clipboard: `${text}\n${href}`,
    score: s,
    isBest: !!isBest,
  };
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

export const shareScore = {
  build(stats) {
    return buildPayload(stats);
  },

  async native(stats) {
    const payload = buildPayload(stats);
    if (!navigator.share) return { ok: false, reason: "unsupported", payload };

    try {
      const data = { title: payload.title, text: payload.text, url: payload.url };
      if (navigator.canShare && !navigator.canShare(data)) {
        await navigator.share({ title: payload.title, text: payload.clipboard });
      } else {
        await navigator.share(data);
      }
      return { ok: true, method: "native", payload };
    } catch (err) {
      if (err?.name === "AbortError") return { ok: false, reason: "abort", payload };
      return { ok: false, reason: "error", payload, error: err };
    }
  },

  async copy(stats) {
    const payload = buildPayload(stats);
    try {
      const ok = await copyText(payload.clipboard);
      return { ok, method: "copy", payload };
    } catch {
      return { ok: false, reason: "error", payload };
    }
  },

  twitterUrl(stats) {
    const payload = buildPayload(stats);
    const u = new URL("https://twitter.com/intent/tweet");
    u.searchParams.set("text", payload.text);
    u.searchParams.set("url", payload.url);
    return u.toString();
  },

  whatsappUrl(stats) {
    const payload = buildPayload(stats);
    const u = new URL("https://wa.me/");
    u.searchParams.set("text", payload.clipboard);
    return u.toString();
  },
};
