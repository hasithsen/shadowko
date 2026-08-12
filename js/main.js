import { Game } from "./game.js";
import { storage } from "./storage.js";
import { pickSponsor, SPONSORS } from "./sponsors.js";
import { shareScore } from "./share.js";

const $ = (id) => document.getElementById(id);

const els = {
  canvas: $("game"),
  hud: $("hud"),
  scoreVal: $("scoreVal"),
  comboVal: $("comboVal"),
  morphVal: $("morphVal"),
  formTrack: $("formTrack"),
  titleScreen: $("titleScreen"),
  howScreen: $("howScreen"),
  overScreen: $("overScreen"),
  playBtn: $("playBtn"),
  howPlayBtn: $("howPlayBtn"),
  retryBtn: $("retryBtn"),
  shareBtn: $("shareBtn"),
  shareBtnLabel: $("shareBtnLabel"),
  sharePrompt: $("sharePrompt"),
  copyScoreBtn: $("copyScoreBtn"),
  twitterShare: $("twitterShare"),
  whatsappShare: $("whatsappShare"),
  menuBtn: $("menuBtn"),
  muteBtn: $("muteBtn"),
  bestVal: $("bestVal"),
  runsVal: $("runsVal"),
  finalScore: $("finalScore"),
  finalDist: $("finalDist"),
  finalCombo: $("finalCombo"),
  overBestVal: $("overBestVal"),
  newBest: $("newBest"),
  titleSponsorName: $("titleSponsorName"),
  overSponsorName: $("overSponsorName"),
  sponsorChip: $("sponsorChip"),
  sponsorChipName: $("sponsorChipName"),
  toast: $("toast"),
  presentedBy: $("presentedBy"),
  controlsHint: $("controlsHint"),
  hudHint: $("hudHint"),
  announcer: $("announcer"),
  boot: $("boot"),
  fatal: $("fatal"),
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let runSponsor = pickSponsor();
let touchStart = null;
let toastTimer = 0;
let chipTimer = 0;
let hintTimer = 0;
let lastScore = 0;
let lastCombo = 1;
let lastFormId = "slim";
let scoreAnim = 0;
let activeScreen = "title";
let lastRunScore = 0;
let lastRunStats = { score: 0, distance: 0, combo: 1, isBest: false };
let started = false;

function currentShareStats() {
  const score = lastRunStats.score || lastRunScore || (typeof game !== "undefined" && game?.snapshot ? game.snapshot().score : 0);
  return { ...lastRunStats, score };
}

function syncShareLinks(stats = currentShareStats()) {
  lastRunStats = { ...stats };
  lastRunScore = stats.score;
  if (els.sharePrompt) {
    els.sharePrompt.textContent = stats.isBest
      ? "New best — dare someone to top it"
      : "Challenge a friend to beat your run";
  }
  if (els.shareBtnLabel) {
    els.shareBtnLabel.textContent = stats.isBest ? "Share your best" : "Share score";
  }
  if (els.twitterShare) els.twitterShare.href = shareScore.twitterUrl(stats);
  if (els.whatsappShare) els.whatsappShare.href = shareScore.whatsappUrl(stats);
  if (els.shareBtn) {
    els.shareBtn.classList.toggle("is-hot", !!stats.isBest && stats.score > 0);
  }
}

async function doNativeShare() {
  const stats = currentShareStats();
  const result = await shareScore.native(stats);
  if (result.ok) {
    toast("Shared — go viral");
    announce("Score shared.");
    return;
  }
  if (result.reason === "abort") return;
  // Fallback to copy when native share missing or fails
  const copied = await shareScore.copy(stats);
  toast(copied.ok ? "Challenge copied — paste anywhere" : "Couldn't share");
}

async function doCopyShare() {
  const result = await shareScore.copy(currentShareStats());
  toast(result.ok ? "Challenge copied — paste anywhere" : "Couldn't copy");
}

function announce(msg) {
  if (!els.announcer) return;
  els.announcer.textContent = "";
  requestAnimationFrame(() => {
    els.announcer.textContent = msg;
  });
}

function setHidden(el, hide) {
  if (!el) return;
  el.classList.toggle("is-hidden", hide);
  el.toggleAttribute("hidden", hide);
  el.setAttribute("aria-hidden", hide ? "true" : "false");
}

function setScreen(name) {
  const screens = [
    ["title", els.titleScreen],
    ["how", els.howScreen],
    ["over", els.overScreen],
  ];

  for (const [key, node] of screens) {
    if (!node) continue;
    const on = key === name;
    node.classList.toggle("is-active", on);
    node.toggleAttribute("hidden", !on);
    node.setAttribute("aria-hidden", on ? "false" : "true");
    if ("inert" in node) node.inert = !on;
  }

  activeScreen = name;

  const focusFor = {
    title: els.playBtn,
    how: els.howPlayBtn,
    over: els.retryBtn,
  };

  const focusEl = focusFor[name];
  if (focusEl) {
    requestAnimationFrame(() => focusEl.focus({ preventScroll: true }));
  } else if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function refreshTitleStats() {
  const data = storage.get();
  els.bestVal.textContent = data.best.toLocaleString();
  els.runsVal.textContent = data.runs.toLocaleString();
  if (els.overBestVal) els.overBestVal.textContent = data.best.toLocaleString();
}

function setSponsorUI(sponsor) {
  runSponsor = sponsor;
  els.titleSponsorName.textContent = sponsor.name;
  els.overSponsorName.textContent = sponsor.name;
  els.sponsorChipName.textContent = sponsor.name;
  els.presentedBy.textContent = `${sponsor.name} · Night market`;
}

function toast(msg) {
  els.toast.textContent = msg;
  setHidden(els.toast, false);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setHidden(els.toast, true), 1700);
}

function pop(el, cls = "is-pop") {
  if (!el || reducedMotion) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function updateFormPips(formId) {
  const pips = els.formTrack?.querySelectorAll(".form-pip") || [];
  pips.forEach((pip) => {
    pip.classList.toggle("is-active", pip.dataset.form === formId);
  });
}

function updateHud(snap, { force = false } = {}) {
  els.scoreVal.textContent = snap.score.toLocaleString();
  els.comboVal.textContent = `×${snap.combo}`;
  els.morphVal.textContent = snap.form.label;

  if (!force && snap.score > lastScore) pop(els.scoreVal);
  if (!force && snap.combo > lastCombo) pop(els.comboVal, "is-combo-hot");
  if (snap.form.id !== lastFormId) {
    updateFormPips(snap.form.id);
    pop(els.morphVal);
  }

  lastScore = snap.score;
  lastCombo = snap.combo;
  lastFormId = snap.form.id;
}

function animateScore(target) {
  cancelAnimationFrame(scoreAnim);
  if (reducedMotion) {
    els.finalScore.textContent = target.toLocaleString();
    return;
  }

  const start = performance.now();
  const duration = Math.min(900, 320 + Math.min(target, 4000) * 0.12);

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    els.finalScore.textContent = Math.floor(target * eased).toLocaleString();
    els.finalScore.classList.add("is-ticking");
    if (t < 1) scoreAnim = requestAnimationFrame(tick);
    else els.finalScore.classList.remove("is-ticking");
  };

  scoreAnim = requestAnimationFrame(tick);
}

function showSponsorChip() {
  els.sponsorChip.classList.remove("is-fading");
  setHidden(els.sponsorChip, false);
  clearTimeout(chipTimer);
  chipTimer = setTimeout(() => {
    els.sponsorChip.classList.add("is-fading");
    setTimeout(() => {
      if (game.state === "playing") setHidden(els.sponsorChip, true);
    }, 480);
  }, 3200);
}

function showHudHint() {
  els.hudHint?.classList.remove("is-faded");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => els.hudHint?.classList.add("is-faded"), 4200);
}

function syncControlsHint() {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  if (coarse && !fine) {
    els.controlsHint.textContent = "Tap to morph · Swipe left or right for lanes";
    if (els.hudHint) els.hudHint.textContent = "Tap to morph · Swipe to lane";
  } else {
    els.controlsHint.textContent = "Space to morph · ← → or A D for lanes";
    if (els.hudHint) els.hudHint.textContent = "Space morph · ← → lanes";
  }
}

/** Scale the wide Syne wordmark so it never clips the viewport. */
function fitBrand() {
  const text = document.querySelector(".brand-text");
  const wrap = document.querySelector(".title-wrap");
  if (!text || !wrap) return;

  text.style.transform = "scale(1)";
  const avail = Math.max(0, wrap.clientWidth - 8);
  const need = text.scrollWidth;
  if (!avail || !need) return;

  const scale = need > avail ? avail / need : 1;
  text.style.transform = `scale(${scale})`;
}

function applyMute(muted, { persist = true } = {}) {
  game.audio.muted = muted;
  els.muteBtn.classList.toggle("is-muted", muted);
  els.muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  els.muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  els.muteBtn.title = muted ? "Unmute" : "Mute";
  if (persist) storage.setMuted(muted);
}

function goTitle() {
  game.setPaused(false);
  setHidden(els.hud, true);
  setHidden(els.sponsorChip, true);
  setHidden(els.toast, true);
  setScreen("title");
  setSponsorUI(pickSponsor(Date.now() + SPONSORS.length));
  refreshTitleStats();
  game.state = "idle";
  announce("Title screen. Enter the night to play.");
  requestAnimationFrame(() => fitBrand());
}

function beginPlay() {
  setScreen("none");
  setHidden(els.hud, false);
  setHidden(els.toast, true);
  setSponsorUI(pickSponsor(Date.now()));
  game.setPaused(false);
  game.audio.resume();
  game.start(runSponsor);
  started = true;
  lastScore = 0;
  lastCombo = 1;
  lastRunScore = 0;
  updateHud(game.snapshot(), { force: true });
  updateFormPips(game.snapshot().form.id);
  showSponsorChip();
  showHudHint();
  announce("Run started. Morph to match gates. Avoid light beams.");
}

function onPlayRequest() {
  game.audio.resume();
  const data = storage.get();
  if (!data.seenHow) {
    setScreen("how");
    announce("How to survive. Review controls, then press I'm ready.");
    return;
  }
  beginPlay();
}

function showFatal(message) {
  if (!els.fatal) return;
  els.fatal.textContent = message;
  setHidden(els.fatal, false);
  setHidden(els.boot, true);
}

const game = new Game(els.canvas, {
  onError: showFatal,
  onStart(snap) {
    updateHud(snap, { force: true });
  },
  onTick(snap) {
    els.scoreVal.textContent = snap.score.toLocaleString();
    lastScore = snap.score;
    if (snap.combo !== lastCombo) {
      els.comboVal.textContent = `×${snap.combo}`;
      lastCombo = snap.combo;
    }
  },
  onMorph(snap) {
    updateHud(snap);
  },
  onScore(snap) {
    updateHud(snap);
  },
  onCombo(snap) {
    updateHud(snap);
    if (snap.combo >= 4) toast(`Combo ×${snap.combo}`);
  },
  onGameOver(snap) {
    updateHud(snap, { force: true });
    const prevBest = storage.get().best;
    storage.addRun(snap.score, snap.distance);
    const data = storage.get();
    const isNew = snap.score > prevBest && snap.score > 0;
    lastRunScore = snap.score;
    syncShareLinks({
      score: snap.score,
      distance: snap.distance,
      combo: snap.maxCombo,
      isBest: isNew || snap.score >= data.best,
    });

    animateScore(snap.score);
    els.finalDist.textContent = snap.distance.toLocaleString();
    els.finalCombo.textContent = `×${snap.maxCombo}`;
    els.overBestVal.textContent = data.best.toLocaleString();
    els.overSponsorName.textContent = snap.sponsor.name;
    setHidden(els.newBest, !isNew);

    setHidden(els.hud, true);
    setHidden(els.sponsorChip, true);
    setScreen("over");
    refreshTitleStats();
    announce(
      isNew
        ? `New personal best ${snap.score}. Run again or share your score.`
        : `Score ${snap.score}. Run again or return to menu.`
    );
  },
});

if (!game.ok) {
  showFatal("SHADOWKO needs a modern browser with canvas support.");
} else {
  game.setReducedMotion(reducedMotion);
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", (e) => {
    game.setReducedMotion(e.matches);
  });
}

els.playBtn.addEventListener("click", onPlayRequest);
els.howPlayBtn.addEventListener("click", () => {
  storage.markHowSeen();
  beginPlay();
});
els.retryBtn.addEventListener("click", beginPlay);
els.menuBtn.addEventListener("click", goTitle);

els.muteBtn.addEventListener("click", () => {
  game.audio.resume();
  applyMute(!game.audio.muted);
  toast(game.audio.muted ? "Sound off" : "Sound on");
});

els.shareBtn.addEventListener("click", () => {
  doNativeShare();
});

els.copyScoreBtn?.addEventListener("click", () => {
  doCopyShare();
});

els.twitterShare?.addEventListener("click", () => {
  syncShareLinks(currentShareStats());
});

els.whatsappShare?.addEventListener("click", () => {
  syncShareLinks(currentShareStats());
});

function isUiTarget(t) {
  return (
    t instanceof HTMLElement &&
    (t.closest("button") || t.closest(".panel") || t.closest(".screen.is-active") || t.closest("#fatal"))
  );
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  const tag = document.activeElement?.tagName;
  const onControl = tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA";

  if (e.code === "Escape") {
    if (activeScreen === "over" || activeScreen === "how") {
      e.preventDefault();
      goTitle();
    }
    return;
  }

  if (e.code === "KeyM" && !onControl) {
    applyMute(!game.audio.muted);
    toast(game.audio.muted ? "Sound off" : "Sound on");
    return;
  }

  if (onControl && (e.code === "Space" || e.code === "Enter")) return;

  if (e.code === "Space" || e.code === "KeyW" || e.code === "ArrowUp" || e.code === "Enter") {
    if (e.code === "Space" || e.code === "ArrowUp") e.preventDefault();

    if (game.state === "playing") {
      if (e.code === "Enter") return;
      if (game.paused) return;
      game.morph();
      return;
    }
    if (activeScreen === "title") onPlayRequest();
    else if (activeScreen === "how") {
      storage.markHowSeen();
      beginPlay();
    } else if (activeScreen === "over") beginPlay();
  }

  if (game.state === "playing" && !game.paused) {
    if (e.code === "ArrowLeft" || e.code === "KeyA") game.shiftLane(-1);
    if (e.code === "ArrowRight" || e.code === "KeyD") game.shiftLane(1);
  }
});

els.canvas.addEventListener(
  "pointerdown",
  (e) => {
    if (game.state !== "playing" || game.paused) return;
    if (isUiTarget(e.target)) return;
    if (e.isPrimary === false) return;
    touchStart = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    try {
      els.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  },
  { passive: true }
);

els.canvas.addEventListener(
  "pointerup",
  (e) => {
    if (game.state !== "playing" || game.paused || !touchStart) return;
    if (touchStart.id != null && e.pointerId !== touchStart.id) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    const dt = performance.now() - touchStart.t;
    touchStart = null;
    try {
      els.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.1) {
      game.shiftLane(dx < 0 ? -1 : 1);
      return;
    }
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22 && dt < 400) {
      game.morph();
    }
  },
  { passive: true }
);

els.canvas.addEventListener(
  "pointercancel",
  () => {
    touchStart = null;
  },
  { passive: true }
);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (game.state === "playing") game.setPaused(true);
  } else if (game.state === "playing" && game.paused) {
    game.setPaused(false);
    toast("Back in the night");
  }
});

window.addEventListener("resize", () => {
  syncControlsHint();
  fitBrand();
});
syncControlsHint();
fitBrand();

if (document.fonts?.ready) {
  document.fonts.ready.then(() => fitBrand()).catch(() => {});
}

const prefs = storage.get();
let muted = prefs.muted;
try {
  if (localStorage.getItem("shadowko_muted") === "1") {
    muted = true;
    storage.setMuted(true);
    localStorage.removeItem("shadowko_muted");
  }
} catch {
  /* ignore */
}
applyMute(muted, { persist: false });
setSponsorUI(runSponsor);
refreshTitleStats();
updateFormPips("slim");
syncShareLinks({ score: storage.get().best, distance: 0, combo: 1, isBest: false });
goTitle();

async function finishBoot() {
  try {
    if (document.fonts?.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]);
  } catch {
    /* ignore */
  }
  document.body.classList.add("is-ready");
  setHidden(els.boot, true);
  requestAnimationFrame(() => fitBrand());
}

finishBoot();
void started;
