# Player Awards — banner & icon assets

`build-player-awards.js` inlines these files as data URIs into
`home-message-player-awards.html`. Drop the real art here (exact names/paths),
then re-run `node build-player-awards.js`. Missing files are non-fatal — banners
fall back to their solid color and `<img>` icons to a transparent pixel — so the
build always succeeds; it just logs what's missing.

Expected files (paths are relative to this `assets/` folder):

| File | Where it shows | Notes |
|------|----------------|-------|
| `heisman-stage.png`    | Awards Watch hero banner background | wide hero; keep it optimized (the whole message must stay < 768 KB) |
| `nfl-draft-stage.png`  | NFL Draft hero banner background | wide hero; optimize |
| `nfl-draft-logo.png`   | NFL Draft banner logo + small "Draft" icon | doubles as the draft board logo (`CFFB_NFLDRAFT.logo`) |
| `gameday-logo.png`     | "College GameDay" source chip | small icon |
| `icons/rivalry.svg`    | "Rivalry Wagers" source chip | small icon |
| `icons/award-heisman.svg` | "Player Awards" source chip | small icon |

Placeholder SVGs already live next to the component
(`Player Awards & Recruiting Dollars/player-awards/nfl-draft-placeholder.svg`,
`gameday-placeholder.svg`) and are inlined automatically as fallbacks.

Conference logos are inlined separately from the CFFB Design System
(`apps_script_recruiting/CFFB Design System/assets/conferences/`) as
`.pa-conf-logo--<id>` CSS classes — no action needed here.
