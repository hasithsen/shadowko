import { pickSponsor } from "./sponsors.js";
import { AudioBus } from "./audio.js";

export const FORMS = [
  { id: "slim", label: "SLIM", w: 0.38, h: 1.0 },
  { id: "wide", label: "WIDE", w: 0.92, h: 0.55 },
  { id: "orb", label: "ORB", w: 0.62, h: 0.62 },
];

const GATE_KINDS = ["slim", "wide", "orb"];
const MAX_PARTICLES = 120;
const MAX_FLOATERS = 24;
const MAX_ENTITIES = 28;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hexAlpha(hex, a) {
  const h = String(hex || "#f0a020").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(240,160,32,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.hooks = hooks;
    this.audio = new AudioBus();
    this.ok = !!this.ctx;

    this.dpr = 1;
    this.w = 0;
    this.h = 0;

    this.state = "idle";
    this.time = 0;
    this.dt = 0;
    this.lastTs = 0;

    this.lanes = 3;
    this.laneX = [0, 0, 0];
    this.roadTop = 0;
    this.roadH = 0;

    this.player = this.freshPlayer();
    this.entities = [];
    this.particles = [];
    this.floaters = [];
    this.buildings = [];
    this.billboards = [];
    this.stars = [];

    this.speed = 0;
    this.baseSpeed = 0;
    this.distance = 0;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.maxCombo = 1;
    this.spawnTimer = 0;
    this.shake = 0;
    this.flash = 0;
    this.hitstop = 0;
    this.sponsor = pickSponsor();
    this.paused = false;
    this.pauseHint = "Tap or press Space to continue";
    this.quality = 1;
    this.fpsEma = 60;
    this.tickAcc = 0;
    this.reducedMotion = false;
    this.dockReserve = 0;
    this._needsResize = false;
    this._lastDprCap = 2;

    this._onResize = () => this.resize();
    this._loop = (ts) => this.frame(ts);
    this.raf = 0;
    this.ro = null;

    if (!this.ok) {
      this.hooks.onError?.("Canvas is unavailable in this browser.");
      return;
    }

    this.resize();
    window.addEventListener("resize", this._onResize);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.canvas);
    }
    this.seedDecor();
    this.raf = requestAnimationFrame(this._loop);
  }

  setReducedMotion(on) {
    this.reducedMotion = !!on;
  }

  /** External UI measures HUD / touch pad height so the silhouette stays clear. */
  setDockReserve(px) {
    const next = Math.max(0, Number(px) || 0);
    if (Math.abs(next - this.dockReserve) < 1) return;
    this.dockReserve = next;
    this.layoutPlayer();
    if (this.paused && this.state === "playing") this.render();
  }

  setPauseHint(text) {
    this.pauseHint = text || "Tap or press Space to continue";
    if (this.paused && this.state === "playing") this.render();
  }

  freshPlayer() {
    return {
      lane: 1,
      targetLane: 1,
      form: 0,
      x: 0,
      y: 0,
      trail: [],
      invuln: 0,
      bob: 0,
    };
  }

  /** Keep silhouette above HUD dock / home indicator / on-screen controls. */
  layoutPlayer() {
    if (!this.w || !this.h) return;
    const fallback = Math.min(120, this.h * 0.18);
    const reserve = Math.max(this.dockReserve || 0, fallback);
    this.player.y = Math.min(this.roadTop + this.roadH * 0.72, this.h - reserve);
    this.syncLanes(this.player.y);
    this.player.x = this.laneX[this.player.lane];
  }

  resize() {
    if (!this.ok) return;
    const rect = this.canvas.getBoundingClientRect();
    const dprCap = this.quality < 0.75 ? 1.25 : 2;
    this._lastDprCap = dprCap;
    const nextDpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.dpr = nextDpr;
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const short = this.h < 640;
    const landscape = this.w > this.h && this.h < 500;
    this.roadTop = this.h * (landscape ? 0.16 : short ? 0.2 : 0.28);
    this.roadH = this.h * (landscape ? 0.72 : short ? 0.64 : 0.58);
    this.layoutPlayer();

    // Orientation / chrome changes while paused must still refresh the frame
    if (this.paused && this.state === "playing") this.render();
  }

  laneCentersAt(y) {
    const top = this.roadTop;
    const bottom = top + this.roadH;
    const t = clamp((y - top) / (bottom - top || 1), 0, 1);
    const topW = Math.min(this.w * 0.42, 260);
    const botW = Math.min(this.w * 0.92, 560);
    const width = lerp(topW, botW, t);
    const left = (this.w - width) / 2;
    return Array.from({ length: this.lanes }, (_, i) => left + (width / this.lanes) * (i + 0.5));
  }

  syncLanes(y) {
    this.laneX = this.laneCentersAt(y);
  }

  /** Nearest lane to the player's visual X — fairer during transitions. */
  currentLane() {
    let best = this.player.targetLane;
    let bestDist = Infinity;
    for (let i = 0; i < this.lanes; i++) {
      const d = Math.abs(this.player.x - this.laneX[i]);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  seedDecor() {
    const starCount = this.quality < 0.75 ? 28 : 56;
    this.stars = Array.from({ length: starCount }, () => ({
      x: Math.random(),
      y: Math.random() * 0.45,
      r: rand(0.4, 1.6),
      a: rand(0.2, 0.85),
    }));
    this.buildings = Array.from({ length: 16 }, (_, i) => ({
      side: i % 2,
      x: rand(0, 1),
      w: rand(0.06, 0.14),
      h: rand(0.18, 0.42),
      shade: rand(0.08, 0.22),
      windows: (Math.random() * 8 + 4) | 0,
    }));
  }

  start(sponsor) {
    if (!this.ok) return;
    this.audio.resume();
    this.audio.start();
    this.sponsor = sponsor || pickSponsor(Date.now());
    this.state = "playing";
    this.paused = false;
    this.time = 0;
    this.distance = 0;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.maxCombo = 1;
    this.spawnTimer = 0.55;
    this.entities = [];
    this.particles = [];
    this.floaters = [];
    this.billboards = [];
    this.player = this.freshPlayer();
    this.layoutPlayer();
    this.player.x = this.laneX[1];
    // Opening grace — learn the rhythm before the first lethal hit
    this.player.invuln = 1.35;
    const mobileFeel = this.w < 480 || (this.w < this.h && this.w < 900);
    this.baseSpeed = Math.min(this.w, 420) * (mobileFeel ? 0.46 : 0.52);
    this.speed = this.baseSpeed;
    this.shake = 0;
    this.flash = 0;
    this.hitstop = 0;
    this.hooks.onStart?.(this.snapshot());
    this.spawnBillboard(true);
  }

  setPaused(paused) {
    const next = !!paused;
    if (next === this.paused) return;
    this.paused = next;
    if (!next) this.lastTs = 0;
    else this.render();
  }

  snapshot() {
    return {
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      combo: this.combo,
      maxCombo: this.maxCombo,
      form: FORMS[this.player.form],
      sponsor: this.sponsor,
      state: this.state,
      paused: this.paused,
    };
  }

  morph(toForm) {
    if (this.state !== "playing" || this.paused) return;
    if (typeof toForm === "number" && toForm >= 0 && toForm < FORMS.length) {
      if (this.player.form === toForm) return;
      this.player.form = toForm;
    } else if (typeof toForm === "string") {
      const idx = FORMS.findIndex((f) => f.id === toForm);
      if (idx < 0 || this.player.form === idx) return;
      this.player.form = idx;
    } else {
      this.player.form = (this.player.form + 1) % FORMS.length;
    }
    this.audio.morph();
    this.burst(this.player.x, this.player.y - 30, this.sponsor.color, 8);
    this.hooks.onMorph?.(this.snapshot());
  }

  shiftLane(dir) {
    if (this.state !== "playing" || this.paused) return;
    const next = clamp(this.player.targetLane + dir, 0, this.lanes - 1);
    if (next === this.player.targetLane) return;
    this.player.targetLane = next;
    this.audio.lane();
    this.hooks.onLane?.(this.snapshot(), dir);
  }

  gameOver(reason = "light") {
    if (this.state !== "playing") return;
    this.state = "over";
    this.audio.death();
    this.flash = this.reducedMotion ? 0.25 : 0.55;
    this.shake = this.reducedMotion ? 4 : 14;
    this.hitstop = this.reducedMotion ? 0.04 : 0.1;
    this.burst(this.player.x, this.player.y - 20, "#ff4d5e", 22);
    this.hooks.onGameOver?.(this.snapshot(), reason);
  }

  addScore(n, fromCombo = false) {
    const gain = n * (fromCombo ? this.combo : 1);
    this.score += gain;
    return gain;
  }

  bumpCombo() {
    this.combo = Math.min(12, this.combo + 1);
    this.comboTimer = 2.2;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.audio.combo(this.combo);
    this.hooks.onCombo?.(this.snapshot());
  }

  spawnTimerInterval() {
    const t = this.distance / 1000;
    return this.time < 4 ? 1.55 : clamp(1.25 - t * 0.07, 0.52, 1.25);
  }

  canSpawn() {
    return this.entities.length < MAX_ENTITIES;
  }

  spawnWave() {
    if (!this.canSpawn()) return;
    const roll = Math.random();
    const lane = (Math.random() * this.lanes) | 0;
    const y = this.roadTop - 48;
    const late = this.time > 14;

    if (this.time < 3.8) {
      if (roll < 0.55) {
        this.entities.push({
          type: "gate",
          kind: FORMS[this.player.form].id,
          lane,
          y,
          passed: false,
        });
      } else if (roll < 0.82) {
        this.entities.push({ type: "orb", lane, y, r: 12, taken: false });
      } else {
        this.entities.push({
          type: "beam",
          lane: (lane + 1 + ((Math.random() * 2) | 0)) % this.lanes,
          y,
          h: rand(70, 100),
          passed: false,
        });
      }
      return;
    }

    if (roll < 0.4) {
      this.entities.push({
        type: "gate",
        kind: pick(GATE_KINDS),
        lane,
        y,
        passed: false,
      });
    } else if (roll < 0.68) {
      this.entities.push({
        type: "beam",
        lane,
        y,
        h: rand(70, 120),
        passed: false,
      });
    } else if (roll < 0.88) {
      this.entities.push({ type: "orb", lane, y, r: 12, taken: false });
    } else if (late) {
      const a = (Math.random() * this.lanes) | 0;
      let b = (a + 1 + ((Math.random() * 2) | 0)) % this.lanes;
      this.entities.push({
        type: "gate",
        kind: pick(GATE_KINDS),
        lane: a,
        y,
        passed: false,
      });
      this.entities.push({
        type: "beam",
        lane: b,
        y: y - 110,
        h: rand(60, 100),
        passed: false,
      });
    } else {
      this.entities.push({
        type: "gate",
        kind: pick(GATE_KINDS),
        lane,
        y,
        passed: false,
      });
    }

    if (Math.random() < 0.32) this.spawnBillboard();
  }

  spawnBillboard(force = false) {
    if (!force && this.billboards.length > 2) return;
    this.billboards.push({
      side: Math.random() < 0.5 ? 0 : 1,
      y: this.roadTop - rand(40, 180),
      sponsor: this.sponsor,
      w: rand(118, 150),
      h: rand(56, 70),
    });
  }

  burst(x, y, color, n = 12) {
    const budget = Math.floor(n * this.quality * (this.reducedMotion ? 0.45 : 1));
    for (let i = 0; i < budget; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = rand(40, 220);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.28, 0.65),
        max: 0.65,
        r: rand(1.4, 3.2),
        color,
      });
    }
  }

  floatText(x, y, text, color = "#ffc857") {
    if (this.reducedMotion) return;
    if (this.floaters.length >= MAX_FLOATERS) this.floaters.shift();
    this.floaters.push({ x, y, text, color, life: 0.85, max: 0.85 });
  }

  formBox() {
    const f = FORMS[this.player.form];
    const unit = Math.min(56, this.w * 0.12);
    const w = unit * f.w;
    const h = unit * f.h;
    return {
      x: this.player.x - w / 2,
      y: this.player.y - h,
      w,
      h,
      cx: this.player.x,
      cy: this.player.y - h / 2,
    };
  }

  entityBox(e) {
    const centers = this.laneCentersAt(e.y);
    const lx = centers[e.lane];
    const depth = clamp((e.y - this.roadTop) / (this.roadH || 1), 0, 1);
    const unit = Math.min(56, this.w * 0.12) * lerp(0.55, 1, depth);
    if (e.type === "gate") {
      const kind = FORMS.find((f) => f.id === e.kind) || FORMS[0];
      const w = unit * kind.w * 1.12;
      const h = unit * kind.h * 1.08;
      return { x: lx - w / 2, y: e.y - h, w, h, cx: lx, cy: e.y - h / 2 };
    }
    if (e.type === "beam") {
      const w = unit * 0.68;
      const h = e.h * lerp(0.7, 1, depth);
      return { x: lx - w / 2, y: e.y - h, w, h, cx: lx, cy: e.y - h / 2 };
    }
    if (e.type === "orb") {
      const r = e.r * lerp(0.7, 1, depth);
      return {
        x: lx - r,
        y: e.y - r * 2,
        w: r * 2,
        h: r * 2,
        cx: lx,
        cy: e.y - r,
      };
    }
    return { x: lx, y: e.y, w: 0, h: 0 };
  }

  overlaps(a, b, pad = 0) {
    return !(
      a.x + a.w < b.x + pad ||
      a.x > b.x + b.w - pad ||
      a.y + a.h < b.y + pad ||
      a.y > b.y + b.h - pad
    );
  }

  update(dt) {
    this.time += dt;
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      return;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= 36 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }

    if (this.state !== "playing") return;

    this.speed = this.baseSpeed + this.distance * 0.32 + Math.min(200, this.time * 5.5);
    this.distance += (this.speed * dt) / 8;
    this.addScore(dt * 12);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }

    this.syncLanes(this.player.y);
    this.player.lane = this.player.targetLane;
    this.player.x = lerp(this.player.x, this.laneX[this.player.targetLane], 1 - Math.pow(0.0007, dt));
    this.player.bob += dt * 8;
    this.player.invuln = Math.max(0, this.player.invuln - dt);

    if (this.quality > 0.55) {
      this.player.trail.unshift({ x: this.player.x, y: this.player.y, form: this.player.form });
      if (this.player.trail.length > 8) this.player.trail.pop();
    } else {
      this.player.trail.length = 0;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnWave();
      this.spawnTimer = this.spawnTimerInterval();
    }

    const py = this.player.y;
    const pbox = this.formBox();
    const laneNow = this.currentLane();

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      e.y += this.speed * dt;

      if (e.type === "orb" && !e.taken) {
        const box = this.entityBox(e);
        if (this.overlaps(pbox, box, -6)) {
          e.taken = true;
          const gain = this.addScore(50, true);
          this.bumpCombo();
          this.audio.collect();
          this.burst(box.cx, box.cy, "#2fd6c0", 12);
          this.floatText(box.cx, box.cy, `+${Math.floor(gain)}`, "#2fd6c0");
          this.hooks.onScore?.(this.snapshot(), gain);
        }
      }

      if (e.type === "gate" && !e.passed) {
        const box = this.entityBox(e);
        // Trigger when gate reaches the torso band — forgiving vertical window
        if (box.y + box.h >= py - pbox.h * 0.45 && box.y <= py + 8) {
          e.passed = true;
          if (e.lane === laneNow || e.lane === this.player.targetLane) {
            const form = FORMS[this.player.form];
            if (form.id === e.kind) {
              const gain = this.addScore(80, true);
              this.bumpCombo();
              this.audio.gate();
              this.burst(box.cx, box.cy, this.sponsor.accent, 10);
              this.floatText(box.cx, box.cy - 10, `+${Math.floor(gain)}`, this.sponsor.accent);
              this.hooks.onScore?.(this.snapshot(), gain);
            } else if (this.player.invuln <= 0) {
              this.gameOver("gate");
              return;
            }
          } else if (Math.abs(e.lane - laneNow) === 1) {
            this.bumpCombo();
            this.addScore(20, true);
            this.floatText(box.cx, box.cy, "NEAR", "#2fd6c0");
            // Brief grace after a near-miss — rewards commitment without soft-locking
            this.player.invuln = Math.max(this.player.invuln, 0.28);
          }
        }
      }

      if (e.type === "beam" && !e.passed) {
        const box = this.entityBox(e);
        const inLane = e.lane === laneNow || e.lane === this.player.targetLane;
        // Slightly forgiving beam pad
        if (inLane && this.overlaps(pbox, box, 10) && this.player.invuln <= 0) {
          this.gameOver("beam");
          return;
        }
        if (box.y > py + 24) {
          e.passed = true;
          if (!inLane && Math.abs(e.lane - laneNow) === 1) {
            this.addScore(15, true);
            this.player.invuln = Math.max(this.player.invuln, 0.2);
          }
        }
      }

      if (e.y - 160 > this.h) this.entities.splice(i, 1);
    }

    for (let i = this.billboards.length - 1; i >= 0; i--) {
      const b = this.billboards[i];
      b.y += this.speed * dt * 0.85;
      if (b.y > this.h + 80) this.billboards.splice(i, 1);
    }

    this.tickAcc += dt;
    if (this.tickAcc >= 0.05) {
      this.tickAcc = 0;
      this.hooks.onTick?.(this.snapshot());
    }
  }

  drawBackground() {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b0e16");
    g.addColorStop(0.45, "#07080c");
    g.addColorStop(1, "#05060a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (const s of this.stars) {
      ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(this.time * 2 + s.x * 20));
      ctx.fillStyle = "#e8eef8";
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const horizon = this.roadTop * 0.92;
    for (const b of this.buildings) {
      const bw = b.w * w;
      const bh = b.h * h;
      const x = b.side === 0 ? b.x * w * 0.28 - bw * 0.2 : w - b.x * w * 0.28 - bw * 0.8;
      ctx.fillStyle = "rgba(18, 22, 32, 0.85)";
      ctx.fillRect(x, horizon - bh, bw, bh + 8);
      if (this.quality > 0.6) {
        ctx.fillStyle = `rgba(240, 160, 32, ${b.shade})`;
        for (let i = 0; i < b.windows; i++) {
          const wx = x + 6 + (i % 3) * (bw / 3.4);
          const wy = horizon - bh + 10 + Math.floor(i / 3) * 14;
          if (wy < horizon - 8) ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }

    const glow = ctx.createRadialGradient(w * 0.5, horizon, 10, w * 0.5, horizon, w * 0.55);
    glow.addColorStop(0, "rgba(240,160,32,0.10)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon + 40);
  }

  drawRoad() {
    const { ctx, w } = this;
    const top = this.roadTop;
    const bottom = top + this.roadH;
    const topW = Math.min(w * 0.42, 260);
    const botW = Math.min(w * 0.92, 560);
    const topL = (w - topW) / 2;
    const botL = (w - botW) / 2;

    ctx.beginPath();
    ctx.moveTo(topL, top);
    ctx.lineTo(topL + topW, top);
    ctx.lineTo(botL + botW, bottom);
    ctx.lineTo(botL, bottom);
    ctx.closePath();
    const roadGrad = ctx.createLinearGradient(0, top, 0, bottom);
    roadGrad.addColorStop(0, "#12151f");
    roadGrad.addColorStop(1, "#0c0e14");
    ctx.fillStyle = roadGrad;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topL, top);
    ctx.lineTo(topL + topW, top);
    ctx.lineTo(botL + botW, bottom);
    ctx.lineTo(botL, bottom);
    ctx.closePath();
    ctx.clip();

    const dashOffset = (this.distance * 3) % 48;
    ctx.strokeStyle = "rgba(242,239,230,0.12)";
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 18]);
    ctx.lineDashOffset = -dashOffset;
    for (let i = 1; i < this.lanes; i++) {
      const t = i / this.lanes;
      ctx.beginPath();
      ctx.moveTo(topL + topW * t, top);
      ctx.lineTo(botL + botW * t, bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(47,214,192,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(topL, top);
    ctx.lineTo(botL, bottom);
    ctx.moveTo(topL + topW, top);
    ctx.lineTo(botL + botW, bottom);
    ctx.stroke();
    ctx.restore();
  }

  drawBillboards() {
    const { ctx, w } = this;
    for (const b of this.billboards) {
      const x = b.side === 0 ? w * 0.04 : w * 0.96 - b.w;
      const y = b.y;
      const s = b.sponsor;
      ctx.fillStyle = "rgba(10,12,18,0.92)";
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, b.w, b.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = s.accent;
      ctx.font = `700 ${Math.max(9, b.w * 0.095)}px Syne, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(s.name, x + b.w / 2, y + b.h * 0.42, b.w - 12);
      ctx.fillStyle = "rgba(242,239,230,0.55)";
      ctx.font = `500 ${Math.max(7, b.w * 0.07)}px Outfit, sans-serif`;
      ctx.fillText(s.tagline, x + b.w / 2, y + b.h * 0.72, b.w - 12);
      ctx.fillStyle = "rgba(80,88,104,0.5)";
      ctx.fillRect(x + b.w / 2 - 2, y + b.h, 4, 28);
    }
  }

  drawEntity(e) {
    const { ctx } = this;
    const box = this.entityBox(e);
    if (e.type === "gate") {
      const color = e.kind === "slim" ? "#f0a020" : e.kind === "wide" ? "#2fd6c0" : "#ff4d5e";
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = hexAlpha(color, 0.12);
      ctx.lineWidth = 3;
      if (this.quality > 0.7) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
      }
      if (e.kind === "orb") {
        ctx.beginPath();
        ctx.ellipse(box.cx, box.cy, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        roundRect(ctx, box.x, box.y, box.w, box.h, e.kind === "wide" ? 10 : 18);
        ctx.fill();
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = hexAlpha(color, 0.9);
      ctx.font = "700 11px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(e.kind.toUpperCase(), box.cx, box.y - 8);
      ctx.restore();
    } else if (e.type === "beam") {
      const grd = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y);
      grd.addColorStop(0, "rgba(255,220,140,0)");
      grd.addColorStop(0.5, "rgba(255,220,140,0.55)");
      grd.addColorStop(1, "rgba(255,220,140,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(box.x - 8, box.y, box.w + 16, box.h);
      ctx.fillStyle = "rgba(255,248,220,0.85)";
      ctx.fillRect(box.cx - 2, box.y, 4, box.h);
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.time * 30 + e.lane);
      ctx.fillStyle = "#fff6c8";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.globalAlpha = 1;
    } else if (e.type === "orb" && !e.taken) {
      const pulse = 1 + 0.12 * Math.sin(this.time * 10 + e.lane);
      ctx.save();
      ctx.translate(box.cx, box.cy);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "#2fd6c0";
      if (this.quality > 0.7) {
        ctx.shadowColor = "#2fd6c0";
        ctx.shadowBlur = 16;
      }
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(4, box.w / 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8fffa";
      ctx.beginPath();
      ctx.arc(-3, -3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawPlayer() {
    const { ctx } = this;
    const box = this.formBox();
    const bob = Math.sin(this.player.bob) * 3;
    const color = this.sponsor?.color || "#f0a020";

    for (let i = this.player.trail.length - 1; i >= 0; i--) {
      const t = this.player.trail[i];
      const f = FORMS[t.form];
      const unit = Math.min(56, this.w * 0.12);
      ctx.globalAlpha = 0.05 + (1 - i / this.player.trail.length) * 0.12;
      ctx.fillStyle = color;
      const tw = unit * f.w * 0.85;
      const th = unit * f.h * 0.85;
      roundRect(ctx, t.x - tw / 2, t.y - th + bob, tw, th, f.id === "orb" ? 99 : 12);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(0, bob);
    // Opening / near-miss grace: soft pulse so players feel the shield
    if (this.player.invuln > 0 && !this.reducedMotion) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 14));
    }
    ctx.fillStyle = "#0a0b10";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    if (this.quality > 0.65) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
    }

    const form = FORMS[this.player.form];
    if (form.id === "orb") {
      ctx.beginPath();
      ctx.ellipse(box.cx, box.cy, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      roundRect(ctx, box.x, box.y, box.w, box.h, form.id === "wide" ? 12 : 20);
      ctx.fill();
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(box.cx - box.w * 0.15, box.cy - box.h * 0.15, 2.2, 0, Math.PI * 2);
    ctx.arc(box.cx + box.w * 0.15, box.cy - box.h * 0.15, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawFloaters() {
    const { ctx } = this;
    ctx.textAlign = "center";
    ctx.font = "700 16px Outfit, sans-serif";
    for (const f of this.floaters) {
      ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  drawIdleTitleAura() {
    if (this.state !== "idle") return;
    const { ctx, w, h } = this;
    const x = w / 2;
    const y = h * 0.62;
    const unit = Math.min(64, w * 0.14);
    const phase = Math.floor(this.time * 0.7) % 3;
    const f = FORMS[phase];
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#0a0b10";
    ctx.strokeStyle = "#f0a020";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#f0a020";
    ctx.shadowBlur = this.quality > 0.7 ? 20 : 0;
    const bw = unit * f.w;
    const bh = unit * f.h;
    if (f.id === "orb") {
      ctx.beginPath();
      ctx.ellipse(x, y - bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      roundRect(ctx, x - bw / 2, y - bh, bw, bh, f.id === "wide" ? 12 : 20);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPaused() {
    if (!this.paused || this.state !== "playing") return;
    const { ctx, w, h } = this;
    ctx.fillStyle = "rgba(5,6,10,0.52)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(242,239,230,0.92)";
    ctx.font = "700 18px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", w / 2, h * 0.46);
    ctx.font = "500 13px Outfit, sans-serif";
    ctx.fillStyle = "rgba(242,239,230,0.58)";
    ctx.fillText(this.pauseHint || "Tap or press Space to continue", w / 2, h * 0.46 + 28);
  }

  render() {
    if (!this.ok) return;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    if (this.shake > 0 && !this.reducedMotion) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawBackground();
    this.drawRoad();
    this.drawBillboards();
    for (const e of this.entities) this.drawEntity(e);
    if (this.state === "playing" || this.state === "over") this.drawPlayer();
    this.drawIdleTitleAura();
    this.drawParticles();
    this.drawFloaters();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,77,94,${this.flash * 0.45})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
    this.drawPaused();
  }

  adaptQuality(dt) {
    if (dt <= 0) return;
    const fps = 1 / dt;
    this.fpsEma = this.fpsEma * 0.9 + fps * 0.1;
    const prev = this.quality;
    if (this.fpsEma < 45) this.quality = Math.max(0.45, this.quality - 0.02);
    else if (this.fpsEma > 56) this.quality = Math.min(1, this.quality + 0.01);
    // Retune DPR when quality crosses the soft-cap threshold
    const nextCap = this.quality < 0.75 ? 1.25 : 2;
    if (nextCap !== this._lastDprCap || Math.abs(prev - this.quality) > 0.05) {
      this._needsResize = true;
    }
  }

  frame(ts) {
    // Keep the rAF heartbeat while paused; refresh if chrome changed
    if (this.paused && this.state === "playing") {
      if (this._needsResize) {
        this._needsResize = false;
        this.resize();
      }
      this.raf = requestAnimationFrame(this._loop);
      return;
    }

    if (!this.lastTs) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    dt = Math.min(0.033, Math.max(0, dt));
    this.dt = dt;
    this.adaptQuality(dt);
    if (this._needsResize) {
      this._needsResize = false;
      this.resize();
    }
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this._onResize);
    this.ro?.disconnect();
  }
}
