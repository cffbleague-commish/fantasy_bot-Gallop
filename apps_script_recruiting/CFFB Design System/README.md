# CFFB Design System

**Product:** CFFB — College Fantasy Football League
**Category:** Fantasy college football recruiting auction analytics
**Aesthetic:** Premium sports broadcast — College Football Playoff–inspired, dark mode, championship-gold accents
**Stack:** Streamlit (Python) with custom HTML injection

CFFB is an analytics app for fantasy college football recruiting auctions. Its three core jobs:

1. **Track live auction activity** — a live ticker of bids and nominations across the league.
2. **Predict player pricing** — surface fair-value estimates from 3yr historical bid data.
3. **Grade recruiting classes** — assign letter grades to drafted classes against league + historical benchmarks.

The product is for fantasy managers who treat draft night like a televised event. The UI leans into that: broadcast lower-thirds, ticker tape, KPI tiles, and the championship-gold-on-black contrast lifted from CFP National Championship graphics.

> **No CFP trademarks.** The aesthetic is inspiration-only. No actual CFP logos, wordmarks, or trademarked assets are used.

---

## Source materials

- **`assets/league-banner.png`** — provided by the user. The canonical league banner: championship trophy + COLLEGE FANTASY FOOTBALL wordmark + EST. 2021, on torn black-and-gold paper. **This is the source-of-truth visual identity.**
- Detailed brief: color palette, type, component list, density references (ESPN GameDay, 247sports, On3, DraftKings live odds).
- No codebase or Figma file attached. All component implementations are designer-built from the brief, ready for Streamlit injection.

---

## Index

| File / folder | What's in it |
|---|---|
| `README.md` | This file. Context, content rules, visual foundations, iconography. |
| `SKILL.md` | Skill manifest for Claude / Claude Code agents. |
| `colors_and_type.css` | Color + type CSS variables + element styles. Inject once at app start. |
| `assets/` | League banner + generated marks. |
| `fonts/` | Font reference (Google Fonts substitutions — see Caveats). |
| `components/` | Streamlit-injection-ready HTML+CSS snippets (one per component). |
| `preview/` | Design-system preview cards. |
| `ui_kits/auction-app/` | Interactive React UI kit of the four core screens. |

---

## CONTENT FUNDAMENTALS

CFFB's voice is **broadcast color-commentary, not announcer play-by-play.** It assumes the user knows the sport and wants confident, opinionated information delivered fast.

### Tone
- **Confident, never hedging.** "Overpaid by $14." not "may be slightly overpaid."
- **Numerical and specific.** Numbers carry the message. Adjectives are garnish.
- **Insider, not exclusionary.** Uses "RB1," "SEC," "snipe," "stash" without explaining.
- **Dry wit, sparing.** Maybe one zinger per page. Never on a metric, always on flavor copy.

### Person
- **Second person ("you") for actions.** "You're $40 under cap." "Your RB room is thin."
- **Third person for the league + other managers.** "Tyler nominated Quinn Ewers."
- **First-person plural ("we") only in onboarding / help.** "We pulled in your 2024 history."

### Casing
- **TITLE CASE** for screen titles and section headers in broadcast surfaces (live auction, scoreboard). Mimics on-air lower-thirds.
- **Sentence case** for body copy, settings, dialogs.
- **ALL CAPS** reserved for: live indicators (`LIVE`, `ON THE CLOCK`), small eyebrow labels (`POSITION RANK`), tag chips. Tracked +10% to +14% in CSS.
- Player names: always as written, e.g. "Arch Manning," "Jeremiah Smith." No nicknames in product chrome.

### Numbers + money
- Bids are dollars with no decimals: `$47`, `$112`. Never `$47.00`.
- Deltas use signed prefix + color: `+$14` (green), `−$8` (red, true minus sign U+2212), `±$0` (neutral).
- Grades are letter+sign: `A+`, `B−`. No numeric scores in user-facing surfaces.
- Percentages always include the symbol: `82%` not `82 percent`.
- **All numerics use `font-variant-numeric: tabular-nums`** so dollar columns and stat lines line up.

### Examples (do)
- "Quinn Ewers — RB1 ceiling, QB1 floor. Worth a $52 swing."
- "You're paying $14 over projection. Walk."
- "Class of '26: B+. Strong at WR, light at OT."
- "ON THE CLOCK · Tyler · 0:08"

### Examples (don't)
- ~~"This player might be a good value pick for your team!"~~ — hedgy, vague.
- ~~"You went a little over budget 😅"~~ — no emoji, no apology.
- ~~"Let's explore your draft results together."~~ — handholding, plural.

### Emoji + symbols
- **No emoji in product chrome.** Ever.
- Unicode symbols are fine where they're meaningful: `▲` `▼` for deltas, `●` for live, `★` for stars, `↗` for trending, `—` for nulls/empty, `·` for inline separator.

---

## VISUAL FOUNDATIONS

**Stadium-at-night, gold-on-black.** Matte black canvas. Hard edges. Cold neutrals. One warm hit — championship gold — used as honest signal and reserved for hero values.

### Color

**Surfaces** (darkest → lightest):

| Var | Hex | Use |
|---|---|---|
| `--bg-canvas` | `#0A0A0A` | True matte black. The canvas. |
| `--bg-surface` | `#141414` | Cards, panels, primary surfaces. |
| `--bg-surface-elev` | `#1C1C1C` | KPI tiles, popovers, elevated surfaces. |
| `--bg-surface-hover` | `#1F1F1F` | Row hover state. |
| `--border` | `#2A2A2A` | Hairline borders. |

**Text:**

| Var | Hex | Use |
|---|---|---|
| `--fg-primary` | `#F5F5F5` | Warm white. Headings, KPI values, body. |
| `--fg-secondary` | `#9A9A9A` | Labels, metadata, sub-rows. |
| `--fg-tertiary` | `#5A5A5A` | Captions, disabled, empty states. |

**Championship Gold system:**

| Var | Hex | Use |
|---|---|---|
| `--gold` | `#C9A227` | Flat brassy gold. Active states, accents. |
| `--gold-light` | `#E8C547` | Top of metallic gradient. |
| `--gold-dark` | `#8B6F1F` | Bottom of metallic gradient. |
| `--gold-gradient` | `linear-gradient(135deg, #E8C547 0%, #C9A227 50%, #8B6F1F 100%)` | **Used sparingly** — maximum 1–2 elements per page, reserved for the page's most important hero value. |

**Star tiers:** 5★ `#C9A227` gold · 4★ `#3B82C4` deep blue · 3★ `#7BA4C9` light blue · 2★ `#6A6A6A` neutral.

**Grade scale** (desaturated to harmonize with gold): A `#2D7A4E` · B `#4A9968` · C `#C9A227` · D/F `#B84545`. A-tier badges use the metallic gold gradient.

**Value deltas:** + `#2D7A4E` green · − `#B84545` brick red.

**Live indicator:** pulsing green dot `#2D7A4E` with thin gold metallic ring rotating around it.

**Conferences** (signature accents, desaturated): SEC `#C9A227` · B1G `#4A6FA5` · ACC `#8B4A5C` · Big 12 `#B84545` · Pac `#5C7A6A` · AAC `#6B5C8B` · Mtn West `#8B6F1F` · IND `#5A5A5A`.

No purple. No pastels. No corporate teal. No emoji.

### Type
- **Display: Saira Condensed** (600 / 700). H1, H2, large KPI values, hero player/team names. Wide condensed geometric sans, visually adjacent to CFP's "Video" typeface.
- **Body: Inter** (400 / 500 / 600). Body text, tables, labels, buttons.
- All numerics use `font-variant-numeric: tabular-nums`.

### Spacing
- **8px base unit.** All padding and margins are multiples of 8 (4px allowed for tight inline gaps only).
- Scale: 8 · 16 · 24 · 32 · 40 · 48 · 64 · 80.

### Backgrounds
- Default: solid `--bg-canvas` `#0A0A0A`. Not gradient.
- Hero / marketing surfaces: solid black with a barely-there grain overlay (optional 4% noise).
- **No** stock photography of football fields. **No** glassy gradients. **No** glassmorphic blur cards.

### Borders + corners
- Borders are `1px solid var(--border)` `#2A2A2A`.
- Corner radii: `2px` chips, `4px` inputs/buttons, `8px` cards, `12px` sheets/modals. **Never larger than 12px.**
- Buttons get a `inset 0 1px 0 rgba(255,255,255,0.06)` highlight for a metallic top edge.

### Shadows
- Most surfaces sit flat with a border, no shadow.
- `--shadow-sm`: `0 1px 2px rgba(0,0,0,0.5)` — menus, popovers.
- `--shadow-md`: `0 8px 24px rgba(0,0,0,0.6)` — modals.
- `--shadow-glow-gold`: `0 0 24px rgba(201,162,39,0.28)` — premium emphasis only, sparingly.
- `--shadow-glow-live`: `0 0 12px rgba(45,122,78,0.55)` — live indicator dot.

### Animation
- **Snappy and confident.** 120–180ms for state changes, 240ms max for layout. Ease-out is `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- **Live dot pulses** at 1.4s intervals — only the `●` dot.
- **Live ring rotates** at 4s linear infinite, with the inner dot counter-rotating so it stays still.
- **Ticker** scrolls linearly (60s full loop).
- No bounces. No springy overshoot. No page transitions.

### Hover states
- **Buttons:** `filter: brightness(1.08)`. No transform.
- **Cards / rows:** background tints to `--bg-surface-hover` `#1F1F1F`, plus a 2px gold left-border slides in via `transform: scaleY(0 → 1)`.
- **Links:** underline appears.

### Press / active states
- Brief darken (60ms). No scale transform.

### Transparency + blur
- Used sparingly. Modal backdrops use a `rgba(10,10,10,0.86)` scrim with `backdrop-filter: blur(8px)` — but the modal itself is solid `--bg-surface-elev`.
- Ticker edges fade out via a linear gradient mask so items appear to slide off the broadcast.

### Imagery
- Player photos (when licensed): cool-toned, high contrast, slight desaturation. Chest-up.
- **Team logos are NOT bundled** (licensing). The `TeamLogo` component renders a circular chip with the team's primary color + 2–4 letter abbreviation.

### Cards
- Flat. `var(--bg-surface)` background, `1px solid var(--border)` border, `8px` radius. No shadow by default.
- Hero/featured cards add a `3px` gold-gradient top border.
- Active player row gets a `2px` gold left-border indicator.

### Layout rules + fixed elements
- **Top bar** (64px) is sticky.
- **Live ticker** (44px) is sticky under the top bar.
- Page content is centered, max width 1440px, 24px gutters.
- Density is broadcast-tight (16–20px card padding), not airy.

---

## ICONOGRAPHY

CFFB uses **Lucide** stroke icons as its primary icon system. Stroke icons read cleanly on the matte black canvas without fighting the broadcast-graphic chrome.

- **Default size:** 20px in UI, 24px in headers, 16px inline.
- **Stroke weight:** 1.75px (slightly heavier than Lucide default 2px to feel more "broadcast graphic").
- **Color:** inherits `currentColor`. Usually `--fg-secondary` `#9A9A9A`, primary on emphasis.
- **No emoji.** Anywhere.
- **No solid/filled icons.** Stroke only.

**Loading Lucide in Streamlit:**
```html
<script src="https://unpkg.com/lucide@latest"></script>
<i data-lucide="search"></i>
<script>lucide.createIcons();</script>
```

### Unicode symbols in chrome

| Symbol | Use | Notes |
|---|---|---|
| `●` | Live dot | Always paired with green color + pulse animation |
| `▲` `▼` | Delta arrows | Color matches direction (green / red) |
| `★` | Recruiting stars | Tier-colored fill |
| `↗` | Trending up | In subtle gold |
| `—` | Empty / null | Tertiary text color |
| `·` | Inline separator | In metadata rows |
| `−` | Minus sign | Use U+2212 not hyphen-minus; aligns with `+` width |

### Generated brand marks
The SVGs in `assets/` (`cffb-mark.svg`, `cffb-logo.svg`, `cffb-wordmark.svg`) are **generated placeholders** built to harmonize with the canonical banner. They use the metallic gold gradient. Replace if the brand has official compact-format variants.

---

## Caveats + asks

- **Display font is a Google Fonts substitution.** Saira Condensed is the closest free analog to the heavy condensed display face in the league banner — but the banner's actual face looks even heavier (closer to Knockout, Druk Wide, or a custom Anton-like cut). **If you have the licensed banner typeface, share the `.woff2` files** and we'll swap.
- **Body font is Inter.** Per the brief.
- **No screenshots / Figma / codebase** were attached. The component library and UI kit are best-guess interpretations of the brief + the canonical banner. If real product surfaces (Streamlit screenshots or the existing custom HTML) exist, share them and we'll rebuild against the real source of truth.
- **Generated compact marks** (`cffb-mark.svg`, `cffb-logo.svg`, `cffb-wordmark.svg`) are stand-ins. The league banner is the canonical visual identity.
- **Team logos and player photos are not bundled** — licensing. Placeholders are typographic abbreviations on team primary color.
