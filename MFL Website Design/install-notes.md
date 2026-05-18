# CFFB Page Enhancer — MFL Install Notes

## Prerequisites

1. **Advanced Editor must be OFF.**
   In your MFL league settings, set **"Use Advanced Editor on league type-in boxes?"** to **No**.
   The advanced (WYSIWYG) editor mangles `<script>` tags and will break the installation.

2. **mfl-custom.css must already be loaded.**
   The CSS should be in an earlier home page message (e.g., Message 01) wrapped in a `<style>` tag.
   The enhancer script depends on classes defined in that stylesheet.

## Installation

### Step 1 — CSS (if not already installed)

Paste the contents of `mfl-custom.css` into an **earlier** home page message (e.g., **Message 01**):

```html
<style>
/* paste entire contents of mfl-custom.css here */
</style>
```

### Step 2 — Enhancer script

Paste the contents of `mfl-page-enhancer.js` into a **later** home page message (e.g., **Message 02** or **Message 03**):

```html
<script>
/* paste entire contents of mfl-page-enhancer.js here */
</script>
```

The message number does not matter as long as:
- The CSS message loads **before** the script message
- The script is in a message that is displayed on **all** MFL pages (not restricted to the home page only)

### jQuery

**Not required.** The script is pure vanilla JavaScript with no dependencies.
MFL loads jQuery on its pages, but this script does not use it and will not conflict with it.

## What it does

On each MFL page load, the script:

1. Detects the page type from the URL (roster, auction, player profile, free agent report)
2. Finds the cells containing encoded contract/eligibility strings
3. Parses each string (e.g., `BC_SR_r22_A1`) into structured data
4. Replaces the raw text with styled badge/chip components
5. Watches for AJAX updates (especially on auction pages) and re-enhances new content

The script is **idempotent** — running it multiple times or on already-enhanced pages is safe.
It **never** modifies table row structure, only cell content.

## Disabling the script

To disable the enhancer without removing it:

**Option A — Quick disable:**
Add this line to the **beginning** of the script message, before the `<script>` tag:

```html
<script>window.__CFFB_ENHANCER_LOADED = true;</script>
```

This sets the guard flag that prevents the enhancer from running.

**Option B — Remove entirely:**
Delete the contents of the home page message containing the `<script>` tag.
The page will revert to showing raw encoded strings.

**Option C — Disable per page type:**
In the script, find the `getPageType()` function and comment out the page type
you want to skip. For example, to disable auction enhancement:

```js
// if (/[?&]O=43\b/.test(search) || path.indexOf("/auction") >= 0) return "auction";
```

## Ownership Reconciliation

The script reconciles encoded string ownership against MFL's live roster data:

- **Roster pages:** MFL says the player is on franchise X's roster. The team tag
  for each copy reflects this. If the encoded string disagrees, the MFL value is
  used for rendering (MFL is the source of truth for current ownership).

- **Free agent pages:** MFL says the player is a free agent. If the encoded string
  claims a rostered owner, MFL's "FA" value is used for the team tag.

- **Auction / profile pages:** MFL ownership can't be reliably determined from the
  page context. The encoded string's owner is used as a fallback.

### Drift indicators (commissioner-only)

When the commissioner is logged in, small colored dots appear after the team tag
where the encoded string's owner disagrees with MFL's current data:

| Dot color | Class | Meaning |
|-----------|-------|---------|
| Red | `ownership-drift--dropped` | Encoded says rostered, MFL says FA |
| Green | `ownership-drift--picked-up` | Encoded says FA, MFL says rostered |
| Blue | `ownership-drift--traded` | Encoded says team A, MFL says team B |
| Gray | `ownership-fallback` | MFL ownership couldn't be determined |

Hover over any dot for a detailed tooltip explaining the mismatch.

Regular league members never see drift indicators.

### Commissioner detection

The script detects commissioner status via (any one is sufficient):
1. `franchise_id === '0000'` (MFL's commissioner pseudo-franchise)
2. Presence of the `commissioner_setup` link in navigation
3. Welcome text containing "Commissioner"

### Console audit: `cfbAudit()`

Open the browser console (F12) on any enhanced page and run:

```js
cfbAudit()
```

Returns a structured report of all ownership drift on the current page:

```js
{
  dropped:   [{ player, copy, encodedOwner, mflOwner: "FA" }, ...],
  pickedUp:  [{ player, copy, encodedOwner: "FA", mflOwner }, ...],
  traded:    [{ player, copy, encodedOwner, mflOwner }, ...],
  fallback:  [{ player, copy, encodedOwner, reason }, ...],
  summary:   { totalPlayers, totalDrift, lastChecked }
}
```

- `copy` is 1 or 2 (each copy is reported independently)
- Works regardless of viewer role (commissioner or owner)
- Re-scans the page each time it's called, so it picks up AJAX updates
- Use on the roster page for the most useful drift data

## Troubleshooting

- **Raw strings still showing:** Check browser console for `[CFFB]` warnings. Common causes:
  - CSS not loaded (badges render but look unstyled)
  - Script loaded before DOM is ready (should not happen — the script handles this)
  - MFL changed their page structure (check for `data-parse-error` attributes on cells)

- **Page looks broken:** Disable the script using Option A above. The script only
  modifies cell content, so removing it restores the original page.

- **Auction page not enhanced:** The auction page has no dedicated contract cells.
  The script extracts encoded strings from the player link's `title` attribute and
  injects badges inline. If MFL changes the title format, this will silently fail
  (no breakage, just no badges).

- **Unknown team code:** If a new team is added to the league, the team tag will
  render with default styling (dark background, light text) instead of school colors.
  Add the team to the `TEAM_COLORS` object in the script to fix.
