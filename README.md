# SHADOWKO

**Master the dark. Outrun the light.**

Production-ready HTML5 silhouette runner for [shadowko.com](https://shadowko.com) — premium feel, instant play, sponsor-native surfaces.

## Play locally

ES modules need HTTP:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080).

```bash
npx --yes serve .
python -m http.server 8080
```

## How to play

- **Tap / Morph pad / Space** — cycle Slim → Wide → Orb (form pips jump to a shape)
- **Swipe / lane pads / ← →** — change lanes
- Match **gates**, dodge **beams**, collect orbs, chain combos
- **M** mute · **P / Esc** pause · **Space** resume · Esc again from pause returns to menu
- Tab / app blur auto-pauses; tap **Continue** when ready (no surprise mid-obstacle resume)

## Production notes

- Adaptive quality when FPS dips (DPR retunes with quality)
- Visibility pause + manual pause overlay (desktop & mobile)
- On-screen touch pad on coarse pointers; keyboard-first on desktop
- Opening invulnerability + brief near-miss grace
- Dock-aware player Y (HUD / home indicator / touch pad)
- Sanitized localStorage (`js/storage.js`)
- Mute persists with player prefs
- Web app manifest + deploy headers (`_headers` for Netlify)
- Procedural Web Audio (no asset CDN)

## Sponsors

Inventory pitches live in `js/sponsors.js` — creatives invite partners to place their brand on title, HUD, billboards, and share cards. Tap the sponsorship pill to inquire (`SPONSOR_INQUIRY_URL`).

When a deal closes, replace a slot with the live kit:

```js
{ id: "acme", name: "ACME", tagline: "Your line", kicker: "Presented by", color: "#f0a020", accent: "#ffc857" }
```

## Deploy

Ship the repo root as a static site (Netlify, Cloudflare Pages, S3, nginx). No build step.

## License

MIT — see `LICENSE`.
