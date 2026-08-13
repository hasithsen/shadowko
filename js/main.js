import { Game } from "./game.js";
import { storage } from "./storage.js";
import { pickSponsor, SPONSORS, SPONSOR_INQUIRY_URL } from "./sponsors.js";
import { shareScore } from "./share.js";

const $ = (id) => document.getElementById(id);

const els = {
  canvas: $("game"),
  hud: $("hud"),
  hudDock: $("hudDock"),
  hudBottom: $("hudBottom"),
  scoreVal: $("scoreVal"),
  comboVal: $("comboVal"),
  morphVal: $("morphVal"),
  formTrack: $("formTrack"),
  titleScreen: $("titleScreen"),
  howScreen: $("howScreen"),
  overScreen: $("overScreen"),
  playBtn: $("playBtn"),
  helpBtn: $("helpBtn"),
  howPlayBtn: $("howPlayBtn"),
  howBackBtn: $("howBackBtn"),
  howKicker: $("howKicker"),
  howTitle: $("howTitle"),
  retryBtn: $("retryBtn"),
  shareBtn: $("shareBtn"),
  shareBtnLabel: $("shareBtnLabel"),
  sharePrompt: $("sharePrompt"),
  copyScoreBtn: $("copyScoreBtn"),
  twitterShare: $("twitterShare"),
  whatsappShare: $("whatsappShare"),
  menuBtn: $("menuBtn"),
  muteBtn: $("muteBtn"),
  pauseBtn: $("pauseBtn"),
  pauseOverlay: $("pauseOverlay"),
  resumeBtn: $("resumeBtn"),
  pauseMenuBtn: $("pauseMenuBtn"),
  pauseHint: $("pauseHint"),
  touchPad: $("touchPad"),
  bestVal: $("bestVal"),
  runsVal: $("runsVal"),
  finalScore: $("finalScore"),
  finalDist: $("finalDist"),
  finalCombo: $("finalCombo"),
  overBestVal: $("overBestVal"),
  newBest: $("newBest"),
  titleSponsorName: $("titleSponsorName"),
  titleSponsorKicker: $("titleSponsorKicker"),
  titleSponsorTag: $("titleSponsorTag"),
  overSponsorName: $("overSponsorName"),
  overSponsorKicker: $("overSponsorKicker"),
  overSponsorTag: $("overSponsorTag"),
  sponsorChip: $("sponsorChip"),
  sponsorChipName: $("sponsorChipName"),
  sponsorChipKicker: $("sponsorChipKicker"),
  titleSponsor: $("titleSponsor"),
  overSponsor: $("overSponsor"),
  toast: $("toast"),
  presentedBy: $("presentedBy"),
  controlsHint: $("controlsHint"),
  hudHint: $("hudHint"),
  howMorphHint: $("howMorphHint"),
  howLaneHint: $("howLaneHint"),
  announcer: $("announcer"),
  boot: $("boot"),
  fatal: $("fatal"),
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarseMq = window.matchMedia("(pointer: coarse)");
const fineMq = window.matchMedia("(pointer: fine)");
const hoverMq = window.matchMedia("(hover: hover)");

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
let userPaused = false;
let hapticsOk = true;
let howFromMenu = false;

function prefersTouchControls() {
  // Phones / tablets: coarse pointer, or touch without fine hover (many convertibles)
  return coarseMq.matches || ("ontouchstart" in window && !hoverMq.matches);
}

function isTouchPrimary() {
  return coarseMq.matches || ("ontouchstart" in window && !hoverMq.matches);
}

function haptic(ms = 12) {
  if (!hapticsOk || reducedMotion || !navigator.vibrate) return;
  try {
    navigator.vibrate(ms);
  } catch {
    hapticsOk = false;
  }
}

function currentShareStats() {
  const score =
    lastRunStats.score || lastRunScore || (typeof game !== "undefined" && game?.snapshot ? game.snapshot().score : 0);
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
  const kicker = sponsor.kicker || "Open for sponsors";
  const tag = sponsor.tagline || "Put your brand on SHADOWKO";

  els.titleSponsorName.textContent = sponsor.name;
  els.overSponsorName.textContent = sponsor.name;
  els.sponsorChipName.textContent = sponsor.name;
  if (els.titleSponsorKicker) els.titleSponsorKicker.textContent = kicker;
  if (els.overSponsorKicker) els.overSponsorKicker.textContent = "This placement could be yours";
  if (els.sponsorChipKicker) els.sponsorChipKicker.textContent = kicker;
  if (els.titleSponsorTag) els.titleSponsorTag.textContent = tag;
  if (els.overSponsorTag) els.overSponsorTag.textContent = tag;
  els.presentedBy.textContent = "Open for brand partners";

  if (els.titleSponsor?.tagName === "A") els.titleSponsor.href = SPONSOR_INQUIRY_URL;
  if (els.overSponsor?.tagName === "A") els.overSponsor.href = SPONSOR_INQUIRY_URL;
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
    const on = pip.dataset.form === formId;
    pip.classList.toggle("is-active", on);
    pip.setAttribute("aria-pressed", on ? "true" : "false");
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
  const touch = isTouchPrimary();
  const hybrid = coarseMq.matches && fineMq.matches;

  if (touch || hybrid) {
    els.controlsHint.textContent = hybrid
      ? "Tap or Space to morph · Swipe / ← → for lanes"
      : "Tap Morph · Swipe or use the lane pads";
    if (els.hudHint) {
      els.hudHint.textContent = hybrid ? "Tap / Space · Swipe or ← →" : "Morph button · Swipe lanes";
    }
    if (els.howMorphHint) els.howMorphHint.textContent = "Tap Morph (or Space) to cycle Slim, Wide, Orb";
    if (els.howLaneHint) els.howLaneHint.textContent = "Swipe or tap ‹ › to slip past light";
    game.setPauseHint("Tap Continue or press Space");
    if (els.pauseHint) els.pauseHint.textContent = "Run paused — continue when ready";
  } else {
    els.controlsHint.textContent = "Space to morph · ← → or A D for lanes";
    if (els.hudHint) els.hudHint.textContent = "Space morph · ← → lanes · Esc pause";
    if (els.howMorphHint) els.howMorphHint.textContent = "Press Space / W to cycle Slim, Wide, Orb";
    if (els.howLaneHint) els.howLaneHint.textContent = "Use ← → or A D to slip past light";
    game.setPauseHint("Press Space or click Continue");
    if (els.pauseHint) els.pauseHint.textContent = "Space / P to continue · Esc for menu";
  }
}

function syncTouchPadVisibility() {
  const show = prefersTouchControls() && game.state === "playing" && !game.paused;
  // Keep pad mounted during pause so dock height stays stable, but disable hits
  const mount = prefersTouchControls() && game.state === "playing";
  document.body.classList.toggle("has-touch-pad", mount);
  setHidden(els.touchPad, !mount);
  if (els.touchPad) {
    els.touchPad.toggleAttribute("inert", !show);
    els.touchPad.style.pointerEvents = show ? "auto" : "none";
    els.touchPad.style.opacity = show ? "" : mount ? "0.35" : "";
  }
  if (els.pauseBtn) {
    const pauseVisible = game.state === "playing";
    els.pauseBtn.hidden = !pauseVisible;
    els.pauseBtn.toggleAttribute("hidden", !pauseVisible);
  }
  measureDock();
}

function measureDock() {
  if (!game?.ok) return;
  const bottom = els.hudBottom || els.hudDock;
  let reserve = 0;
  if (bottom && !els.hud?.classList.contains("is-hidden")) {
    const r = bottom.getBoundingClientRect();
    if (r.height > 0) reserve = Math.max(reserve, window.innerHeight - r.top + 14);
  }
  // Always leave room for home indicator / chrome
  reserve = Math.max(reserve, Math.min(130, window.innerHeight * 0.16));
  game.setDockReserve(reserve);
}

function configureHowScreen({ fromMenu = false } = {}) {
  howFromMenu = !!fromMenu;
  if (els.howKicker) els.howKicker.textContent = fromMenu ? "Controls" : "First run";
  if (els.howTitle) els.howTitle.textContent = fromMenu ? "How to play" : "How to survive";
  if (els.howPlayBtn) {
    els.howPlayBtn.textContent = fromMenu ? "Enter the night" : "I'm ready";
  }
  setHidden(els.howBackBtn, !fromMenu);
}

function openHowFromMenu() {
  configureHowScreen({ fromMenu: true });
  setScreen("how");
  announce("How to play. Review controls, then play or go back.");
  requestAnimationFrame(() => els.howBackBtn?.focus({ preventScroll: true }));
}

function openHowFirstRun() {
  configureHowScreen({ fromMenu: false });
  setScreen("how");
  announce("How to survive. Review controls, then press I'm ready.");
}

/** Scale the wide Syne wordmark so it never clips the viewport. */
function fitBrand() {
  const text = document.querySelector(".brand-text");
  const wrap = document.querySelector(".title-wrap");
  if (!text || !wrap) return;

  text.style.transform = "scale(1)";
  const sidePad = window.matchMedia("(max-width: 720px)").matches ? 24 : 8;
  const avail = Math.max(0, wrap.clientWidth - sidePad);
  const need = text.scrollWidth;
  if (!avail || !need) return;

  const scale = Math.min(1, avail / need);
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

function setPauseUI(paused, { fromSystem = false } = {}) {
  if (paused) {
    game.setPaused(true);
    setHidden(els.pauseOverlay, false);
    syncTouchPadVisibility();
    if (els.resumeBtn) {
      requestAnimationFrame(() => els.resumeBtn.focus({ preventScroll: true }));
    }
    announce(fromSystem ? "Game paused. Continue when ready." : "Paused.");
  } else {
    userPaused = false;
    game.setPaused(false);
    setHidden(els.pauseOverlay, true);
    game.resize();
    measureDock();
    syncTouchPadVisibility();
  }
}

function pauseGame({ fromSystem = false } = {}) {
  if (game.state !== "playing" || game.paused) return;
  userPaused = !fromSystem;
  setPauseUI(true, { fromSystem });
}

function resumeGame() {
  if (game.state !== "playing" || !game.paused) return;
  game.audio.resume();
  setPauseUI(false);
  toast("Back in the night");
  announce("Run resumed.");
}

function goTitle() {
  userPaused = false;
  game.setPaused(false);
  setHidden(els.pauseOverlay, true);
  setHidden(els.hud, true);
  setHidden(els.sponsorChip, true);
  setHidden(els.toast, true);
  setHidden(els.touchPad, true);
  document.body.classList.remove("has-touch-pad");
  if (els.pauseBtn) {
    els.pauseBtn.hidden = true;
    els.pauseBtn.toggleAttribute("hidden", true);
  }
  setScreen("title");
  setSponsorUI(pickSponsor(Date.now() + SPONSORS.length));
  refreshTitleStats();
  game.state = "idle";
  measureDock();
  announce("Title screen. Enter the night to play.");
  requestAnimationFrame(() => fitBrand());
}

function beginPlay() {
  userPaused = false;
  setScreen("none");
  setHidden(els.hud, false);
  setHidden(els.toast, true);
  setHidden(els.pauseOverlay, true);
  setSponsorUI(pickSponsor(Date.now()));
  game.setPaused(false);
  game.audio.resume();
  game.start(runSponsor);
  lastScore = 0;
  lastCombo = 1;
  lastRunScore = 0;
  updateHud(game.snapshot(), { force: true });
  updateFormPips(game.snapshot().form.id);
  syncTouchPadVisibility();
  requestAnimationFrame(() => {
    measureDock();
    game.resize();
  });
  showSponsorChip();
  showHudHint();
  announce("Run started. Morph to match gates. Avoid light beams.");
}

function onPlayRequest() {
  game.audio.resume();
  const data = storage.get();
  if (!data.seenHow) {
    openHowFirstRun();
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
    haptic(10);
  },
  onLane() {
    haptic(8);
  },
  onScore(snap) {
    updateHud(snap);
  },
  onCombo(snap) {
    updateHud(snap);
    if (snap.combo >= 4) toast(`Combo ×${snap.combo}`);
    haptic([8, 30, 12]);
  },
  onGameOver(snap) {
    haptic([30, 40, 50]);
    userPaused = false;
    setHidden(els.pauseOverlay, true);
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
    if (els.overSponsorTag) els.overSponsorTag.textContent = snap.sponsor.tagline || "Sponsor SHADOWKO — reach every run";
    if (els.overSponsorKicker) els.overSponsorKicker.textContent = "This placement could be yours";
    setHidden(els.newBest, !isNew);

    setHidden(els.hud, true);
    setHidden(els.sponsorChip, true);
    setHidden(els.touchPad, true);
    document.body.classList.remove("has-touch-pad");
    if (els.pauseBtn) {
      els.pauseBtn.hidden = true;
      els.pauseBtn.toggleAttribute("hidden", true);
    }
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
els.helpBtn?.addEventListener("click", () => {
  openHowFromMenu();
});
els.howPlayBtn.addEventListener("click", () => {
  storage.markHowSeen();
  beginPlay();
});
els.howBackBtn?.addEventListener("click", () => {
  howFromMenu = false;
  goTitle();
});
els.retryBtn.addEventListener("click", beginPlay);
els.menuBtn.addEventListener("click", goTitle);

els.muteBtn.addEventListener("click", () => {
  game.audio.resume();
  applyMute(!game.audio.muted);
  toast(game.audio.muted ? "Sound off" : "Sound on");
});

els.pauseBtn?.addEventListener("click", () => {
  if (game.state === "playing" && !game.paused) pauseGame();
});

els.resumeBtn?.addEventListener("click", () => {
  resumeGame();
});

els.pauseMenuBtn?.addEventListener("click", () => {
  goTitle();
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

els.formTrack?.addEventListener("click", (e) => {
  const pip = e.target.closest?.(".form-pip");
  if (!pip || game.state !== "playing" || game.paused) return;
  e.preventDefault();
  game.morph(pip.dataset.form);
});

els.touchPad?.addEventListener("pointerdown", (e) => {
  const btn = e.target.closest?.(".touch-btn");
  if (!btn || game.state !== "playing" || game.paused) return;
  e.preventDefault();
  e.stopPropagation();
  const lane = btn.dataset.lane;
  if (lane != null) {
    game.shiftLane(Number(lane));
    return;
  }
  if (btn.dataset.morph) game.morph();
});

function isUiTarget(t) {
  return (
    t instanceof HTMLElement &&
    (t.closest("button") ||
      t.closest("a") ||
      t.closest(".panel") ||
      t.closest(".screen.is-active") ||
      t.closest("#pauseOverlay") ||
      t.closest("#touchPad") ||
      t.closest("#fatal") ||
      t.closest("#boot"))
  );
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  const tag = document.activeElement?.tagName;
  const onControl = tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA";

  if (e.code === "Escape") {
    e.preventDefault();
    if (game.state === "playing") {
      if (game.paused) {
        // Second Esc from pause returns to title
        goTitle();
      } else {
        pauseGame();
      }
      return;
    }
    if (activeScreen === "over" || activeScreen === "how") goTitle();
    return;
  }

  if (e.code === "KeyP" && !onControl && game.state === "playing") {
    e.preventDefault();
    if (game.paused) resumeGame();
    else pauseGame();
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
      if (game.paused) {
        resumeGame();
        return;
      }
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

function swipeThreshold() {
  return Math.max(24, Math.min(52, window.innerWidth * 0.065));
}

function onPlayPointerDown(e) {
  if (game.state !== "playing") return;
  if (game.paused) {
    // Tap anywhere (non-UI) resumes — mobile-friendly
    if (!isUiTarget(e.target)) resumeGame();
    return;
  }
  if (isUiTarget(e.target)) return;
  if (e.isPrimary === false) return;
  // Mouse on fine pointers: only left button; avoid accidental lane drags from hover tools
  if (e.pointerType === "mouse" && e.button !== 0) return;
  touchStart = {
    x: e.clientX,
    y: e.clientY,
    t: performance.now(),
    id: e.pointerId,
    type: e.pointerType || "unknown",
  };
  try {
    e.currentTarget.setPointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }
}

function onPlayPointerUp(e) {
  if (game.state !== "playing" || game.paused || !touchStart) return;
  if (touchStart.id != null && e.pointerId !== touchStart.id) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  const dt = performance.now() - touchStart.t;
  const pointerType = touchStart.type;
  touchStart = null;
  try {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }

  const swipe = swipeThreshold();
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  // Prefer clear horizontal intent; ignore mushy diagonals
  if (absX > swipe && absX > absY * 1.2) {
    game.shiftLane(dx < 0 ? -1 : 1);
    return;
  }

  // Desktop mouse: click = morph; require near-stationary click (no drag morph)
  if (pointerType === "mouse") {
    if (absX < 10 && absY < 10 && dt < 400) game.morph();
    return;
  }

  // Touch / pen: tap / light flick = morph
  if (absX < swipe * 0.75 && absY < swipe * 0.75 && dt < 420) {
    game.morph();
  }
}

const playSurface = document.getElementById("app") || els.canvas;
playSurface.addEventListener("pointerdown", onPlayPointerDown, { passive: true });
playSurface.addEventListener("pointerup", onPlayPointerUp, { passive: true });
playSurface.addEventListener(
  "pointercancel",
  () => {
    touchStart = null;
  },
  { passive: true }
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (game.state !== "playing") return;
    if (isUiTarget(e.target)) return;
    e.preventDefault();
  },
  { passive: false }
);

document.addEventListener("contextmenu", (e) => {
  if (game.state === "playing") e.preventDefault();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (game.state === "playing" && !game.paused) {
      pauseGame({ fromSystem: true });
    }
  }
  // Do not auto-resume — player taps Continue (safer mid-obstacle on phones)
});

function onViewportChange() {
  syncControlsHint();
  syncTouchPadVisibility();
  fitBrand();
  game.resize();
  measureDock();
}

window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", () => {
  setTimeout(onViewportChange, 120);
  setTimeout(onViewportChange, 360);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewportChange);
  window.visualViewport.addEventListener("scroll", onViewportChange);
}

coarseMq.addEventListener?.("change", onViewportChange);
fineMq.addEventListener?.("change", onViewportChange);

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
  requestAnimationFrame(() => {
    fitBrand();
    measureDock();
  });
}

finishBoot();
