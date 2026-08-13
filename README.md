# SHADOWKO

**Master the dark. Outrun the light.**

Production HTML5 silhouette runner for [shadowko.com](https://shadowko.com) — premium feel, instant play, sponsor-native inventory built to close brand deals.

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
- Shared links with `?beat=12400` open a **Beat 12,400** challenge on title

## Sponsorship (revenue)

### Surfaces (sellable inventory)

| Surface | Placement |
|---|---|
| Title eyebrow + pill | First impression / inquiry CTA |
| HUD chip | Mid-run brand moment (tappable) |
| In-world billboards | Monogram + name + tagline |
| Game-over card | High-intent after every death |
| Share copy | Live kits attributed on player shares |

### Go live with a partner

Edit `js/sponsors.js`. Live kits **take priority** over open-inventory pitches:

```js
{
  id: "acme",
  name: "ACME",
  tagline: "Built for the night shift",
  kicker: "Presented by",
  presentedBy: "Presented by",
  color: "#f0a020",
  accent: "#ffc857",
  live: true,
  ctaUrl: "https://acme.example",
  logoText: "AC",
  weight: 4,
}
```

**Asset checklist**

- Hex `color` / `accent` that read on `#07080c`
- Short `logoText` (2–3 chars) for billboard monogram
- Brand `ctaUrl` (gets `utm_source=shadowko&utm_medium=sponsor&utm_campaign={id}`)
- Optional: keep inventory pitches with `live: false` as fillers when no paid flight is active

**Inquiry**

Default CTA is `mailto:sponsors@shadowko.com` (`SPONSOR_INQUIRY_URL`). Title / over pills and HUD chip all route through `sponsorHref()`.

### Analytics events

`js/analytics.js` emits (Plausible / gtag / `dataLayer` when present):

- `play_start`, `game_over`, `share`
- `sponsor_impression`, `sponsor_click`
- `challenge_seen`, `challenge_beaten`

Wire Plausible (example):

```html
<script defer data-domain="shadowko.com" src="https://plausible.io/js/script.js"></script>
```

If you add a third-party analytics host, extend CSP `script-src` / `connect-src` in `_headers`.

### Media kit (one-pager talking points)

- Instant-play HTML5, mobile + desktop, PWA-capable
- Always-on brand color theming across UI + canvas
- Viral challenge loop (`?beat=`) drives return visits
- Share intents: native / copy / X / WhatsApp with UTM
- Contact: sponsors@shadowko.com

## Production notes

- **Mobile-first CSS** — phone base styles; desktop via `min-width: 721px` / `900px`
- ≥44px hit targets on coarse pointers; landscape floor at `2.85rem`
- Viewport allows pinch-zoom (a11y); `touch-action` still blocks play-surface scroll
- Adaptive quality when FPS dips (DPR retunes with quality; softer cap on iOS; thrash guard)
- Idle / game-over canvas throttled (~10–15fps) to save battery
- Visibility / pagehide pause + manual Continue (no mid-obstacle surprise resume)
- On-screen touch pad on coarse / Apple touch; keyboard-first on desktop
- Opening invulnerability + brief near-miss grace
- Dock-aware player Y (HUD / home indicator / touch pad)
- Sanitized localStorage (`js/storage.js`) including challenge targets; private-mode toast
- Mute persists with player prefs
- PWA icons: `icon-192.png` / `icon-512.png` / `apple-touch-icon.png`
- OG image: `og.png` · sitemap: `sitemap.xml` · Netlify headers: `_headers` (HSTS, CSP, no stale JS/CSS)
- Asset bust: `?v=` on CSS/JS in `index.html`
- Procedural Web Audio (no asset CDN)
- Boot timeout + fatal refresh CTA if modules stall

## Deploy

Ship the **repo root** as a static site (Netlify, Cloudflare Pages, S3, nginx). No build step.

**Post-deploy checklist**

1. Open `/` and confirm fonts + play
2. Confirm `/og.png` and `/sitemap.xml` 200
3. Share a score → open the link → title shows **Beat N**
4. Toggle a `live: true` kit and verify eyebrow / pill / chip colors + CTA
5. Optional: attach Plausible / GA and verify `play_start` fires

## License

MIT — see `LICENSE`.
