# Devy Draft — how to test each layer

## 1. Syntax (no deploy) — already green
- Bot: `py -m py_compile fantasy_bot.py`
- Apps Script: `node --check` on a copy of each `.gs` (valid JS)
- Widget: extract the inline `<script>` and `node --check` it

## 2. Widget UI + full click-through (no cloud) ← do this first
Runs the real widget against a local mock of the endpoint that **mutates state**,
so picks / retention / skip / auto-pick actually change the board.

    cd "MFL Website Design/Devy Draft"
    python mock-server.py          # serves http://localhost:8770

Then open the widget in a browser (it lives one level up, in the `MFL Website
Design/` root next to the other `home-message-*.html` pages) with the test query
params:

    ../home-message-devy-draft.html?api=http://localhost:8770&fid=0005

- You are **Georgia (0005)**, on the clock in the SEC. Pick from the pool → the
  board advances and your "on the clock" state clears.
- Switch conferences, browse the pool, try drafting from B1G (should refuse —
  not your conference).
- Add `&phase=retention` to the URL to make the **Retention tab** editable; click
  Retain/Release and watch the summary update.
- Simulate a blown clock from a terminal, then reload the page to see the SKIPPED
  "owed" row and the make-up flow:

      curl -X POST -H "Content-Type: text/plain" -d '{"action":"skip","conference":"SEC"}' http://localhost:8770/
      curl -X POST -H "Content-Type: text/plain" -d '{"action":"autopick","conference":"SEC"}' http://localhost:8770/

The `?api=` / `?fid=` params are **test-only seams**; on MFL the injected
`franchise_id` global wins and no such params exist.

## 3. Apps Script engine (deploy the project, run in the editor)
After starting a draft on a **scratch** conference, run from the editor
(Run → function → View → Logs):
- `TEST_DEVY_SkipMakeupFlow("SEC")` — drives skip → owed → grace-gated auto-pick
  and logs `CyclePhase` / `Status_<CONF>` transitions.
- `TEST_DEVY_Feed("5")` — dumps the exact JSON the widget will receive.

## 4. Endpoint (web-app deploy)
`…/exec?feed=devy&fid=0005&nocache=1` in a browser; POST actions with `curl`
(text/plain body) exactly like the mock calls above but against the `/exec` URL.
Verify a not-on-the-clock `pick` is rejected and a retention after finalize is
refused.

## 5. Bot (live)
With `DEVY_WEBAPP_URL` set and the bot running: make one pick via `/devy pick`
and one via the widget — Discord should show the **same** on-the-clock message
for both, once each. Let a clock expire (short `PickDeadlineHours`) and confirm
the watcher posts the skip + advances.
