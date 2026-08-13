import { Game } from "./game.js";
import { storage } from "./storage.js";
import {
  pickSponsor,
  SPONSORS,
  sponsorHref,
  isLiveSponsor,
  normalizeSponsor,
} from "./sponsors.js";
import { shareScore, readChallengeFromUrl } from "./share.js";
import { analytics } from "./analytics.js";

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
  howPlayLabel: $("howPlayLabel"),
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
  pauseHelpBtn: $("pauseHelpBtn"),
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
  challengeBanner: $("challengeBanner"),
  challengeTargetEl: $("challengeTarget"),
  challengeClear: $("challengeClear"),
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

// Non-blocking font stylesheet (CSP-safe — no inline onload)
{
  const fontLink = document.getElementById("fontStyles");
  if (fontLink) fontLink.media = "all";
}

/** iPhone / iPod / iPad (incl. iPadOS desktop UA). */
function isAppleTouchDevice() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPod|iPad/.test(ua)) return true;
  // iPadOS 13+ can report as Macintosh with touch
  return navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
}

const appleTouch = isAppleTouchDevice();

let runSponsor = pickSponsor();
/** Active play gesture — never drop mid-swipe on iOS (pointercancel). */
let gesture = null;
/** Ignore synthetic mouse/pointer after a touch gesture (iOS ghost clicks). */
let ignorePointerUntil = 0;
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
let viewportTimer = 0;
let challengeTarget = 0;
let impressedSponsors = new Set();

function prefersTouchControls() {
  // Always show on-screen pad on Apple touch devices — Safari media queries can lie with keyboards
  if (appleTouch || ((navigator.maxTouchPoints || 0) > 0 && !hoverMq.matches)) return true;
  return coarseMq.matches || ("ontouchstart" in window && !hoverMq.matches);
}

function isTouchPrimary() {
  return prefersTouchControls();
}

function safeFocus(el) {
  // Programmatic focus scrolls / zooms the visual viewport on iOS Safari
  if (!el || isTouchPrimary()) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      /* ignore */
    }
  }
}

function haptic(ms = 12) {
  if (!hapticsOk || reducedMotion || !navigator.vibrate) return;
  try {
    navigator.vibrate(ms);
  } catch {
    hapticsOk = false;
  }
}

function applySponsorTheme(sponsor) {
  const s = normalizeSponsor(sponsor);
  const root = document.documentElement;
  root.style.setProperty("--sponsor", s.color);
  root.style.setProperty("--sponsor-accent", s.accent);
  root.style.setProperty("--sponsor-glow", `0 0 0 1px ${s.color}40, 0 10px 40px ${s.color}48`);
  document.body.classList.toggle("has-live-sponsor", !!s.live);
}

function wireSponsorLink(el, sponsor, placement) {
  if (!el || el.tagName !== "A") return;
  const href = sponsorHref(sponsor, { placement });
  el.href = href;
  const live = isLiveSponsor(sponsor);
  if (live && sponsor.ctaUrl) {
    el.target = "_blank";
    el.rel = "noopener noreferrer sponsored";
  } else {
    el.removeAttribute("target");
    el.rel = "noopener";
  }
  el.dataset.sponsorId = sponsor.id || "";
  el.dataset.placement = placement;
}

function setSponsorUI(sponsor) {
  const s = normalizeSponsor(sponsor);
  runSponsor = s;
  applySponsorTheme(s);

  const kicker = s.kicker;
  const tag = s.tagline;
  const eyebrow = s.live ? s.presentedBy : "Open for brand partners";
  const overKicker = s.live ? s.presentedBy || "Presented by" : "This placement could be yours";

  els.titleSponsorName.textContent = s.name;
  els.overSponsorName.textContent = s.name;
  els.sponsorChipName.textContent = s.name;
  if (els.titleSponsorKicker) els.titleSponsorKicker.textContent = kicker;
  if (els.overSponsorKicker) els.overSponsorKicker.textContent = overKicker;
  if (els.sponsorChipKicker) els.sponsorChipKicker.textContent = kicker;
  if (els.titleSponsorTag) els.titleSponsorTag.textContent = tag;
  if (els.overSponsorTag) els.overSponsorTag.textContent = tag;
  if (els.presentedBy) els.presentedBy.textContent = eyebrow;

  wireSponsorLink(els.titleSponsor, s, "title_pill");
  wireSponsorLink(els.overSponsor, s, "over_pill");
  wireSponsorLink(els.sponsorChip, s, "hud_chip");

  if (game?.ok) game.sponsor = s;

  const key = `${s.id}:title`;
  if (!impressedSponsors.has(key)) {
    impressedSponsors.add(key);
    analytics.sponsorImpression(s.id, "title");
  }
}

function syncChallengeBanner() {
  const show = challengeTarget > 0 && activeScreen === "title";
  if (els.challengeTargetEl) {
    els.challengeTargetEl.textContent = challengeTarget.toLocaleString();
  }
  setHidden(els.challengeBanner, !show);
  document.body.classList.toggle("has-challenge", challengeTarget > 0);
}

function adoptChallenge(target, { persist = true, announceSeen = true } = {}) {
  const n = Math.max(0, Math.floor(Number(target) || 0));
  challengeTarget = n;
  if (persist) {
    if (n > 0) storage.setChallengeTarget(n);
    else storage.clearChallengeTarget();
  }
  syncChallengeBanner();
  if (n > 0 && announceSeen) {
    analytics.challengeSeen(n);
    announce(`Challenge accepted. Beat ${n.toLocaleString()}.`);
  }
}

function currentShareStats() {
  const score =
    lastRunStats.score || lastRunScore || (typeof game !== "undefined" && game?.snapshot ? game.snapshot().score : 0);
  return {
    ...lastRunStats,
    score,
    sponsorName: isLiveSponsor(runSponsor) ? runSponsor.name : "",
  };
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
    analytics.share("native", stats);
    toast("Shared — go viral");
    announce("Score shared.");
    return;
  }
  if (result.reason === "abort") return;
  const copied = await shareScore.copy(stats);
  if (copied.ok) analytics.share("copy_fallback", stats);
  toast(copied.ok ? "Challenge copied — paste anywhere" : "Couldn't share");
}

async function doCopyShare() {
  const result = await shareScore.copy(currentShareStats());
  if (result.ok) analytics.share("copy", currentShareStats());
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
  syncChallengeBanner();
  syncChromeInert();

  const focusFor = {
    title: els.playBtn,
    how: els.howPlayBtn,
    over: els.retryBtn,
  };

  const focusEl = focusFor[name];
  if (focusEl) {
    requestAnimationFrame(() => safeFocus(focusEl));
  } else if (document.activeElement instanceof HTMLElement && !isTouchPrimary()) {
    document.activeElement.blur();
  }
}

/** Mute stays global; inert it only while a modal screen owns focus. */
function syncChromeInert() {
  const modal = activeScreen === "how" || activeScreen === "over" || !els.pauseOverlay?.classList.contains("is-hidden");
  if (els.muteBtn && "inert" in els.muteBtn) {
    els.muteBtn.inert = modal && activeScreen !== "title";
  }
}

function refreshTitleStats() {
  const data = storage.get();
  els.bestVal.textContent = data.best.toLocaleString();
  els.runsVal.textContent = data.runs.toLocaleString();
  if (els.overBestVal) els.overBestVal.textContent = data.best.toLocaleString();
}

function toast(msg) {
  els.toast.textContent = msg;
  setHidden(els.toast, false);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setHidden(els.toast, true), 1700);
}

let storageWarned = false;
function warnStorageOnce() {
  if (storageWarned) return;
  storageWarned = true;
  toast("Progress can’t be saved in private mode");
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
  game.audio.sponsorReveal?.();
  analytics.sponsorImpression(runSponsor?.id, "hud_chip");
  clearTimeout(chipTimer);
  // Live kits linger longer — inventory pitches stay punchy
  const hold = isLiveSponsor(runSponsor) ? 5200 : 3800;
  chipTimer = setTimeout(() => {
    els.sponsorChip.classList.add("is-fading");
    setTimeout(() => {
      if (game.state === "playing") setHidden(els.sponsorChip, true);
    }, 480);
  }, hold);
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
  const playLabel = fromMenu ? "Enter the night" : "I'm ready";
  if (els.howPlayLabel) els.howPlayLabel.textContent = playLabel;
  else if (els.howPlayBtn) els.howPlayBtn.textContent = playLabel;
  setHidden(els.howBackBtn, !fromMenu);
}

function openHowFromMenu() {
  configureHowScreen({ fromMenu: true });
  setScreen("how");
  announce("How to play. Review controls, then play or go back.");
  // Keep primary CTA focused (setScreen already targets howPlayBtn)
}

function openHowFirstRun() {
  configureHowScreen({ fromMenu: false });
  setScreen("how");
  announce("How to survive. Review controls, then press I'm ready.");
}

/** Leave an in-progress run and open help (from pause). */
function exitRunToHow() {
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
  game.state = "idle";
  measureDock();
  openHowFromMenu();
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
    if (els.pauseOverlay) {
      els.pauseOverlay.setAttribute("aria-hidden", "false");
      if ("inert" in els.pauseOverlay) els.pauseOverlay.inert = false;
    }
    syncTouchPadVisibility();
    syncChromeInert();
    if (els.resumeBtn) {
      requestAnimationFrame(() => safeFocus(els.resumeBtn));
    }
    announce(fromSystem ? "Game paused. Continue when ready." : "Paused.");
  } else {
    userPaused = false;
    game.setPaused(false);
    setHidden(els.pauseOverlay, true);
    if (els.pauseOverlay) {
      els.pauseOverlay.setAttribute("aria-hidden", "true");
      if ("inert" in els.pauseOverlay) els.pauseOverlay.inert = true;
    }
    game.resize();
    measureDock();
    syncTouchPadVisibility();
    syncChromeInert();
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
  // Must stay in the user-gesture stack on iOS Safari
  game.audio.resume();
  game.start(runSponsor);
  lastScore = 0;
  lastCombo = 1;
  lastRunScore = 0;
  updateHud(game.snapshot(), { force: true });
  updateFormPips(game.snapshot().form.id);
  syncTouchPadVisibility();
  analytics.playStart(runSponsor?.id);
  // Double-rAF: wait for HUD/layout paint before measuring dock (iOS address bar)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      measureDock();
      game.resize();
      game.layoutPlayer?.();
    });
  });
  showSponsorChip();
  showHudHint();
  if (challengeTarget > 0) {
    toast(`Beat ${challengeTarget.toLocaleString()}`);
  }
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
  // Always reveal the app shell so a fatal isn't stuck behind an opaque boot layer
  document.body.classList.add("is-ready");
  document.body.classList.remove("is-booting");
  setHidden(els.boot, true);
  if (!els.fatal) return;
  els.fatal.textContent = message;
  setHidden(els.fatal, false);
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
    const { data, ok: saved } = storage.addRun(snap.score, snap.distance);
    if (!saved) warnStorageOnce();
    const isNew = snap.score > prevBest && snap.score > 0;
    const beatChallenge = challengeTarget > 0 && snap.score >= challengeTarget;
    lastRunScore = snap.score;
    syncShareLinks({
      score: snap.score,
      distance: snap.distance,
      combo: snap.maxCombo,
      isBest: isNew || snap.score >= data.best,
      sponsorName: isLiveSponsor(snap.sponsor) ? snap.sponsor.name : "",
    });

    animateScore(snap.score);
    els.finalDist.textContent = snap.distance.toLocaleString();
    els.finalCombo.textContent = `×${snap.maxCombo}`;
    els.overBestVal.textContent = data.best.toLocaleString();
    setSponsorUI(snap.sponsor || runSponsor);
    setHidden(els.newBest, !isNew);

    if (isNew || beatChallenge) game.audio.fanfare?.();

    if (beatChallenge) {
      analytics.challengeBeaten(challengeTarget, snap.score);
      toast(`Challenge beaten — ${snap.score.toLocaleString()}`);
      adoptChallenge(0, { announceSeen: false });
    }

    analytics.gameOver({
      score: snap.score,
      distance: snap.distance,
      isBest: isNew,
      sponsorId: snap.sponsor?.id,
    });

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
        : beatChallenge
          ? `Challenge beaten with ${snap.score}. Share it.`
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

// Leave the boot screen as soon as the canvas is up — do not wait on fonts/network/UI wiring
finishBootEarly();

function finishBootEarly() {
  try {
    window.__shadowkoBootClear?.();
  } catch {
    /* ignore */
  }
  document.body.classList.add("is-ready");
  document.body.classList.remove("is-booting");
  const bootEl = document.getElementById("boot");
  if (bootEl) {
    bootEl.classList.add("is-hidden");
    bootEl.setAttribute("hidden", "");
    bootEl.setAttribute("aria-hidden", "true");
  }
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
// iOS: touchend is more reliable than click for starting inside the gesture window
els.playBtn.addEventListener(
  "touchend",
  (e) => {
    if (activeScreen !== "title") return;
    e.preventDefault();
    onPlayRequest();
  },
  { passive: false }
);
els.howPlayBtn.addEventListener(
  "touchend",
  (e) => {
    if (activeScreen !== "how") return;
    e.preventDefault();
    storage.markHowSeen();
    beginPlay();
  },
  { passive: false }
);
els.retryBtn.addEventListener("click", beginPlay);
els.retryBtn.addEventListener(
  "touchend",
  (e) => {
    if (activeScreen !== "over") return;
    e.preventDefault();
    beginPlay();
  },
  { passive: false }
);
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
els.resumeBtn?.addEventListener(
  "touchend",
  (e) => {
    if (game.state !== "playing" || !game.paused) return;
    e.preventDefault();
    resumeGame();
  },
  { passive: false }
);

els.pauseMenuBtn?.addEventListener("click", () => {
  goTitle();
});

els.pauseHelpBtn?.addEventListener("click", () => {
  exitRunToHow();
});

els.shareBtn.addEventListener("click", () => {
  doNativeShare();
});

els.copyScoreBtn?.addEventListener("click", () => {
  doCopyShare();
});

els.twitterShare?.addEventListener("click", () => {
  syncShareLinks(currentShareStats());
  analytics.share("twitter", currentShareStats());
});

els.whatsappShare?.addEventListener("click", () => {
  syncShareLinks(currentShareStats());
  analytics.share("whatsapp", currentShareStats());
});

function onSponsorAnchorClick(e) {
  const a = e.currentTarget;
  if (!(a instanceof HTMLAnchorElement)) return;
  analytics.sponsorClick(a.dataset.sponsorId || runSponsor?.id, a.dataset.placement || "unknown");
}

els.titleSponsor?.addEventListener("click", onSponsorAnchorClick);
els.overSponsor?.addEventListener("click", onSponsorAnchorClick);
els.sponsorChip?.addEventListener("click", onSponsorAnchorClick);

els.challengeClear?.addEventListener("click", () => {
  adoptChallenge(0, { announceSeen: false });
  toast("Challenge cleared");
});

els.formTrack?.addEventListener(
  "pointerdown",
  (e) => {
    if (performance.now() < ignorePointerUntil) return;
    const pip = e.target.closest?.(".form-pip");
    if (!pip || game.state !== "playing" || game.paused) return;
    e.preventDefault();
    e.stopPropagation();
    game.audio.resume();
    game.morph(pip.dataset.form);
  },
  { passive: false }
);

els.formTrack?.addEventListener(
  "touchstart",
  (e) => {
    const pip = e.target.closest?.(".form-pip");
    if (!pip || game.state !== "playing" || game.paused) return;
    e.preventDefault();
    e.stopPropagation();
    ignorePointerUntil = performance.now() + 700;
    game.audio.resume();
    game.morph(pip.dataset.form);
  },
  { passive: false }
);

els.touchPad?.addEventListener(
  "pointerdown",
  (e) => {
    if (performance.now() < ignorePointerUntil) return;
    const btn = e.target.closest?.(".touch-btn");
    if (!btn || game.state !== "playing" || game.paused) return;
    e.preventDefault();
    e.stopPropagation();
    game.audio.resume();
    const lane = btn.dataset.lane;
    if (lane != null) {
      game.shiftLane(Number(lane));
      return;
    }
    if (btn.dataset.morph) game.morph();
  },
  { passive: false }
);

// iOS: touch events are more reliable than pointer for immediate pad hits
els.touchPad?.addEventListener(
  "touchstart",
  (e) => {
    const btn = e.target.closest?.(".touch-btn");
    if (!btn || game.state !== "playing" || game.paused) return;
    e.preventDefault();
    e.stopPropagation();
    ignorePointerUntil = performance.now() + 700;
    game.audio.resume();
    const lane = btn.dataset.lane;
    if (lane != null) {
      game.shiftLane(Number(lane));
      return;
    }
    if (btn.dataset.morph) game.morph();
  },
  { passive: false }
);

function isUiTarget(t) {
  return (
    t instanceof HTMLElement &&
    (t.closest("button") ||
      t.closest("a") ||
      t.closest(".panel") ||
      t.closest(".screen.is-active") ||
      t.closest("#pauseOverlay") ||
      t.closest("#touchPad") ||
      t.closest("#hudBottom") ||
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
  // Slightly lower on phones so lane changes feel crisp
  const base = Math.max(22, Math.min(48, window.innerWidth * 0.055));
  return appleTouch ? Math.min(base, 28) : base;
}

function beginGesture(x, y, id, type) {
  gesture = {
    x,
    y,
    lastX: x,
    lastY: y,
    t: performance.now(),
    id,
    type,
  };
}

function moveGesture(x, y, id) {
  if (!gesture) return;
  if (id != null && gesture.id != null && id !== gesture.id) return;
  gesture.lastX = x;
  gesture.lastY = y;
}

function finishGesture(x, y, type) {
  if (!gesture) return;
  const start = gesture;
  gesture = null;

  if (game.state !== "playing" || game.paused) return;

  const dx = x - start.x;
  const dy = y - start.y;
  const dt = performance.now() - start.t;
  const pointerType = type || start.type;
  const swipe = swipeThreshold();
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  // Prefer clear horizontal intent; ignore mushy diagonals
  if (absX > swipe && absX > absY * 1.15) {
    game.shiftLane(dx < 0 ? -1 : 1);
    return;
  }

  // Desktop mouse: click = morph; require near-stationary click (no drag morph)
  if (pointerType === "mouse") {
    if (absX < 10 && absY < 10 && dt < 400) game.morph();
    return;
  }

  // Touch / pen: tap / light flick = morph
  if (absX < swipe * 0.85 && absY < swipe * 0.85 && dt < 480) {
    game.morph();
  }
}

function onPlayPointerDown(e) {
  if (performance.now() < ignorePointerUntil) return;
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
  // Touch is handled by touch* listeners on Apple / coarse devices (avoids iOS pointercancel)
  if (e.pointerType === "touch" && (appleTouch || prefersTouchControls())) return;

  beginGesture(e.clientX, e.clientY, e.pointerId, e.pointerType || "unknown");
  try {
    e.preventDefault();
  } catch {
    /* ignore */
  }
  // setPointerCapture is flaky on iOS — desktop only
  if (e.pointerType === "mouse" || e.pointerType === "pen") {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }
}

function onPlayPointerMove(e) {
  if (!gesture) return;
  if (gesture.id != null && e.pointerId !== gesture.id) return;
  moveGesture(e.clientX, e.clientY, e.pointerId);
}

function onPlayPointerUp(e) {
  if (!gesture) return;
  if (gesture.id != null && e.pointerId !== gesture.id) return;
  try {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }
  finishGesture(e.clientX, e.clientY, e.pointerType || gesture.type);
}

function onPlayPointerCancel(e) {
  if (!gesture) return;
  if (gesture.id != null && e.pointerId !== gesture.id) return;
  // iOS often cancels mid-swipe — still resolve using last tracked point
  finishGesture(gesture.lastX, gesture.lastY, gesture.type);
}

const playSurface = document.getElementById("app") || els.canvas;

playSurface.addEventListener("pointerdown", onPlayPointerDown, { passive: false });
playSurface.addEventListener("pointermove", onPlayPointerMove, { passive: true });
playSurface.addEventListener("pointerup", onPlayPointerUp, { passive: true });
playSurface.addEventListener("pointercancel", onPlayPointerCancel, { passive: true });

function touchFromEvent(e) {
  return e.changedTouches?.[0] || e.touches?.[0] || null;
}

playSurface.addEventListener(
  "touchstart",
  (e) => {
    if (game.state !== "playing") return;
    if (game.paused) {
      if (!isUiTarget(e.target)) {
        e.preventDefault();
        resumeGame();
      }
      return;
    }
    if (isUiTarget(e.target)) return;
    const t = touchFromEvent(e);
    if (!t) return;
    // Critical on iOS: preventDefault stops scroll + pointercancel killing the gesture
    e.preventDefault();
    ignorePointerUntil = performance.now() + 700;
    game.audio.resume();
    beginGesture(t.clientX, t.clientY, t.identifier, "touch");
  },
  { passive: false }
);

playSurface.addEventListener(
  "touchmove",
  (e) => {
    if (!gesture || game.state !== "playing") return;
    if (isUiTarget(e.target)) return;
    const t = touchFromEvent(e);
    if (!t) return;
    if (gesture.id != null && t.identifier !== gesture.id) return;
    e.preventDefault();
    moveGesture(t.clientX, t.clientY, t.identifier);
  },
  { passive: false }
);

playSurface.addEventListener(
  "touchend",
  (e) => {
    if (!gesture) return;
    const t = touchFromEvent(e);
    if (!t) {
      finishGesture(gesture.lastX, gesture.lastY, "touch");
      return;
    }
    if (gesture.id != null && t.identifier !== gesture.id) return;
    e.preventDefault();
    ignorePointerUntil = performance.now() + 700;
    finishGesture(t.clientX, t.clientY, "touch");
  },
  { passive: false }
);

playSurface.addEventListener(
  "touchcancel",
  () => {
    if (!gesture) return;
    finishGesture(gesture.lastX, gesture.lastY, "touch");
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

// Unlock Web Audio on first user gesture (Safari requires this in the same tick)
function unlockAudioOnce() {
  game.audio.resume();
  window.removeEventListener("touchstart", unlockAudioOnce, true);
  window.removeEventListener("pointerdown", unlockAudioOnce, true);
}
window.addEventListener("touchstart", unlockAudioOnce, { capture: true, passive: true });
window.addEventListener("pointerdown", unlockAudioOnce, { capture: true, passive: true });

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (game.state === "playing" && !game.paused) {
      pauseGame({ fromSystem: true });
    }
  } else {
    // iOS may suspend AudioContext after a call / app switch
    if (game.state === "playing" && !game.paused) game.audio.resume();
  }
});

/** Simple focus trap for modal screens + pause overlay (desktop keyboard). */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || isTouchPrimary()) return;
  const root =
    !els.pauseOverlay?.classList.contains("is-hidden")
      ? els.pauseOverlay
      : activeScreen === "how"
        ? els.howScreen
        : activeScreen === "over"
          ? els.overScreen
          : null;
  if (!root) return;
  const focusables = [...root.querySelectorAll("button, a[href], [tabindex]:not([tabindex='-1'])")].filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true" && el.offsetParent !== null
  );
  if (focusables.length < 2) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus({ preventScroll: true });
  }
});

// iOS Safari: pagehide when jumping to app switcher / suspending the tab
window.addEventListener("pagehide", () => {
  if (game.state === "playing" && !game.paused) {
    pauseGame({ fromSystem: true });
  }
});

function onViewportChange() {
  clearTimeout(viewportTimer);
  viewportTimer = setTimeout(() => {
    syncControlsHint();
    syncTouchPadVisibility();
    fitBrand();
    game.resize();
    measureDock();
  }, appleTouch ? 80 : 0);
}

window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", () => {
  setTimeout(onViewportChange, 150);
  setTimeout(onViewportChange, 450);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewportChange);
  // Avoid scroll thrash on iOS URL-bar show/hide — resize is enough
  if (!appleTouch) {
    window.visualViewport.addEventListener("scroll", onViewportChange);
  }
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
if (appleTouch) document.body.classList.add("is-ios");

// Challenge deep link: ?beat=12400 closes the viral share loop
{
  const fromUrl = readChallengeFromUrl(location.search);
  const stored = storage.get().challengeTarget || 0;
  const target = fromUrl || stored;
  if (target > 0) adoptChallenge(target, { persist: true, announceSeen: !!fromUrl });
  // Clean URL without losing history noise for share remounts
  if (fromUrl > 0 && window.history?.replaceState) {
    try {
      const u = new URL(location.href);
      u.searchParams.delete("beat");
      // keep utm params for analytics platforms
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    } catch {
      /* ignore */
    }
  }
}

function finishBoot() {
  finishBootEarly();
  // Don't block first paint on fonts / storage — toast after a tick if needed
  requestAnimationFrame(() => {
    fitBrand();
    measureDock();
    try {
      if (!storage.canPersist()) warnStorageOnce();
    } catch {
      /* ignore */
    }
  });
}

let fatalShown = false;
function showFatalOnce(message) {
  if (fatalShown) return;
  fatalShown = true;
  showFatal(message);
}

window.addEventListener("error", (e) => {
  // Ignore resource load errors (img/link/script src) — only real runtime errors
  if (e?.target && e.target !== window) return;
  console.error(e?.error || e?.message || e);
  if (!document.body.classList.contains("is-ready")) {
    showFatalOnce("SHADOWKO hit a snag. Refresh to try again.");
  }
});
window.addEventListener("unhandledrejection", (e) => {
  console.error(e?.reason || e);
});

// Reveal UI immediately — never wait on fonts / network for the boot screen
try {
  goTitle();
  finishBoot();
} catch (err) {
  console.error(err);
  finishBoot();
  showFatalOnce("SHADOWKO hit a snag. Refresh to try again.");
}
