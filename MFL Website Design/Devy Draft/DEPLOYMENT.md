# Devy Draft — live widget + Discord bridge: deployment

Turns the Devy Draft MFL Home Page Message into a live tool backed by the Devy
sheets, and makes the Discord bot announce widget activity. Three pieces:

1. **Apps Script endpoint** — `apps_script_preseason_devy/DevyDraftWebApp.gs`
   (+ new logic in `DevyDraft.gs`). Serves the widget's data and is the single
   writer for picks/retentions/skips.
2. **Widget** — `Devy Draft/Devy Draft MFL Message.html`.
3. **Discord bot** — `fantasy_bot.py` (watcher + stage stamping).

## 1. Deploy the Apps Script web app

The `apps_script_preseason_devy` project is **bound to the Devy spreadsheet**
(the one holding `DevyPlayerPool`, `DevyDraftOrder`, `DevyDraftHistory`,
`DevyDraftSettings`, `DevyRetentionHistory`, `Teams`). Both `DevyDraft.gs` and the
new `DevyDraftWebApp.gs` live in that project.

1. Open the Devy spreadsheet → **Extensions → Apps Script**.
2. Confirm `DevyDraftWebApp.gs` is present (push it if you edit locally).
3. Run **Initialize Draft Sheets** once (menu) so the new settings keys
   (`CyclePhase`, `SkipGraceHours`, etc.) are seeded — or they'll be created
   lazily on first write.
4. **Deploy → New deployment → Web app.** Execute as: **Me**. Who has access:
   **Anyone**. Copy the `/exec` URL. **Redeploy after every edit.**

Sanity-check the feed in a browser:
`…/exec?feed=devy&fid=0005&nocache=1` → JSON with conferences, teams, pools, and
(for a valid `fid`) a `viewer` block.

## 2. Wire the widget

Edit `Devy Draft MFL Message.html`: set `WEBAPP_URL` (near the top of the
`<script>`) to the `/exec` URL — replace the `__DEVY_WEBAPP_URL__` token. (Or
add a `build-devy-draft.js` that substitutes it, mirroring
`build-player-awards.js`.)

Paste the block between `<!-- ===== START MFL MESSAGE ===== -->` and
`<!-- ===== END MFL MESSAGE ===== -->` into the MFL Home Page Message. MFL injects
the logged-in `franchise_id`; the widget reads it (falls back to `DV.me` for local
preview). Team/conference **logos must be https URLs** to render on MFL.

## 3. Wire the bot

Add to `.env`: `DEVY_WEBAPP_URL=<the same /exec URL>` (see `.env.example`).
Restart the bot. On `/devy start`, the bot begins a 30s watcher that:
- announces picks made from the **widget** (same format as slash-command picks),
- enforces the soft 24h clock (auto-skip → the owed team can still make it up),
- grace auto-picks an owed slot after `SkipGraceHours` (default 24),
- stops when every started conference completes (and resumes on bot restart if a
  draft is mid-flight).

## How it fits together

- **Single sheet, two engines.** The widget writes via the endpoint (Apps Script
  engine); the bot's `/devy` commands still write via gspread. Both re-validate
  turn/availability server-side and share the `DevyDraftSettings` stage keys.
  The stage/skip/owed logic is mirrored in `DevyDraft.gs` and `fantasy_bot.py` —
  **keep them in parity** (each file has a comment listing the canonical keys).
- **Franchise-id width:** MFL/widget use 4-digit (`0005`); sheets/engine use
  3-digit (`005`). The endpoint normalizes at the boundary.
- **Stage board:** `DevyDraftSettings.CyclePhase` moves
  RETENTION_OPEN → RETENTION_CLOSED → ORDER_READY → RETENTIONS_APPLIED →
  DRAFTING → COMPLETE; `Status_<CONF>` tracks each conference
  (not_started / in_progress / awaiting_makeups / completed).

## Known follow-ups (not yet implemented)

- **Full single-writer routing of bot picks/retentions through the endpoint.**
  Today bot writes go straight to the sheet (with owed-slot parity patched in),
  not through the endpoint. Routing them through the endpoint would give the
  strict "two simultaneous actions can never both commit" guarantee from the
  plan. It needs a manual-write-in path added to the endpoint's `pick` action
  first (the bot's `/devy pick` supports write-ins; the endpoint currently
  requires a pool `playerId`).
- **Web "add a player" (write-in)** was removed from the live widget (it was a
  demo feature); re-add once the endpoint supports manual entry.
- **Team colors/logos** come from the `Teams` sheet if those columns exist;
  otherwise the widget falls back to colored abbreviation chips.
