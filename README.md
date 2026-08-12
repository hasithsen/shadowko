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

- **Tap / Space** — cycle Slim → Wide → Orb
- **Swipe / ← →** — change lanes
- Match **gates**, dodge **beams**, collect orbs, chain combos
- **M** mute · **Esc** back to menu · tab blur auto-pauses

## Production notes

- Adaptive quality when FPS dips
- Visibility pause + forgiving collisions
- Sanitized localStorage (`js/storage.js`)
- Mute persists with player prefs
- Web app manifest + deploy headers (`_headers` for Netlify)
- Procedural Web Audio (no asset CDN)

## Sponsors

Edit `js/sponsors.js`:

```js
export const SPONSORS = [
  { id: "acme", name: "ACME", tagline: "Your line", color: "#f0a020", accent: "#ffc857" },
];
```

Surfaces: title pill, HUD chip, in-world billboards, game-over card, share text.

## Deploy

Ship the repo root as a static site (Netlify, Cloudflare Pages, S3, nginx). No build step.

## License

MIT — see `LICENSE`.
